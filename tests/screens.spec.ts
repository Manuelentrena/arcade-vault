import { expect, test, type Locator, type Page } from "@playwright/test";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "biblioteca", path: "/biblioteca" },
  { name: "detalle", path: "/juego/tetrix" },
  { name: "reproductor", path: "/jugar/tetrix" },
  { name: "auth", path: "/auth" },
  { name: "salon", path: "/salon" },
  { name: "acerca", path: "/acerca" },
] as const;

/**
 * Una IP distinta por envío. El endpoint sólo acepta 3 cada 10 minutos por IP,
 * y entre los dos proyectos la suite hace más que eso contra el mismo servidor.
 */
function freshIp(): string {
  const octet = () => Math.floor(Math.random() * 256);
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** Las fuentes de next/font cambian el layout al cargar: esperarlas evita capturas inestables. */
async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Las portadas en imagen van con loading="lazy" y el carril del home está
  // bajo el pliegue: sin forzarlas, sólo empiezan a cargar cuando la captura
  // fullPage desplaza la página, y la referencia sale unas veces con foto y
  // otras con el hueco vacío.
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((img) => {
        img.loading = "eager";
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      }),
    ),
  );
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((img) => img.decode().catch(() => {})),
    ),
  );
}

/**
 * Espera a que React hidrate el home. Un clic sobre un `Link` que llega antes
 * se pierde: React ya intercepta el evento pero el router todavía no navega, y
 * la prueba se queda en `/`. `armed` la añade useReveal al montar, así que es
 * la señal más barata de que el árbol ya es interactivo.
 */
async function hydrated(page: Page) {
  await expect(page.locator(".reveal.armed").first()).toBeAttached();
}

/**
 * La navegación de cliente del App Router no cambia la URL hasta que llega la
 * respuesta RSC. Con la suite en paralelo contra un solo `next start`, los 5s
 * por defecto se quedan cortos de vez en cuando.
 */
const NAV_TIMEOUT = 15_000;

/**
 * Deja una sección del home quieta antes de clicar dentro. Al entrar en
 * pantalla recorre 24px en 600ms, y un clic lanzado a mitad de camino aterriza
 * al lado del enlace: `transform: none` es el final de esa transición.
 */
async function settled(section: Locator) {
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveCSS("transform", "none");
}

/** Secciones del home que siguen ocultas: la captura y el usuario esperan 0. */
async function hiddenReveals(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll(".reveal")).filter(
        (el) => getComputedStyle(el).opacity !== "1",
      ).length,
  );
}

/**
 * Quita la clase `armed` que useReveal pone en las secciones del home. Sin
 * esto la captura `fullPage` sale en negro de la mitad hacia abajo: lo que
 * nunca llegó a entrar en pantalla sigue en `opacity: 0`.
 */
async function disarmReveal(page: Page) {
  await page.evaluate(() => {
    document
      .querySelectorAll(".reveal")
      .forEach((el) => el.classList.remove("armed"));
  });
}

function scoreOf(text: string): number {
  return Number(text.replace(/\D/g, ""));
}

/** Credenciales del usuario que siembra supabase/seed.sql. */
const SEED_EMAIL = "px_kai@vault.test";
const SEED_PASSWORD = "arcade-vault-test";

/**
 * Espera a que React monte el formulario de /auth.
 *
 * El HTML del servidor ya trae el `<form>`, así que un clic anterior a la
 * hidratación dispara el envío nativo del navegador: la página recarga, no
 * pasa nada y la prueba se queda en /auth. Cambiar de pestaña sólo lo sabe
 * hacer React, así que ver aparecer el campo Usuario es la prueba de que el
 * árbol ya es interactivo.
 */
async function authReady(page: Page) {
  await page.getByRole("button", { name: "CREAR CUENTA" }).click();
  await expect(page.getByLabel("Usuario")).toBeVisible();
  await page.getByRole("button", { name: "INICIAR SESIÓN" }).click();
  await expect(page.getByLabel("Usuario")).toBeHidden();
}

async function signIn(page: Page, next = "/biblioteca") {
  await page.goto(next === "/biblioteca" ? "/auth" : `/auth?next=${next}`);
  await authReady(page);
  await page.getByLabel("Correo electrónico").fill(SEED_EMAIL);
  await page.getByLabel("Contraseña").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "ENTRAR AL VAULT" }).click();
  await expect(page).toHaveURL(next, { timeout: NAV_TIMEOUT });
}

/**
 * Entra como invitado: una sesión anónima de Supabase, sin correo ni
 * contraseña. `next` es la ruta a la que debe aterrizar, que `playAsGuest`
 * saca de `?next=` igual que el envío del formulario.
 */
async function playAsGuest(page: Page, next = "/biblioteca") {
  await page.goto(next === "/biblioteca" ? "/auth" : `/auth?next=${next}`);
  await authReady(page);
  await page.getByRole("button", { name: "JUGAR COMO INVITADO" }).click();
  await expect(page).toHaveURL(next, { timeout: NAV_TIMEOUT });
}

/** Mailpit: el buzón del stack local. Sin límite de envíos y sin salir de la máquina. */
const MAILPIT = "http://127.0.0.1:54324";

/**
 * Sufijo único por prueba. Los dos proyectos corren en paralelo contra la
 * misma base: sin esto, el segundo encontraría el nombre ya ocupado.
 */
function unique(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Enlace de confirmación del último correo dirigido a `email`.
 * Se busca por destinatario, no "el último mensaje": el otro proyecto puede
 * estar registrando a la vez.
 */
async function confirmationLink(page: Page, email: string): Promise<string> {
  const search = `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;

  const id = await expect
    .poll(
      async () => {
        const response = await page.request.get(search);
        const body = await response.json();
        return (body.messages?.[0]?.ID as string | undefined) ?? "";
      },
      { timeout: 20_000, message: `Mailpit no recibió nada para ${email}` },
    )
    .not.toBe("")
    .then(() => page.request.get(search))
    .then((response) => response.json())
    .then((body) => body.messages[0].ID as string);

  const message = await page.request.get(`${MAILPIT}/api/v1/message/${id}`);
  const html = (await message.json()).HTML as string;
  const href = /href="([^"]+)"/.exec(html)?.[1];
  expect(href, "el correo trae enlace de confirmación").toBeTruthy();
  return href!.replace(/&amp;/g, "&");
}

test.describe("capturas de referencia", () => {
  for (const route of ROUTES) {
    test(`${route.name} coincide con su captura`, async ({ page }) => {
      if (route.name === "reproductor") {
        // /jugar/[id] está detrás del proxy: sin sesión la captura saldría
        // del formulario de acceso.
        await signIn(page);
      }
      await page.goto(route.path);
      await ready(page);
      if (route.name === "home" || route.name === "acerca") {
        await disarmReveal(page);
      }

      if (route.name === "reproductor") {
        // Se captura en pausa, el estado con más interfaz visible.
        await expect(page.locator(".tetris-board")).toBeVisible();
        await page.getByRole("button", { name: "PAUSA" }).click();
        await expect(
          page.getByRole("button", { name: "REANUDAR" }),
        ).toBeVisible();
        // fullPage como el resto: al clicar PAUSA, Playwright puede desplazar el
        // botón hasta la vista, y una captura de viewport heredaría ese scroll.
        await expect(page).toHaveScreenshot(`${route.name}.png`, {
          animations: "disabled",
          fullPage: true,
        });
        return;
      }

      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        animations: "disabled",
        fullPage: true,
        // El home mide casi 4000px: cada captura tarda, y los 5s por defecto no
        // dan para las dos tomas iguales que Playwright exige.
        timeout: route.name === "home" ? 30_000 : undefined,
        // ARKANOID y ASTEROIDES sí guardan puntuaciones reales en otras
        // pruebas (SPEC 18); en paralelo no hay forma de saber si esta
        // captura corre antes o después de esa escritura, así que su "MEJOR
        // PUNTUACIÓN" se enmascara en vez de fijar la captura a un orden.
        // TETRIX se deja fuera a propósito: ninguna prueba le guarda nada, así
        // que su tarjeta sigue en "—" siempre y no hace falta enmascararla.
        mask:
          route.name === "biblioteca"
            ? [
                page
                  .locator(".card", { hasText: "ASTEROIDES" })
                  .locator(".score-badge"),
                page
                  .locator(".card", { hasText: "ARKANOID" })
                  .locator(".score-badge"),
              ]
            : undefined,
      });
    });
  }
});

test.describe("home", () => {
  test("pinta las siete secciones", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1.home-title")).toContainText("EL ARCADE");
    await expect(page.locator(".feature-card")).toHaveCount(4);
    await expect(page.locator(".mini-card")).toHaveCount(3);
    await expect(page.locator(".stat-block")).toHaveCount(3);
    await expect(page.locator(".tick-row")).toHaveCount(7);
    await expect(page.locator(".top-row")).toHaveCount(5);
    await expect(page.locator(".faq-item")).toHaveCount(3);
    await expect(page.locator(".home-final")).toBeVisible();
  });

  test("el carril enlaza al detalle de cada juego", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const first = page.locator(".mini-card").first();
    await expect(first).toHaveAttribute("href", "/juego/tetrix");
    await settled(page.locator(".home-section", { has: first }));
    await first.click();
    await expect(page).toHaveURL("/juego/tetrix", {
      timeout: NAV_TIMEOUT,
    });
  });

  test("EXPLORAR JUEGOS lleva a la biblioteca", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await page.getByRole("link", { name: /EXPLORAR JUEGOS/ }).click();
    await expect(page).toHaveURL("/biblioteca", { timeout: NAV_TIMEOUT });
  });

  test("VER SALÓN lleva al salón de la fama", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    const link = page.getByRole("link", { name: /VER SALÓN/ });
    await settled(page.locator(".home-section", { has: link }));
    await link.click();
    await expect(page).toHaveURL("/salon", { timeout: NAV_TIMEOUT });
  });

  test("un salto al final no deja secciones invisibles", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // El observador no avisa de lo que pasó de "debajo" a "encima" sin
    // intersectar: el hook lo compensa barriendo las secciones rebasadas.
    await expect.poll(() => hiddenReveals(page)).toBe(0);
  });
});

test.describe("home sin animación de entrada", () => {
  // Las dos rutas por las que useReveal no llega a ocultar nada.
  test.describe("sin JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("todas las secciones se ven", async ({ page }) => {
      await page.goto("/");
      expect(await hiddenReveals(page)).toBe(0);
    });
  });

  test.describe("con prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("todas las secciones se ven", async ({ page }) => {
      await page.goto("/");
      await ready(page);
      expect(await hiddenReveals(page)).toBe(0);
    });
  });
});

test.describe("biblioteca", () => {
  test("muestra los 3 juegos", async ({ page }) => {
    await page.goto("/biblioteca");
    await expect(page.locator(".card")).toHaveCount(3);
    await expect(page.locator(".cover-bg")).toHaveCount(3);
  });

  test("el buscador filtra por nombre", async ({ page }) => {
    await page.goto("/biblioteca");
    await page.getByLabel("Buscar un juego por nombre").fill("tet");
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(page.locator(".card .title")).toHaveText("TETRIX");
  });

  test("una búsqueda sin resultados muestra el estado vacío", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.getByLabel("Buscar un juego por nombre").fill("tetzzz");
    await expect(page.locator(".card")).toHaveCount(0);
    await expect(page.getByText("NO HAY RESULTADOS")).toBeVisible();
  });

  test("el chip SHOOTER muestra ASTEROIDES con su captura", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "SHOOTER" }).click();
    await expect(page.locator(".card .title")).toHaveText(["ASTEROIDES"]);

    // Su portada es la captura real, no el dibujo CSS de respaldo.
    const cover = page
      .locator(".card", { hasText: "ASTEROIDES" })
      .locator(".cover-bg");
    await expect(cover).toHaveClass(/cover-shot/);
    await expect(cover).toHaveAttribute("src", /asteroides\.png/);
  });

  test("el chip PUZZLE deja un solo juego", async ({ page }) => {
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "PUZZLE" }).click();
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(page.locator(".card .title")).toHaveText("TETRIX");
  });

  test("la tarjeta navega al detalle y el botón atrás vuelve", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.locator(".card", { hasText: "ASTEROIDES" }).click();
    await expect(page).toHaveURL("/juego/asteroides");
    await page.goBack();
    await expect(page).toHaveURL("/biblioteca");
    await expect(page.locator(".card")).toHaveCount(3);
  });
});

test.describe("detalle", () => {
  test("muestra la ficha y el estado vacío de puntuaciones", async ({
    page,
  }) => {
    await page.goto("/juego/tetrix");
    await expect(page.locator("h2")).toHaveText("TETRIX");
    await expect(page.locator(".detail-tags span")).toHaveCount(4);
    await expect(page.locator(".stat-strip > div")).toHaveCount(3);
    // Nadie ha jugado todavía: sin filas, con el mensaje de estado vacío.
    await expect(page.locator(".lb-row")).toHaveCount(0);
    await expect(page.getByText("AÚN NADIE HA JUGADO")).toBeVisible();
  });

  test("un id desconocido devuelve 404", async ({ page }) => {
    const response = await page.goto("/juego/no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("PANTALLA NO ENCONTRADA")).toBeVisible();

    // ROCAS pasó a ser ASTEROIDES en la SPEC 14: su id ya no existe.
    const viejo = await page.goto("/juego/rocas");
    expect(viejo?.status()).toBe(404);
  });
});

test.describe("reproductor", () => {
  /** Un hard drop en TETRIX puntúa al instante: sirve para llegar a FIN con algo. */
  async function scoreSomething(page: Page) {
    await page.keyboard.press("Space");
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    await expect
      .poll(async () => scoreOf(await score.innerText()))
      .toBeGreaterThan(0);
  }

  /**
   * ARKANOID, no TETRIX: esta prueba guarda de verdad en `scores` (SPEC 18) y
   * las capturas de referencia dependen de que TETRIX y el salón (su pestaña
   * por defecto) sigan vacíos durante toda la suite. El nivel 1 es el relleno
   * completo y el saque determinista, así que un solo `Space` puntúa siempre.
   *
   * Solo en desktop: desktop y mobile comparten la misma base y la misma
   * cuenta semilla (PX_KAI); si los dos proyectos jugaran ARKANOID a la vez,
   * el que puntuara menos no superaría la marca que acaba de guardar el otro
   * y GUARDAR PUNTUACIÓN nunca aparecería. No es una diferencia de viewport.
   */
  test("FIN abre el modal y la primera puntuación se guarda como récord", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "compite por la misma cuenta y el mismo juego que desktop",
    );
    await signIn(page);
    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".ark-board")).toBeVisible();
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    await page.keyboard.press("Space");
    await expect
      .poll(async () => scoreOf(await score.innerText()), { timeout: 15000 })
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "FIN" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator("h2")).toHaveText("FIN DEL JUEGO");

    // El nombre no se edita: es el de la sesión y se pinta tal cual.
    await expect(modal.locator("input")).toHaveCount(0);
    await expect(modal.locator(".modal-player .v")).toHaveText("PX_KAI");

    // Primera vez que PX_KAI juega ARKANOID en esta base: sin marca previa,
    // cuenta como récord y save_score inserta de verdad en `scores`.
    await modal.getByRole("button", { name: "GUARDAR PUNTUACIÓN" }).click();
    await expect(page.locator(".toast-saved")).toContainText(
      "¡NUEVA MARCA PERSONAL!",
    );

    // Verificación de extremo a extremo: la ficha ya lee esa fila real.
    await page.goto("/juego/arkanoid");
    await expect(page.locator(".lb-row").first()).toContainText("PX_KAI");
  });

  test("JUGAR DE NUEVO reinicia la partida", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    await scoreSomething(page);
    await page.getByRole("button", { name: "FIN" }).click();
    await page.getByRole("button", { name: "JUGAR DE NUEVO" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");
    await expect(page.getByRole("button", { name: "PAUSA" })).toBeVisible();
  });

  test("un id desconocido devuelve 404", async ({ page }) => {
    // Con sesión: sin ella el proxy redirige a /auth antes de llegar al 404.
    await signIn(page);
    const response = await page.goto("/jugar/no-existe");
    expect(response?.status()).toBe(404);

    const viejo = await page.goto("/jugar/rocas");
    expect(viejo?.status()).toBe(404);
  });
});

test.describe("fin de partida como invitado", () => {
  test("el modal pide entrar y lleva a /auth con la puntuación", async ({
    page,
  }) => {
    await playAsGuest(page, "/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    await page.keyboard.press("Space");
    await expect
      .poll(async () =>
        scoreOf(
          await page.locator(".hud-stat").nth(1).locator(".v").innerText(),
        ),
      )
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "FIN" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Ni input de nombre ni guardado directo: primero hay que tener cuenta.
    await expect(modal.locator("input")).toHaveCount(0);
    await expect(modal.locator(".modal-player .v")).toHaveText("INVITADO");
    await expect(
      modal.getByRole("button", { name: "GUARDAR PUNTUACIÓN" }),
    ).toHaveCount(0);
    await expect(modal.locator(".guest-save p")).toContainText("invitado");

    await modal
      .getByRole("button", { name: "INICIAR SESIÓN PARA GUARDAR" })
      .click();

    // La partida viaja en el `next` para volver a la misma pantalla con ella.
    await expect(page).toHaveURL(
      /\/auth\?next=%2Fjugar%2Ftetrix%3Fpuntuacion%3D\d+%26nivel%3D\d+/,
      { timeout: NAV_TIMEOUT },
    );
  });

  /**
   * ASTEROIDES, no TETRIX: esta prueba autoguarda de verdad en `scores`
   * (SPEC 18); TETRIX se deja intacto para las capturas de referencia y para
   * no competir por el mismo récord con la prueba de ARKANOID de arriba. La
   * partida recuperada no necesita el motor real: solo la query de la URL.
   *
   * La puntuación es aleatoria, no fija: desktop y mobile comparten cuenta y
   * base, y con un valor fijo el proyecto que corriera segundo encontraría su
   * propio "récord" ya batido por el primero (empate, no supera). Al azar la
   * probabilidad de que coincidan es despreciable — mismo espíritu que
   * `unique()` para los correos de las pruebas de alta.
   */
  test("al volver con sesión, una partida récord se autoguarda de verdad", async ({
    page,
  }) => {
    const puntuacion = 10_000 + Math.floor(Math.random() * 900_000);
    const formateada = puntuacion.toLocaleString("es-ES");

    // Con sesión de verdad: el helper signIn() no codifica `next`, así que la
    // vuelta se reproduce navegando directamente a la URL que /auth entrega.
    await signIn(page);
    await page.goto(`/jugar/asteroides?puntuacion=${puntuacion}&nivel=3`);

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".final")).toHaveText(formateada);
    // Primera vez que PX_KAI juega ASTEROIDES: sin marca previa, se
    // autoguarda como récord sin que el jugador pulse nada.
    await expect(page.locator(".toast-saved")).toContainText(
      `¡NUEVA MARCA PERSONAL! ${formateada}`,
    );

    // Verificación de extremo a extremo: la ficha ya lee esa fila real.
    await page.goto("/juego/asteroides");
    await expect(page.locator(".lb-row").first()).toContainText("PX_KAI");
  });
});

test.describe("tetrix", () => {
  /**
   * TETRIX es el único juego con motor real, así que aquí no se congela el
   * reloj ni se filtra ningún intervalo: el bucle necesita requestAnimationFrame
   * vivo. Nada de lo que se afirma depende de qué pieza salga.
   */
  async function openTetrix(page: Page) {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
  }

  test("arranca con el tablero, la pieza siguiente y la cruceta", async ({
    page,
  }) => {
    await openTetrix(page);

    await expect(
      page.getByRole("img", { name: "Tablero de TETRIX" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Pieza siguiente" }),
    ).toBeVisible();

    // El HUD es el común a todos los juegos: una vida, nivel 01, 0 puntos.
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.lives .v")).toHaveText("♥");
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");

    // Los cinco botones están dentro de la pantalla; la pausa no.
    await expect(page.locator(".crt-screen .tetris-pad .btn")).toHaveCount(4);
    await expect(page.locator(".crt-screen .pad-drop")).toBeVisible();
    await expect(page.locator(".tetris-side .l")).toHaveText([
      "MOVIMIENTO",
      "BAJAR",
      "SIGUIENTE",
    ]);
    for (const label of [
      "Rotar la pieza",
      "Mover a la izquierda",
      "Mover a la derecha",
      "Bajar más rápido",
      "Caída instantánea",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(page.locator(".crt-screen").first()).toHaveClass(/tetris/);
  });

  test("el hard drop puntúa y no desplaza la página", async ({ page }) => {
    await openTetrix(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    await expect(score).toHaveText("0");

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Space");

    // +2 por celda recorrida: el valor exacto depende de la pieza, el signo no.
    await expect
      .poll(async () => scoreOf(await score.innerText()))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("PAUSA congela la partida", async ({ page }) => {
    await openTetrix(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");

    // Se puntúa antes de pausar para que la comprobación no sea 0 contra 0.
    await page.keyboard.press("Space");
    await expect
      .poll(async () => scoreOf(await score.innerText()))
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "PAUSA" }).click();
    await expect(page.getByText("EN PAUSA")).toBeVisible();

    const pausado = scoreOf(await score.innerText());
    await page.keyboard.press("Space");
    await page.waitForTimeout(1000);
    expect(scoreOf(await score.innerText())).toBe(pausado);
  });
});

test.describe("asteroides", () => {
  /**
   * El segundo juego con motor real. Como en tetrix, aquí no se congela el
   * reloj: el bucle necesita requestAnimationFrame vivo. El campo se genera al
   * azar, así que nada de lo que se afirma depende de dónde caiga una roca.
   */
  async function openAsteroides(page: Page) {
    await signIn(page);
    await page.goto("/jugar/asteroides");
    await expect(page.locator(".rocks-field")).toBeVisible();
  }

  test("arranca con el campo, los mandos y la leyenda", async ({ page }) => {
    await openAsteroides(page);

    await expect(
      page.getByRole("img", { name: "Campo de ASTEROIDES" }),
    ).toBeVisible();

    // El HUD es el común a todos los juegos: una vida, nivel 01, 0 puntos.
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.lives .v")).toHaveText("♥");
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");

    // Los cuatro botones están dentro de la pantalla; la pausa no.
    await expect(page.locator(".crt-screen .rocks-pad .btn")).toHaveCount(3);
    await expect(page.locator(".crt-screen .pad-fire")).toBeVisible();
    await expect(page.locator(".rocks-side .l")).toHaveText([
      "MOVIMIENTO",
      "DISPARO",
      "OBJETOS",
    ]);
    for (const label of [
      "Empujar",
      "Girar a la izquierda",
      "Girar a la derecha",
      "Disparar",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }

    // La leyenda de objetos, con una entrada por cada uno de los dos.
    await expect(page.locator(".rocks-legend li")).toHaveCount(2);
    await expect(page.locator(".rocks-legend .d")).toHaveText([
      "TRIPLE",
      "ESCUDO",
    ]);

    await expect(page.locator(".crt-screen").first()).toHaveClass(/rocks/);
  });

  test("disparar no desplaza la página", async ({ page }) => {
    await openAsteroides(page);

    const scrollBefore = await page.evaluate(() => window.scrollY);
    // Mantener la tecla: el disparo es un estado, no un flanco.
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    await page.keyboard.up("Space");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    // Y las flechas tampoco, que son las que mueven la nave.
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp"]) {
      await page.keyboard.press(key);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("PAUSA congela la partida", async ({ page }) => {
    await openAsteroides(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");

    await page.getByRole("button", { name: "PAUSA" }).click();
    await expect(page.getByText("EN PAUSA")).toBeVisible();

    // Con el bucle parado la puntuación no se mueve, se dispare o no.
    const pausado = scoreOf(await score.innerText());
    await page.keyboard.down("Space");
    await page.waitForTimeout(1000);
    await page.keyboard.up("Space");
    expect(scoreOf(await score.innerText())).toBe(pausado);

    await page.getByRole("button", { name: "REANUDAR" }).click();
    await expect(page.getByText("EN PAUSA")).toHaveCount(0);
  });
});

test.describe("arkanoid", () => {
  /**
   * El tercer juego con motor real. Como en tetrix y asteroides, aquí no se
   * congela el reloj: el bucle necesita requestAnimationFrame vivo. El muro del
   * nivel 1 es el relleno completo y el saque es determinista, así que nada de
   * lo que se afirma depende de la suerte ni de cuántos fotogramas pasen.
   */
  async function openArkanoid(page: Page) {
    await signIn(page);
    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".ark-board")).toBeVisible();
  }

  test("arranca con el tablero y los tres mandos", async ({ page }) => {
    await openArkanoid(page);

    await expect(
      page.getByRole("img", { name: "Tablero de ARKANOID" }),
    ).toBeVisible();

    // El HUD es el común a todos los juegos: tres vidas, nivel 01, 0 puntos.
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.lives .v")).toHaveText("♥ ♥ ♥");
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");

    // Los tres mandos están dentro de la pantalla; la pausa no.
    await expect(page.locator(".crt-screen .ark-pad .btn")).toHaveCount(3);
    for (const label of [
      "Mover la pala a la izquierda",
      "Lanzar la bola",
      "Mover la pala a la derecha",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(
      page.locator(".crt-screen").getByRole("button", { name: /PAUSA/ }),
    ).toHaveCount(0);
  });

  test("romper ladrillos puntúa y no desplaza la página", async ({ page }) => {
    await openArkanoid(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    await expect(score).toHaveText("0");

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Space");

    // +10 por ladrillo en el nivel 1: el valor exacto no importa, el signo sí.
    await expect
      .poll(async () => scoreOf(await score.innerText()), { timeout: 15000 })
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("PAUSA congela la partida", async ({ page }) => {
    await openArkanoid(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");

    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "PAUSA" }).click();
    await expect(page.getByText("EN PAUSA")).toBeVisible();

    // Con el bucle parado la puntuación no se mueve.
    const pausado = scoreOf(await score.innerText());
    await page.waitForTimeout(1000);
    expect(scoreOf(await score.innerText())).toBe(pausado);

    await page.getByRole("button", { name: "REANUDAR" }).click();
    await expect(page.getByText("EN PAUSA")).toHaveCount(0);
  });

  test("el HUD es el mismo que el de los otros juegos", async ({ page }) => {
    await signIn(page);

    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".ark-board")).toBeVisible();
    const arkanoid = await page
      .locator(".player-hud .hud-stat .l")
      .allInnerTexts();
    const botonesArkanoid = await page
      .locator(".hud-actions .btn")
      .allInnerTexts();

    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    const tetrix = await page
      .locator(".player-hud .hud-stat .l")
      .allInnerTexts();
    const botonesTetrix = await page
      .locator(".hud-actions .btn")
      .allInnerTexts();

    expect(arkanoid).toEqual(tetrix);
    expect(arkanoid).toHaveLength(4);
    expect(botonesArkanoid).toEqual(botonesTetrix);
    expect(botonesArkanoid).toHaveLength(3);
  });
});

test.describe("auth", () => {
  test("la pestaña CREAR CUENTA añade el usuario", async ({ page }) => {
    await page.goto("/auth");
    // Entrar pide correo y contraseña: el nombre no identifica a nadie en
    // signInWithPassword y resolverlo obligaría a exponer los correos.
    await expect(page.locator(".field")).toHaveCount(2);
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();

    await page.getByRole("button", { name: "CREAR CUENTA" }).click();
    await expect(page.locator(".field")).toHaveCount(3);
    await expect(page.getByLabel("Usuario")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "CREAR Y JUGAR" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "INICIAR SESIÓN" }).click();
    await expect(page.locator(".field")).toHaveCount(2);
  });

  test("un envío incompleto sacude la tarjeta y no sale del navegador", async ({
    page,
  }) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/")) calls.push(request.url());
    });

    await page.goto("/auth");
    await authReady(page);
    await page.getByRole("button", { name: "ENTRAR AL VAULT" }).click();

    await expect(page.locator(".auth-card")).toHaveClass(/shake/);
    expect(calls).toHaveLength(0);
  });

  test("una contraseña incorrecta devuelve el terminal rojo", async ({
    page,
  }) => {
    await page.goto("/auth");
    await authReady(page);
    await page.getByLabel("Correo electrónico").fill(SEED_EMAIL);
    await page.getByLabel("Contraseña").fill("no-es-la-buena");
    await page.getByRole("button", { name: "ENTRAR AL VAULT" }).click();

    await expect(page.locator(".terminal-success.error")).toBeVisible();
    await expect(page.locator(".term-body .success")).toContainText(
      "CORREO O CONTRASEÑA INCORRECTOS",
    );

    // REINTENTAR vuelve al formulario con lo escrito intacto.
    await page.getByRole("button", { name: "REINTENTAR" }).click();
    await expect(page.getByLabel("Correo electrónico")).toHaveValue(SEED_EMAIL);
  });

  test("un nombre ocupado no llega a Supabase", async ({ page }) => {
    const signupCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/signup")) {
        signupCalls.push(request.url());
      }
    });

    await page.goto("/auth");
    await authReady(page);
    await page.getByRole("button", { name: "CREAR CUENTA" }).click();
    // PX_KAI lo siembra supabase/seed.sql.
    await page.getByLabel("Usuario").fill("px_kai");
    await page
      .getByLabel("Correo electrónico")
      .fill(`libre-${unique()}@vault.test`);
    await page.getByLabel("Contraseña").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "CREAR Y JUGAR" }).click();

    await expect(page.locator(".terminal-success.error")).toBeVisible();
    await expect(page.locator(".term-body .success")).toContainText(
      "ESE NOMBRE YA ESTÁ PILLADO",
    );
    expect(signupCalls).toHaveLength(0);
  });

  test("entrar deja la sesión en el Nav y sobrevive a la recarga", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "el control de sesión vive en el panel, ver responsive",
    );

    await signIn(page);
    await expect(page.locator(".auth-btn")).toHaveText("PX_KAI ▾");

    await page.reload();
    await expect(page.locator(".auth-btn")).toHaveText("PX_KAI ▾");
  });

  test("cerrar sesión deja el Nav sin usuario y la recarga no lo resucita", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "el control de sesión vive en el panel, ver responsive",
    );

    await signIn(page);
    await page.locator(".auth-btn").click();

    await expect(page.locator(".auth-btn")).toHaveText("Iniciar Sesión");
    await page.reload();
    await expect(page.locator(".auth-btn")).toHaveText("Iniciar Sesión");
  });

  test("JUGAR COMO INVITADO abre sesión anónima", async ({ page }) => {
    await playAsGuest(page);

    // El trigger le pone un username técnico (INV…) que no debe verse: el Nav
    // pinta INVITADO por displayName().
    await expect(page.locator(".auth-btn").first()).toHaveText("INVITADO ▾");
  });

  test("el invitado entra en /jugar sin pasar por el formulario", async ({
    page,
  }) => {
    await page.goto("/jugar/tetrix");
    await expect(page).toHaveURL("/auth?next=%2Fjugar%2Ftetrix");

    await authReady(page);
    await page.getByRole("button", { name: "JUGAR COMO INVITADO" }).click();

    // Vuelve al juego que pidió, no a la biblioteca.
    await expect(page).toHaveURL("/jugar/tetrix", {
      timeout: NAV_TIMEOUT,
    });
    await expect(page.locator(".auth-btn").first()).toHaveText("INVITADO ▾");
    // El HUD del reproductor sale del mismo displayName().
    await expect(page.locator(".hud-stat").first().locator(".v")).toHaveText(
      "INVITADO",
    );
  });

  test("la sesión de invitado sobrevive a la recarga y se puede cerrar", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "el control de sesión vive en el panel, ver responsive",
    );

    await playAsGuest(page);
    await page.reload();
    await expect(page.locator(".auth-btn")).toHaveText("INVITADO ▾");

    await page.locator(".auth-btn").click();
    await expect(page.locator(".auth-btn")).toHaveText("Iniciar Sesión");
  });

  test("/jugar sin sesión manda a /auth y vuelve al juego al entrar", async ({
    page,
  }) => {
    await page.goto("/jugar/tetrix");
    await expect(page).toHaveURL("/auth?next=%2Fjugar%2Ftetrix");

    await authReady(page);
    await page.getByLabel("Correo electrónico").fill(SEED_EMAIL);
    await page.getByLabel("Contraseña").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "ENTRAR AL VAULT" }).click();

    await expect(page).toHaveURL("/jugar/tetrix", {
      timeout: NAV_TIMEOUT,
    });
  });

  test("las demás rutas siguen abiertas sin sesión", async ({ page }) => {
    for (const route of ROUTES.filter((r) => r.name !== "reproductor")) {
      const response = await page.goto(route.path);
      expect(response?.status(), route.path).toBe(200);
      await expect(page).toHaveURL(route.path);
    }
  });
});

test.describe("registro por correo", () => {
  test("el enlace de Mailpit confirma la cuenta y deja dentro", async ({
    page,
  }) => {
    const tag = unique();
    const username = `nv_${tag}`.slice(0, 10);
    const email = `${username}@vault.test`;

    await page.goto("/auth");
    await authReady(page);
    await page.getByRole("button", { name: "CREAR CUENTA" }).click();
    await page.getByLabel("Usuario").fill(username);
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "CREAR Y JUGAR" }).click();

    const terminal = page.locator(".terminal-success");
    await expect(terminal).toBeVisible();
    await expect(terminal).not.toHaveClass(/error/);
    await expect(page.locator(".term-body .success")).toContainText(
      "REVISA TU CORREO",
    );

    // El enlace lleva a /auth/confirm, que canjea el token y monta la sesión.
    await page.goto(await confirmationLink(page, email));
    await expect(page).toHaveURL("/biblioteca", { timeout: NAV_TIMEOUT });
    await expect(page.locator(".auth-btn, .panel-user").first()).toContainText(
      username.toUpperCase(),
    );
  });
});

test.describe("salón de la fama", () => {
  test("muestra los chips y el estado vacío", async ({ page }) => {
    await page.goto("/salon");
    // Nadie ha jugado todavía: sin podio, con el mensaje de estado vacío.
    await expect(page.locator(".podium-slot")).toHaveCount(0);
    await expect(page.locator(".hall-tabs .chip")).toHaveCount(3);
    await expect(page.getByText("AÚN NADIE HA JUGADO")).toBeVisible();
  });

  test("cambiar de juego cambia la pestaña activa", async ({ page }) => {
    await page.goto("/salon");
    await page.getByRole("button", { name: "ASTEROIDES" }).click();
    await expect(
      page.getByRole("button", { name: "ASTEROIDES" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "TETRIX" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("con sesión aparece TU MEJOR MARCA", async ({ page }) => {
    await signIn(page);
    await page.goto("/salon");

    await expect(page.locator(".tr.you-label")).toContainText(
      "TU MEJOR MARCA EN",
    );
    // PX_KAI no tiene ninguna puntuación real todavía.
    await expect(page.locator(".tr.you")).toContainText("AÚN NO HAS JUGADO");
  });
});

test.describe("acerca", () => {
  test("pinta las dos mitades de la página", async ({ page }) => {
    await page.goto("/acerca");
    await expect(page.locator(".highlight")).toHaveCount(3);
    await expect(page.locator(".div-pixels span")).toHaveCount(24);
    await expect(page.locator(".contact-tips .tip")).toHaveCount(3);
    await expect(page.locator(".contact-form")).toBeVisible();
  });

  test("un envío vacío sacude el formulario y no sale del navegador", async ({
    page,
  }) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/contacto")) calls.push(request.url());
    });

    await page.goto("/acerca");
    // El rechazo local lo hace React: un clic anterior a la hidratación envía
    // el formulario de verdad y nunca pinta la sacudida.
    await hydrated(page);
    await page.getByRole("button", { name: /ENVIAR MENSAJE/ }).click();

    await expect(page.locator(".contact-form")).toHaveClass(/shake/);
    expect(calls).toHaveLength(0);
  });

  test("un envío válido devuelve el terminal", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
    await page.goto("/acerca");

    await page.getByLabel("NOMBRE").fill("px_kai");
    await page.getByLabel("CORREO ELECTRÓNICO").fill("jugador@vault.gg");
    await page
      .getByLabel("MENSAJE")
      .fill("Propongo añadir un clon de Pang al catálogo.");
    await page.getByRole("button", { name: /ENVIAR MENSAJE/ }).click();

    await expect(page.locator(".terminal-success")).toBeVisible();
    await expect(page.locator(".term-body .success")).toContainText("PX_KAI");
  });

  test("el honeypot no es enfocable con Tab", async ({ page }) => {
    await page.goto("/acerca");
    await page.getByLabel("MENSAJE").focus();
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(
      () => document.activeElement?.className ?? "",
    );
    expect(focused).not.toContain("contact-hp");
  });
});

test.describe("endpoint de contacto", () => {
  const send = (data: Record<string, string>) => ({
    data,
    headers: { "x-forwarded-for": freshIp() },
  });

  test("sin campos responde 400", async ({ request }) => {
    const response = await request.post("/api/contacto", send({}));
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  test("con el honeypot relleno responde 200 sin enviar", async ({
    request,
  }) => {
    const response = await request.post(
      "/api/contacto",
      send({
        name: "bot",
        email: "bot@spam.example",
        msg: "compra seguidores baratos",
        website: "http://spam.example",
      }),
    );
    expect(response.status()).toBe(200);
    // Sin `simulated`: ni siquiera llegó a la parte del envío.
    expect(await response.json()).toEqual({ ok: true });
  });

  test("con datos válidos y sin clave responde en modo simulado", async ({
    request,
  }) => {
    const response = await request.post(
      "/api/contacto",
      send({
        name: "px_kai",
        email: "jugador@vault.gg",
        msg: "Propongo añadir un clon de Pang al catálogo.",
        website: "",
      }),
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true, simulated: true });
  });
});

test.describe("responsive", () => {
  test("la hamburguesa abre y cierra el menú", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await page.goto("/biblioteca");
    const panel = page.locator(".av-mobile-panel");
    await expect(panel).not.toHaveClass(/open/);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(panel).toHaveClass(/open/);

    await page.getByRole("button", { name: "Cerrar menú" }).click();
    await expect(panel).not.toHaveClass(/open/);
  });

  test("el menú de escritorio se oculta en móvil", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await page.goto("/biblioteca");
    await expect(page.locator(".av-nav .links")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Abrir menú" }),
    ).toBeVisible();
  });

  test("la barra móvil deja sólo logo y hamburguesa", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await page.goto("/biblioteca");
    await expect(page.locator(".av-nav .auth-btn")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Abrir menú" }),
    ).toBeVisible();
  });

  test("el logo ocupa una sola línea", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await page.goto("/biblioteca");
    await ready(page);

    // Un único rectángulo de cliente = el texto no ha partido en dos líneas.
    const rects = await page
      .locator(".av-nav .logo-text")
      .evaluate((el) => el.getClientRects().length);
    expect(rects).toBe(1);
  });

  test("sin sesión el panel lleva a /auth", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await page.goto("/biblioteca");
    const panel = page.locator(".av-mobile-panel");
    await page.getByRole("button", { name: "Abrir menú" }).click();

    await panel.getByRole("link", { name: "INICIAR SESIÓN" }).click();
    await expect(page).toHaveURL("/auth");
    await expect(panel).not.toHaveClass(/open/);
  });

  test("con sesión el panel cierra sesión", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await signIn(page);
    const panel = page.locator(".av-mobile-panel");
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(panel.locator(".panel-user")).toHaveText("PX_KAI");

    await panel.getByRole("button", { name: "CERRAR SESIÓN" }).click();
    await expect(panel).not.toHaveClass(/open/);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(
      panel.getByRole("link", { name: "INICIAR SESIÓN" }),
    ).toBeVisible();

    // La sesión vive en cookies: una recarga no puede resucitarla.
    await page.reload();
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(
      panel.getByRole("link", { name: "INICIAR SESIÓN" }),
    ).toBeVisible();
  });

  test("el panel llama INVITADO al invitado", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo aplica al proyecto mobile");

    await playAsGuest(page);
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(page.locator(".av-mobile-panel .panel-user")).toHaveText(
      "INVITADO",
    );
  });

  for (const route of ROUTES) {
    test(`${route.name} no provoca scroll horizontal`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "solo aplica al proyecto mobile");

      if (route.name === "reproductor") await signIn(page);
      await page.goto(route.path);
      await ready(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
