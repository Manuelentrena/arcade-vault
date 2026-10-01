import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  HEIGHT,
  PADDLE_W,
  WIDEN_PER_PICK,
  createState,
  serve,
  setPaddleX,
  step,
  type ArkanoidState,
} from "../lib/arkanoid";
import {
  DIRS,
  createState as crearSerpiente,
  enqueueDir,
  enqueueTurn,
  start as arrancarSerpiente,
  step as pasoSerpiente,
  tickMs,
} from "../lib/serpiente";

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

/**
 * Termina una partida de ARKANOID de verdad. Desde la SPEC 22 no hay ningún
 * botón que mate la partida —`FIN` pasó a ser `MENÚ`, que es reanudable—, así
 * que el único camino al panel de fin es quedarse sin vidas.
 *
 * ARKANOID es el juego donde eso es determinista y corto: con la pala quieta,
 * el saque de 30° no vuelve nunca a ella y cada bola se pierde a los 3,6s, así
 * que las tres vidas se agotan en unos 11s con 30 puntos en el marcador. Cada
 * vida nueva vuelve al saque, y el saque lo pide el jugador: de ahí el Space
 * repetido. No se toca la pala a propósito.
 *
 * SPEC 24 no cambia este tiempo: con la pala quieta y centrada, el ladrillo
 * que rompe cada vida cae siempre en una columna fuera de su rango en x (se
 * verificó simulando el módulo puro en Node contra 500 partidas), así que
 * ningún premio llega a recogerse y la secuencia es la misma de siempre.
 */
async function loseArkanoid(page: Page) {
  const panel = page.getByRole("dialog");
  await expect(page.locator(".ark-board")).toBeVisible();
  await expect
    .poll(
      async () => {
        if (await panel.isVisible()) return true;
        await page.keyboard.press("Space");
        return false;
      },
      { timeout: 45_000, intervals: [500] },
    )
    .toBe(true);
}

/**
 * Localiza la cabeza de SERPIENTE leyendo los píxeles del lienzo.
 *
 * Hace falta porque SERPIENTE es el único de los cinco motores que avanza sin
 * que nadie pulse nada: «la huella del canvas cambió» no prueba que una tecla
 * haya llegado al motor, porque cambia igual. El **rumbo** sí lo prueba, y la
 * cabeza se puede aislar por color sin tocar el estado del motor.
 *
 * `components/serpiente-game.tsx` pinta la cabeza con el cian del tema más un
 * velo blanco al 45 %, así que es el único elemento con el rojo (R) y el
 * verde (G) altos a la vez: el cuerpo lleva el cian sin velo (R ≈ 0) y la
 * fruta es el magenta del logo (G ≈ 0). De ahí el umbral — sigue valiendo sin
 * tocarlo: son los canales de color, no el nombre del token, los que importan.
 */
async function cabezaSerpiente(page: Page): Promise<{
  fila: number;
  col: number;
}> {
  return page.locator("canvas.snake-board").evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin contexto 2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 60 && data[i + 1] > 150) {
        const p = i / 4;
        sx += p % canvas.width;
        sy += Math.floor(p / canvas.width);
        n++;
      }
    }
    if (n === 0) throw new Error("cabeza no encontrada en el lienzo");

    // 20 × 15 celdas, con el lienzo escalado por devicePixelRatio.
    return {
      col: Math.floor(sx / n / (canvas.width / 20)),
      fila: Math.floor(sy / n / (canvas.height / 15)),
    };
  });
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
    await expect(page.locator(".mini-card")).toHaveCount(5);
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
    // getGames() ordena por created_at y desempata por slug (spec-21-debt):
    // arkanoid, asteroides, buscaminas, tetrix — alfabético entre los tres
    // que comparten fecha de migración.
    await expect(first).toHaveAttribute("href", "/juego/arkanoid");
    await settled(page.locator(".home-section", { has: first }));
    await first.click();
    await expect(page).toHaveURL("/juego/arkanoid", {
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
  test("muestra los 5 juegos", async ({ page }) => {
    await page.goto("/biblioteca");
    await expect(page.locator(".card")).toHaveCount(5);
    await expect(page.locator(".cover-bg")).toHaveCount(5);
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

  test("el chip ARCADE muestra ARKANOID y SERPIENTE", async ({ page }) => {
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "ARCADE" }).click();
    await expect(page.locator(".card")).toHaveCount(2);
    // Orden de getGames(): created_at y, en empate, slug. SERPIENTE llega en
    // una migración posterior, así que va detrás de ARKANOID.
    await expect(page.locator(".card .title")).toHaveText([
      "ARKANOID",
      "SERPIENTE",
    ]);

    // Su portada es la captura real, no el dibujo CSS de respaldo.
    const cover = page
      .locator(".card", { hasText: "SERPIENTE" })
      .locator(".cover-bg");
    await expect(cover).toHaveClass(/cover-shot/);
    await expect(cover).toHaveAttribute("src", /serpiente\.png/);
  });

  test("el chip PUZZLE muestra TETRIX y BUSCAMINAS", async ({ page }) => {
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "PUZZLE" }).click();
    await expect(page.locator(".card")).toHaveCount(2);
    await expect(page.locator(".card .title")).toHaveText([
      "TETRIX",
      "BUSCAMINAS",
    ]);
  });

  test("la tarjeta navega al detalle y el botón atrás vuelve", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.locator(".card", { hasText: "ASTEROIDES" }).click();
    await expect(page).toHaveURL("/juego/asteroides");
    await page.goBack();
    await expect(page).toHaveURL("/biblioteca");
    await expect(page.locator(".card")).toHaveCount(5);
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
  /** Un hard drop en TETRIX puntúa al instante: sirve para abrir el panel con algo. */
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
  test("quedarse sin vidas abre el panel y la primera puntuación se guarda como récord", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "compite por la misma cuenta y el mismo juego que desktop",
    );
    // Perder las tres vidas cuesta ~11s de reloj real: sin esto el margen que
    // queda para el guardado y la vuelta a la ficha es demasiado justo.
    test.slow();
    await signIn(page);
    await page.goto("/jugar/arkanoid");
    await loseArkanoid(page);

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.locator("h2")).toHaveText("FIN DEL JUEGO");
    // El panel vive dentro del tubo, no encima de la página (SPEC 22).
    await expect(page.locator(".crt-screen .crt-menu")).toHaveCount(1);
    await expect(page.locator(".modal-bd")).toHaveCount(0);
    // Con la partida terminada no hay vuelta: CONTINUAR no existe en ningún
    // estado del panel, y aquí tampoco el botón que lo abriría.
    await expect(panel.getByRole("button", { name: "CONTINUAR" })).toHaveCount(
      0,
    );

    // El nombre no se edita ni se repite: ya está en el HUD, no en el panel.
    await expect(panel.locator("input")).toHaveCount(0);
    await expect(page.locator(".player-hud .hud-stat.player .v")).toHaveText(
      "PX_KAI",
    );

    // Primera vez que PX_KAI juega ARKANOID en esta base: sin marca previa,
    // cuenta como récord y save_score inserta de verdad en `scores`.
    await panel.getByRole("button", { name: "GUARDAR PUNTUACIÓN" }).click();
    await expect(page.locator(".toast-saved")).toContainText(
      "¡NUEVA MARCA PERSONAL!",
    );

    // Verificación de extremo a extremo: la ficha ya lee esa fila real.
    await page.goto("/juego/arkanoid");
    await expect(page.locator(".lb-row").first()).toContainText("PX_KAI");
  });

  test("REINICIAR reinicia la partida", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    await scoreSomething(page);
    await page.getByRole("button", { name: "MENÚ", exact: true }).click();
    await page.getByRole("button", { name: "REINICIAR" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");
    await expect(page.getByRole("button", { name: "PAUSA" })).toBeVisible();
  });

  /**
   * SPEC 22: MENÚ es un interruptor, no un `FIN` con otro nombre. Abrirlo
   * congela la partida y volver a pulsarlo la devuelve entera — por eso el
   * panel no tiene CONTINUAR.
   */
  test("MENÚ abre y cierra el panel sin costar la partida", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    await scoreSomething(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    const antes = scoreOf(await score.innerText());

    const menu = page.getByRole("button", { name: "MENÚ", exact: true });
    await menu.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.locator("h2")).toHaveText("MENÚ");
    await expect(panel.getByRole("button", { name: "CONTINUAR" })).toHaveCount(
      0,
    );

    await menu.click();
    await expect(panel).toBeHidden();
    expect(scoreOf(await score.innerText())).toBe(antes);
  });

  test("con la partida viva el panel no ofrece ninguna forma de guardar", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    await scoreSomething(page);
    await page.getByRole("button", { name: "MENÚ", exact: true }).click();

    const panel = page.locator(".crt-menu");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "GUARDAR PUNTUACIÓN" }),
    ).toHaveCount(0);
    await expect(panel.locator(".guest-save")).toHaveCount(0);
    await expect(panel.locator(".no-record")).toHaveCount(0);
    await expect(panel.locator(".toast-saved")).toHaveCount(0);
    // Y las dos únicas opciones son las mismas que en el fin de partida.
    await expect(panel.locator(".crt-menu-actions > *")).toHaveText([
      "REINICIAR",
      "SALIR",
    ]);
  });

  test("Esc cierra el menú pero no el fin de partida", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Esc es un atajo de teclado, no del mando");
    test.slow(); // la segunda mitad pierde una partida de ARKANOID entera
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();

    const panel = page.getByRole("dialog");
    await page.getByRole("button", { name: "MENÚ", exact: true }).click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // El fin de partida no se descarta con una tecla: debajo no hay partida.
    await page.goto("/jugar/arkanoid");
    await loseArkanoid(page);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
  });

  test("PAUSA y MENÚ se excluyen y el que no toca se ve desactivado", async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    // En móvil los dos mandos viven en el mando, no en el HUD (SPEC 21).
    const raiz = isMobile
      ? page.locator(".game-pad")
      : page.locator(".hud-actions");
    const pausa = raiz.getByRole("button", { name: "PAUSA" });
    const menu = raiz.getByRole("button", { name: "MENÚ" });

    await menu.click();
    await expect(pausa).toBeDisabled();
    await menu.click();
    await expect(pausa).toBeEnabled();

    await pausa.click();
    await expect(menu).toBeDisabled();
    await raiz.getByRole("button", { name: "REANUDAR" }).click();
    await expect(menu).toBeEnabled();
  });

  test("un id desconocido devuelve 404", async ({ page }) => {
    // Con sesión: sin ella el proxy redirige a /auth antes de llegar al 404.
    await signIn(page);
    const response = await page.goto("/jugar/no-existe");
    expect(response?.status()).toBe(404);

    const viejo = await page.goto("/jugar/rocas");
    expect(viejo?.status()).toBe(404);
  });

  /**
   * SPEC 19, y desde la SPEC 22 en los dos viewports: la pantalla completa no
   * solo quita la barra del navegador de móvil, también el nav y el pie, y el
   * tubo gana ese alto igual en escritorio. Vive en `.hud-actions`, a la
   * derecha de MENÚ. No se fuerza una entrada real: la API depende de un gesto
   * de usuario y de una pantalla real, y su comportamiento en Chromium
   * headless es menos fiable que el resto de la suite.
   */
  test("el botón de pantalla completa existe en los dos viewports", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(
      page.getByRole("button", { name: "Activar pantalla completa" }),
    ).toBeVisible();
  });

  /**
   * SPEC 23: `.av-player` carga `user-select: none` entero, no un listado por
   * contenedor. Se comprueba con `getComputedStyle`, no con un intento de
   * selección real: Playwright no reproduce el gesto del dedo que abre el
   * menú de copiar de iOS, que es lo que el riesgo de la spec deja escrito
   * como no verificable aquí — eso se hace a mano.
   */
  test("el reproductor entero no se puede seleccionar", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();

    for (const selector of [".player-hud", ".screen-stats", ".crt-bottom"]) {
      const valor = await page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).userSelect);
      expect(valor, selector).toBe("none");
    }
  });
});

test.describe("fin de partida como invitado", () => {
  test("el panel pide entrar y lleva a /auth con la puntuación", async ({
    page,
  }) => {
    test.slow(); // perder las tres vidas de ARKANOID cuesta ~11s
    // ARKANOID y no TETRIX: un invitado no guarda nada, así que no compite por
    // ningún récord, y aquí hace falta un fin de partida de verdad — desde la
    // SPEC 22 ningún botón mata la partida.
    await playAsGuest(page, "/jugar/arkanoid");
    await loseArkanoid(page);

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.locator("h2")).toHaveText("FIN DEL JUEGO");

    // Ni input de nombre ni guardado directo: primero hay que tener cuenta.
    await expect(panel.locator("input")).toHaveCount(0);
    // El nombre ya no se repite en el panel: vive en el HUD, y de un invitado
    // se pinta INVITADO, nunca su nombre técnico.
    await expect(panel.locator(".modal-player")).toHaveCount(0);
    await expect(page.locator(".player-hud .hud-stat.player .v")).toHaveText(
      "INVITADO",
    );
    await expect(
      panel.getByRole("button", { name: "GUARDAR PUNTUACIÓN" }),
    ).toHaveCount(0);
    await expect(panel.locator(".guest-save p")).toHaveText(
      "Inicia sesión para guardar esta puntuación.",
    );

    await panel
      .getByRole("button", { name: "INICIAR SESIÓN PARA GUARDAR" })
      .click();

    // La partida viaja en el `next` para volver a la misma pantalla con ella.
    await expect(page).toHaveURL(
      /\/auth\?next=%2Fjugar%2Farkanoid%3Fpuntuacion%3D\d+%26nivel%3D\d+/,
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

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".final")).toHaveText(formateada);
    // Vuelve en estado fin de partida, dentro del tubo.
    await expect(page.locator(".crt-screen .crt-menu h2")).toHaveText(
      "FIN DEL JUEGO",
    );
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
    isMobile,
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

    // En escritorio los cinco botones están dentro de la pantalla; la pausa no.
    // En móvil bajan al mando de consola (SPEC 21) y dentro del tubo sólo
    // queda SIGUIENTE, que es estado del juego y no un control.
    await expect(page.locator(".crt-screen .tetris-pad .btn")).toHaveCount(4);
    await expect(page.locator(".crt-screen .pad-drop")).toBeVisible({
      visible: !isMobile,
    });
    await expect(page.locator(".tetris-side .tetris-next")).toBeVisible();
    if (!isMobile) {
      await expect(page.locator(".tetris-side .l")).toHaveText([
        "MOVIMIENTO",
        "BAJAR",
        "SIGUIENTE",
      ]);
    }
    // Los rótulos son los mismos en los dos viewports: en escritorio los lleva
    // la columna del tubo y en móvil el mando, que hereda cada aria-label.
    // `.first()` a propósito: desde SPEC 23 "Rotar la pieza" lo llevan dos
    // teclas del mando de móvil a la vez (▲ y B), y aquí sólo importa que el
    // rótulo exista en pantalla, no cuántas veces.
    for (const label of [
      "Rotar la pieza",
      "Mover a la izquierda",
      "Mover a la derecha",
      "Bajar más rápido",
      "Caída instantánea",
    ]) {
      await expect(
        page.getByRole("button", { name: label }).first(),
      ).toBeVisible();
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

  test("arranca con el campo, los mandos y la leyenda", async ({
    page,
    isMobile,
  }) => {
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

    // En escritorio los cuatro botones están dentro de la pantalla; la pausa
    // no. En móvil la columna entera —mandos y leyenda— se va al mando de
    // consola (SPEC 21) y el campo recupera el 4 : 3 del tubo.
    await expect(page.locator(".crt-screen .rocks-pad .btn")).toHaveCount(3);
    await expect(page.locator(".crt-screen .pad-fire")).toBeVisible({
      visible: !isMobile,
    });
    if (!isMobile) {
      await expect(page.locator(".rocks-side .l")).toHaveText([
        "MOVIMIENTO",
        "DISPARO",
        "OBJETOS",
      ]);
    }
    for (const label of [
      "Empujar",
      "Girar a la izquierda",
      "Girar a la derecha",
      "Disparar",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }

    // La leyenda de objetos, con una entrada por cada uno de los dos. Sólo en
    // escritorio: en móvil no existe ni en el mando ni en ninguna otra parte,
    // porque el lienzo ya dibuja los dos objetos cuando aparecen (SPEC 21).
    await expect(page.locator(".rocks-legend li")).toHaveCount(2);
    if (!isMobile) {
      await expect(page.locator(".rocks-legend .d")).toHaveText([
        "TRIPLE",
        "ESCUDO",
      ]);
    } else {
      await expect(page.locator(".rocks-legend")).toBeHidden();
    }

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

  test("arranca con el tablero y los tres mandos", async ({
    page,
    isMobile,
  }) => {
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

    // En escritorio los tres mandos están dentro de la pantalla; la pausa no.
    // En móvil la fila entera baja al mando de consola (SPEC 21).
    await expect(page.locator(".crt-screen .ark-pad .btn")).toHaveCount(3);
    await expect(page.locator(".crt-screen .ark-pad")).toBeVisible({
      visible: !isMobile,
    });
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

  test("el HUD es el mismo que el de los otros juegos", async ({
    page,
    isMobile,
  }) => {
    await signIn(page);

    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".ark-board")).toBeVisible();
    const arkanoid = await page
      .locator(".player-hud .hud-stat .l")
      .allInnerTexts();
    const botonesArkanoid = await page
      .locator(".hud-actions .btn:visible")
      .allInnerTexts();

    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    const tetrix = await page
      .locator(".player-hud .hud-stat .l")
      .allInnerTexts();
    const botonesTetrix = await page
      .locator(".hud-actions .btn:visible")
      .allInnerTexts();

    await page.goto("/jugar/buscaminas");
    await expect(page.locator(".minas-board")).toBeVisible();
    const buscaminas = await page
      .locator(".player-hud .hud-stat .l")
      .allInnerTexts();
    const botonesBuscaminas = await page
      .locator(".hud-actions .btn:visible")
      .allInnerTexts();

    await page.goto("/jugar/serpiente");
    await expect(page.locator(".snake-board")).toBeVisible();
    const serpiente = await page
      .locator(".player-hud .hud-stat .l")
      .allInnerTexts();
    const botonesSerpiente = await page
      .locator(".hud-actions .btn:visible")
      .allInnerTexts();

    expect(arkanoid).toEqual(tetrix);
    expect(arkanoid).toEqual(buscaminas);
    expect(arkanoid).toEqual(serpiente);
    expect(arkanoid).toHaveLength(4);
    expect(botonesArkanoid).toEqual(botonesTetrix);
    expect(botonesArkanoid).toEqual(botonesBuscaminas);
    expect(botonesArkanoid).toEqual(botonesSerpiente);
    // La fila cambia de contenido con el viewport, no con el juego: en móvil
    // PAUSA y MENÚ bajan al mando (SPEC 21). SALIR salió del HUD y vive en el
    // panel, y ⛶ está ahora en los dos viewports (SPEC 22).
    expect(botonesArkanoid).toEqual(isMobile ? ["⛶"] : ["PAUSA", "MENÚ", "⛶"]);
  });

  test("la banda de leyenda sólo se ve en móvil, con los dos premios", async ({
    page,
    isMobile,
  }) => {
    await openArkanoid(page);
    await expect(page.locator(".screen-legend")).toBeVisible({
      visible: isMobile,
    });
    await expect(page.locator(".screen-legend")).toContainText("BOLA EXTRA");
    await expect(page.locator(".screen-legend")).toContainText("+ PALA");
  });
});

/**
 * SPEC 24 — premios de ARKANOID y motor de multibola, verificados sobre el
 * módulo puro, sin navegador. El motor no tiene ningún otro `Math.random()`
 * fuera de `maybeDropFrom` (el saque y el muro son deterministas), así que
 * sustituirlo aísla por completo la caída de premios del resto de la física.
 */
test.describe("arkanoid — motor de premios y multibola (módulo puro)", () => {
  /**
   * Avanza `state` hasta que `predicate` se cumpla, o falla con un mensaje
   * claro. Llama a `serve()` en cada paso —sin coste si ninguna bola espera—
   * para que una bola nueva tras perder una vida no se quede pegada para
   * siempre esperando un LANZAR que nadie pulsa.
   */
  function runUntil(
    state: ArkanoidState,
    dt: number,
    predicate: (s: ArkanoidState) => boolean,
    label: string,
    maxSteps = 200_000,
  ) {
    for (let i = 0; i < maxSteps; i++) {
      if (predicate(state)) return;
      serve(state);
      step(state, dt);
    }
    throw new Error(`runUntil: "${label}" no se cumplió en ${maxSteps} pasos`);
  }

  test("el premio verde añade una segunda bola sin frenar la primera, y el rojo ensancha la pala", () => {
    const originalRandom = Math.random;
    // Cada tipo elegible suelta premio en cuanto puede: el primer ladrillo
    // roto del nivel 1 suelta los dos a la vez, en el mismo punto —así que
    // una pala colocada debajo recoge los dos juntos.
    Math.random = () => 0;
    try {
      const state = createState(3);
      serve(state);
      const dt = 1 / 120;

      runUntil(state, dt, (s) => s.drops.length >= 2, "los dos premios caen");
      expect(state.drops.map((d) => d.kind).sort()).toEqual(["ball", "paddle"]);

      const firstBall = state.balls[0];
      const widthBefore = state.paddle.w;
      const target = state.drops[0];
      setPaddleX(state, target.x + target.w / 2);
      runUntil(state, dt, (s) => s.drops.length === 0, "se recogen los dos");

      // La bola que ya jugaba sigue jugando: no se ha detenido a esperar.
      expect(state.balls[0]).toBe(firstBall);
      expect(firstBall.serving).toBe(false);
      expect(firstBall.vx !== 0 || firstBall.vy !== 0).toBe(true);

      // La segunda nace pegada a la pala, y la pala ya se ha ensanchado.
      expect(state.balls).toHaveLength(2);
      expect(state.balls[1].serving).toBe(true);
      expect(state.widenings).toBe(1);
      expect(state.paddle.w).toBe(widthBefore + WIDEN_PER_PICK * 2);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("como mucho cae un premio de cada tipo por nivel", () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const state = createState(3);
      serve(state);
      const dt = 1 / 120;

      runUntil(state, dt, (s) => s.drops.length >= 2, "los dos premios caen");
      expect(state.droppedThisLevel).toEqual({ ball: true, paddle: true });

      // Se descartan dejándolos caer al suelo: la oportunidad del nivel se
      // pierde igual que si se hubieran recogido.
      runUntil(
        state,
        dt,
        (s) => s.drops.length === 0,
        "los premios se pierden",
      );

      const scoreBefore = state.score;
      runUntil(
        state,
        dt,
        (s) => s.score > scoreBefore,
        "se rompe otro ladrillo",
      );
      // El dado sigue en 0 —siempre favorable— y aun así no sale nada más.
      expect(state.drops).toHaveLength(0);
    } finally {
      Math.random = originalRandom;
    }
  });

  /**
   * La regla de vidas no depende de cómo se llegó a dos bolas: se construye
   * el escenario en directo —dos bolas en juego y un ensanche acumulado— en
   * vez de esperar a que el dado suelte algo, así la prueba no depende de
   * dónde ande la primera bola en ese instante.
   */
  test("perder una de dos bolas no cuesta vida; perder la última sí, y se pierde un ensanche", () => {
    const state = createState(3);
    state.widenings = 1;
    state.paddle.w = PADDLE_W + 2 * WIDEN_PER_PICK;
    state.balls = [
      { x: 100, y: 300, w: 16, h: 16, vx: 50, vy: 80, serving: false },
      { x: 400, y: 300, w: 16, h: 16, vx: -50, vy: 80, serving: false },
    ];

    const livesBefore = state.lives;
    const widthBefore = state.paddle.w;

    // La segunda bola se manda directa al suelo: no cuesta vida ni ensanche.
    const doomed = state.balls[1];
    doomed.y = HEIGHT + 1;
    step(state, 0.001);

    expect(state.balls).toHaveLength(1);
    expect(state.lives).toBe(livesBefore);
    expect(state.widenings).toBe(1);
    expect(state.paddle.w).toBe(widthBefore);

    // Y ahora la última: sí cuesta vida, se pierde el ensanche y vuelve al
    // saque con una bola nueva.
    const last = state.balls[0];
    last.y = HEIGHT + 1;
    step(state, 0.001);

    expect(state.lives).toBe(livesBefore - 1);
    expect(state.widenings).toBe(0);
    expect(state.paddle.w).toBe(PADDLE_W);
    expect(state.balls).toHaveLength(1);
    expect(state.balls[0].serving).toBe(true);
  });

  test("el tope de bolas y de ensanches no se pasa nunca, jugando sin trucar el dado", () => {
    const state = createState(3);
    serve(state);
    const dt = 1 / 120;

    for (let i = 0; i < 20_000 && !state.over; i++) {
      // Una pala que persigue cualquier premio en caída: el escenario que más
      // presiona los dos topes.
      if (state.drops.length > 0) {
        const target = state.drops[0];
        setPaddleX(state, target.x + target.w / 2);
      }
      serve(state); // lanza cualquier bola que siga esperando saque
      step(state, dt);

      expect(state.balls.length).toBeLessThanOrEqual(2);
      expect(state.widenings).toBeGreaterThanOrEqual(0);
      expect(state.widenings).toBeLessThanOrEqual(3);
      expect(state.lives).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe("buscaminas", () => {
  /**
   * El cuarto juego con motor real. Como en los otros tres, aquí no se
   * congela el reloj: el bucle de repintado necesita requestAnimationFrame
   * vivo, aunque no haya gravedad ni caída automática. Las minas se colocan al
   * azar, pero el primer Espacio/clic nunca puede tocar una: el signo de la
   * puntuación no depende de la suerte. Sin captura del tablero.
   */
  async function openBuscaminas(page: Page) {
    await signIn(page);
    await page.goto("/jugar/buscaminas");
    await expect(page.locator(".minas-board")).toBeVisible();
  }

  test("arranca con la rejilla y los mandos", async ({ page, isMobile }) => {
    await openBuscaminas(page);

    await expect(
      page.getByRole("img", { name: "Rejilla de BUSCAMINAS" }),
    ).toBeVisible();

    // El HUD es el común a todos los juegos: una vida, nivel 01, 0 puntos.
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.lives .v")).toHaveText("♥");
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");

    // Cuatro botones de movimiento más REVELAR y MARCAR; la pausa no vive aquí.
    // En móvil la columna entera baja al mando de consola (SPEC 21).
    await expect(page.locator(".crt-screen .minas-pad .btn")).toHaveCount(4);
    await expect(page.locator(".crt-screen .pad-reveal")).toBeVisible({
      visible: !isMobile,
    });
    await expect(page.locator(".crt-screen .pad-flag")).toBeVisible({
      visible: !isMobile,
    });
    if (!isMobile) {
      await expect(page.locator(".minas-side .l")).toHaveText([
        "MOVIMIENTO",
        "REVELAR",
        "MARCAR",
      ]);
    }
    for (const label of [
      "Mover el cursor arriba",
      "Mover el cursor a la izquierda",
      "Mover el cursor abajo",
      "Mover el cursor a la derecha",
      "Revelar la celda",
      "Marcar con bandera",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(
      page.locator(".crt-screen").getByRole("button", { name: /PAUSA/ }),
    ).toHaveCount(0);
    await expect(page.locator(".crt-screen").first()).toHaveClass(/minas/);
  });

  test("revelar con Espacio puntúa y no desplaza la página", async ({
    page,
  }) => {
    await openBuscaminas(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    await expect(score).toHaveText("0");

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Space");

    // El primer reveal siempre libera al menos la celda pulsada: el signo no
    // depende de dónde caigan las minas.
    await expect
      .poll(async () => scoreOf(await score.innerText()))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("el clic primario revela una celda del tablero", async ({ page }) => {
    await openBuscaminas(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    await expect(score).toHaveText("0");

    await page.locator(".minas-board").click();

    await expect
      .poll(async () => scoreOf(await score.innerText()))
      .toBeGreaterThan(0);
  });

  test("el clic secundario marca bandera sin abrir el menú contextual", async ({
    page,
  }) => {
    await openBuscaminas(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");

    const board = page.locator(".minas-board");
    const box = await board.boundingBox();
    if (!box) throw new Error("El tablero no tiene bounding box");

    // Se escucha el contextmenu ANTES del clic: la promesa resuelve cuando
    // el navegador lo dispare, con el `defaultPrevented` que dejó nuestro
    // listener en el <canvas>.
    const contextmenuPrevented = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          window.addEventListener(
            "contextmenu",
            (event) => resolve(event.defaultPrevented),
            { once: true },
          );
        }),
    );

    // Una celda cerca de la esquina superior izquierda, lejos del cursor
    // inicial (centrado), para no marcar una celda ya revelada por otra prueba.
    await board.click({
      position: { x: box.width * 0.05, y: box.height * 0.05 },
      button: "right",
    });

    expect(await contextmenuPrevented).toBe(true);
    await expect(score).toHaveText("0");
  });

  test("PAUSA congela la partida", async ({ page }) => {
    await openBuscaminas(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");

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

    await page.getByRole("button", { name: "REANUDAR" }).click();
    await expect(page.getByText("EN PAUSA")).toHaveCount(0);
  });

  /**
   * SPEC 23: `toggleFlag()` siempre actualizó `state.flags` bien — el defecto
   * era que el bucle de `requestAnimationFrame` revelaba y marcaba sin pasar
   * por `syncLegend()`, así que la tecla F (como la cruceta y el mando) dejaba
   * el `⚑ 0 / 10` congelado aunque la bandera sí apareciera en el lienzo. El
   * ratón ya pasaba por `act()` y por eso nunca lo tuvo: por eso esta prueba
   * es sólo de escritorio, el camino del mando se cubre aparte.
   */
  test("la tecla F mueve el contador de banderas de la leyenda", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "el camino del mando se prueba aparte");
    await openBuscaminas(page);

    const legend = page.locator(".screen-legend");
    await expect(legend).toContainText("0 / 10");

    await page.keyboard.press("KeyF");
    await expect(legend).toContainText("1 / 10");

    await page.keyboard.press("KeyF");
    await expect(legend).toContainText("0 / 10");
  });
});

/**
 * SPEC 25 — SERPIENTE, quinto motor. Reloj **vivo**: es el motor que más lo
 * necesita de los cinco, porque es el único cuyo estado avanza sin que nadie
 * pulse nada. Sin captura del tablero: la fruta es aleatoria.
 *
 * Por eso casi nada se mide con la huella del lienzo —cambia sola— y casi todo
 * con `cabezaSerpiente()`, que lee el rumbo real del píxel.
 */
test.describe("serpiente", () => {
  test("arranca con un corazón, nivel 01 y la cruceta dentro del tubo", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "la cruceta del tubo sólo se ve por encima de 720px");
    await signIn(page);
    await page.goto("/jugar/serpiente");

    await expect(page.locator(".snake-board")).toBeVisible();
    const hud = page.locator(".player-hud");
    await expect(hud.locator(".hud-stat.score .v")).toHaveText("0");
    await expect(hud.locator(".hud-stat.lives .v")).toHaveText("♥");
    await expect(hud.locator(".hud-stat.level .v")).toHaveText("01");

    await expect(page.locator(".crt-screen .snake-pad .btn")).toHaveCount(4);
    // Ni aquí ni en ningún otro motor hay un control de pausa dentro del tubo.
    await expect(
      page.locator(".crt-screen").getByRole("button", { name: /PAUSA/ }),
    ).toHaveCount(0);
  });

  test("espera quieta al primer giro y entonces ya no se detiene", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/serpiente");
    await expect(page.locator(".snake-board")).toBeVisible();

    // `started` es el serving de SERPIENTE: con la serpiente arrancando en el
    // centro quedan nueve celdas de pista, así que sin esta espera cargar la
    // página consumía una partida en 1,35 s sin tocar nada — y dejaba este
    // bloque entero sin poder llegar a tiempo a ninguna aserción.
    const inicio = await cabezaSerpiente(page);
    await page.waitForTimeout(1_200);
    expect(await cabezaSerpiente(page)).toEqual(inicio);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Y desde el primer giro avanza sola, sin volver a pulsar nada.
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await cabezaSerpiente(page)).fila, { timeout: 5_000 })
      .toBeLessThan(inicio.fila);
  });

  test("girar cambia el rumbo y no desplaza la página", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/serpiente");
    await expect(page.locator(".snake-board")).toBeVisible();

    const { fila } = await cabezaSerpiente(page);
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await cabezaSerpiente(page)).fila, { timeout: 5_000 })
      .toBeLessThan(fila);

    // Las cuatro flechas llevan preventDefault() o jugar desplazaría la página.
    for (const tecla of ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]) {
      await page.keyboard.press(tecla);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("dos giros en el mismo paso no la matan", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/serpiente");
    await expect(page.locator(".snake-board")).toBeVisible();

    // El test de la cola de giros, la regla que la spec llama no negociable.
    // ▲ y ◀ seguidos, sin espera, caen dentro del mismo paso de 150 ms: con
    // una sola ranura el segundo se validaría contra un rumbo que todavía no
    // ha avanzado (→), lo aceptaría como válido, y la serpiente se comería el
    // cuello. Con cola, el segundo se valida contra ▲ y es legal.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(900);

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".player-hud .hud-stat.lives .v")).toHaveText(
      "♥",
    );
    // Los dos giros se aplicaron, en orden: arriba primero y luego izquierda.
    const { fila, col } = await cabezaSerpiente(page);
    expect(fila).toBeLessThan(7);
    expect(col).toBeLessThan(10);
  });

  test("PAUSA congela el lienzo de verdad", async ({ page, isMobile }) => {
    test.skip(isMobile, "en móvil PAUSA vive en el mando, no en el HUD");
    await signIn(page);
    await page.goto("/jugar/serpiente");
    await expect(page.locator(".snake-board")).toBeVisible();

    // Hay que arrancarla primero: quieta, el lienzo tampoco cambiaría sin
    // pausa, y el test no probaría nada.
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "PAUSA" }).click();
    await expect(page.getByText("EN PAUSA")).toBeVisible();

    // Aquí la aserción es más fuerte que en los otros cuatro: sin pausa el
    // lienzo cambiaría solo, así que exigirlo **idéntico** un segundo prueba
    // que el bucle está cancelado, no sólo que el cartel se pintó.
    const huella = () =>
      page
        .locator("canvas.snake-board")
        .screenshot()
        .then((b) => b.toString("base64"));
    const antes = await huella();
    await page.waitForTimeout(1_000);
    expect(await huella()).toBe(antes);

    await page.getByRole("button", { name: "REANUDAR" }).click();
    await expect(page.getByText("EN PAUSA")).toHaveCount(0);
    await expect.poll(huella, { timeout: 5_000 }).not.toBe(antes);
  });
});

/**
 * SPEC 25 — las **reglas** de SERPIENTE, sobre el módulo puro y sin navegador,
 * siguiendo el precedente de `arkanoid — motor de premios y multibola`.
 *
 * Viven aquí y no en el bloque de arriba a propósito. La serpiente avanza sola
 * a 150 ms el paso, así que comprobar desde Playwright que la marcha atrás se
 * descarta, o que comer suma `10 × nivel`, es una carrera contra el reloj del
 * motor: o se conduce a ciegas contra una fruta aleatoria, o se mide después de
 * que la partida haya terminado. Sobre el módulo puro las dos cosas son
 * exactas. El navegador se queda con lo que sólo él puede probar: el cableado,
 * el HUD, la pausa y el mando.
 */
test.describe("serpiente — motor (módulo puro)", () => {
  test("el paso se acorta por nivel y se clava en el suelo", () => {
    expect(tickMs(1)).toBe(150);
    expect(tickMs(2)).toBe(138);
    // 150 − 7 × 12 = 66: el nivel 8 todavía no toca suelo.
    expect(tickMs(8)).toBe(66);
    expect(tickMs(9)).toBe(60);
    expect(tickMs(999)).toBe(60);
  });

  test("nace quieta y arranca con cualquier dirección", () => {
    const s = crearSerpiente(1);
    expect(s.started).toBe(false);
    expect(s.snake).toHaveLength(4);

    const quieta = JSON.stringify(s.snake);
    for (let i = 0; i < 50; i++) pasoSerpiente(s);
    expect(JSON.stringify(s.snake)).toBe(quieta);
    expect(s.over).toBe(false);

    // Incluso el rumbo que ya lleva arranca, aunque la cola lo descarte como
    // giro: arrancar y girar son dos cosas distintas.
    enqueueDir(s, DIRS.right);
    expect(s.started).toBe(true);
    expect(s.dirQueue).toHaveLength(0);
    pasoSerpiente(s);
    expect(s.snake[0]).toEqual({ x: 11, y: 7 });
  });

  test("la marcha atrás se descarta, y la cola nunca pasa de dos", () => {
    const s = crearSerpiente(1);

    enqueueDir(s, DIRS.left); // reversa del rumbo inicial
    expect(s.dirQueue).toHaveLength(0);
    enqueueDir(s, DIRS.right); // el mismo rumbo: tampoco es un giro
    expect(s.dirQueue).toHaveLength(0);

    enqueueDir(s, DIRS.up);
    enqueueDir(s, DIRS.left);
    enqueueDir(s, DIRS.down); // la cola está llena
    expect(s.dirQueue).toHaveLength(2);
  });

  /**
   * La regla no negociable. Con una sola ranura, el segundo giro se validaría
   * contra un `dir` que todavía no ha avanzado (→), lo aceptaría, y la
   * serpiente se comería el cuello. Validado contra el último de la cola (▲),
   * ◀ es legal.
   */
  test("dos giros dentro del mismo paso se encolan y no la matan", () => {
    const s = crearSerpiente(1);
    enqueueDir(s, DIRS.up);
    enqueueDir(s, DIRS.left);
    expect(s.dirQueue).toHaveLength(2);

    pasoSerpiente(s);
    expect(s.snake[0]).toEqual({ x: 10, y: 6 });
    pasoSerpiente(s);
    expect(s.snake[0]).toEqual({ x: 9, y: 6 });
    expect(s.over).toBe(false);
    expect(s.dirQueue).toHaveLength(0);
  });

  /**
   * Seguirse la cola a distancia cero es la maniobra buena: el último segmento
   * abandona su celda en el mismo paso, así que matar al jugador por hacerla
   * sería el defecto.
   */
  test("la cola que se libera no cuenta como choque", () => {
    const s = crearSerpiente(1);
    s.snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ];
    s.dir = DIRS.right;
    s.fruit = { x: 19, y: 14 };
    arrancarSerpiente(s);

    // La cabeza entra justo en (6,5), que es la celda que la cola deja libre.
    pasoSerpiente(s);
    expect(s.over).toBe(false);
    expect(s.snake[0]).toEqual({ x: 6, y: 5 });
  });

  test("el muro mata y no hay bordes que envuelvan", () => {
    const s = crearSerpiente(1);
    arrancarSerpiente(s);
    for (let i = 0; i < 40 && !s.over; i++) pasoSerpiente(s);

    expect(s.over).toBe(true);
    expect(s.lives).toBe(0);
    // Murió contra el muro de la derecha, no reapareció por la izquierda.
    expect(s.snake[0].x).toBe(19);
  });

  test("comer alarga uno, suma 10 × nivel y sube de nivel cada cinco frutas", () => {
    const s = crearSerpiente(1);
    const comer = () => {
      s.snake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ];
      s.dir = DIRS.right;
      s.dirQueue = [];
      s.fruit = { x: 6, y: 5 };
      arrancarSerpiente(s);
      pasoSerpiente(s);
    };

    comer();
    expect(s.snake).toHaveLength(4); // tres segmentos + el que crece
    expect(s.score).toBe(10);
    expect(s.level).toBe(1);

    for (let i = 0; i < 4; i++) comer();
    expect(s.fruits).toBe(5);
    expect(s.level).toBe(2);
    expect(s.score).toBe(50);

    // La sexta ya vale el doble: el nivel multiplica.
    comer();
    expect(s.score).toBe(70);
  });

  test("los círculos del mando giran 90° relativo al rumbo", () => {
    // A (derecha) desde →  es ▼;  B (izquierda) desde → es ▲.
    let s = crearSerpiente(1);
    enqueueTurn(s, 1);
    expect(s.dirQueue[0]).toEqual(DIRS.down);

    s = crearSerpiente(1);
    enqueueTurn(s, -1);
    expect(s.dirQueue[0]).toEqual(DIRS.up);

    // Cuatro giros a la derecha devuelven el rumbo de partida.
    s = crearSerpiente(1);
    const inicial = s.dir;
    for (let i = 0; i < 4; i++) {
      s.dirQueue = [];
      enqueueTurn(s, 1);
      s.dir = s.dirQueue[0];
    }
    expect(s.dir).toEqual(inicial);
  });

  test("no hay estado de victoria, y la partida terminada no acepta nada", () => {
    const s = crearSerpiente(1);
    expect("win" in s).toBe(false);

    s.over = true;
    const antes = JSON.stringify(s.snake);
    arrancarSerpiente(s);
    enqueueDir(s, DIRS.up);
    enqueueTurn(s, 1);
    pasoSerpiente(s);

    expect(s.started).toBe(false);
    expect(s.dirQueue).toHaveLength(0);
    expect(JSON.stringify(s.snake)).toBe(antes);
  });
});

/**
 * SPEC 21 — el mando de consola de móvil. A ≤ 720px los cinco motores sacan
 * sus mandos del tubo y los sustituye un mando único, soldado bajo el CRT.
 * Los mandos internos no se desmontan: siguen en el DOM en `display: none`, y
 * Playwright no ve lo que está oculto — por eso todo lo de aquí se mide por
 * visibilidad y por el árbol de roles, nunca por presencia en el DOM.
 */
test.describe("mando de consola en móvil", () => {
  const JUEGOS = [
    "tetrix",
    "asteroides",
    "arkanoid",
    "buscaminas",
    "serpiente",
  ] as const;

  test.beforeEach(async ({ isMobile }) => {
    test.skip(!isMobile, "el mando sólo existe por debajo de 720px");
  });

  test("el tubo se queda sin un solo botón visible en los cinco juegos", async ({
    page,
  }) => {
    await signIn(page);
    for (const slug of JUEGOS) {
      await page.goto(`/jugar/${slug}`);
      await expect(page.locator(".game-pad")).toBeVisible();
      const dentro = page.locator(".crt-screen button");
      for (let i = 0; i < (await dentro.count()); i++) {
        await expect(dentro.nth(i)).toBeHidden();
      }
      // Y el mando sí está, con su silueta completa: cuatro brazos y dos
      // círculos, use el juego los seis o no.
      await expect(page.locator(".game-pad .pad-arm")).toHaveCount(4);
      await expect(page.locator(".game-pad .pad-round")).toHaveCount(2);
    }
  });

  test("PAUSA y MENÚ viven en el mando, no en el HUD", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    const mando = page.locator(".game-pad");
    await expect(mando).toBeVisible();

    await expect(mando.getByRole("button", { name: "PAUSA" })).toBeVisible();
    await expect(mando.getByRole("button", { name: "MENÚ" })).toBeVisible();
    await expect(page.locator(".hud-actions .hud-pause")).toBeHidden();
    await expect(page.locator(".hud-actions .hud-end")).toBeHidden();

    // Y hacen exactamente lo que hacían arriba.
    await mando.getByRole("button", { name: "PAUSA" }).click();
    await expect(page.getByText("EN PAUSA")).toBeVisible();
    await mando.getByRole("button", { name: "REANUDAR" }).click();
    await expect(page.getByText("EN PAUSA")).toHaveCount(0);
    await mando.getByRole("button", { name: "MENÚ" }).click();
    // El panel se pinta dentro del tubo, encima del juego, no sobre la página.
    await expect(page.locator(".crt-screen .crt-menu")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("el HUD se queda con ⛶ y nada más", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".game-pad")).toBeVisible();

    // SALIR salió del HUD en la SPEC 22: la única salida es la del panel.
    const visibles = page.locator(".hud-actions > *:visible");
    await expect(visibles).toHaveCount(1);
    await expect(
      page.locator(".hud-actions").getByRole("button", {
        name: "Activar pantalla completa",
      }),
    ).toBeVisible();
  });

  test("ninguna tecla lleva nada escrito dentro: el nombre va debajo", async ({
    page,
  }) => {
    await signIn(page);
    for (const slug of JUEGOS) {
      await page.goto(`/jugar/${slug}`);
      const mando = page.locator(".game-pad");
      await expect(mando).toBeVisible();

      // Ni la bandera de BUSCAMINAS ni el LANZAR de ARKANOID: la cara de una
      // tecla no dice nunca lo que hace.
      const dentro = await mando.evaluate((pad) =>
        [...pad.querySelectorAll("button")]
          .map((b) => b.textContent?.trim() ?? "")
          .filter(Boolean),
      );
      expect(dentro).toEqual([]);

      // Lo único escrito son la marca y los cuatro rótulos, siempre los
      // mismos: cambia lo que hace cada tecla, no el dibujo del mando.
      await expect(mando.locator(".pad-slot-label")).toHaveText([
        "B",
        "A",
        "PAUSA",
        "MENÚ",
      ]);
      await expect(mando.locator(".pad-brand")).toHaveText("ARCADE VAULT");

      // Lo que explica la leyenda vive dentro del tubo, no en el mando.
      await expect(mando).not.toContainText("TRIPLE");
      await expect(mando).not.toContainText("ESCUDO");
    }
  });

  test("las teclas que un juego no usa no tienen rol ni reciben foco", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".game-pad")).toBeVisible();

    // ARKANOID sólo usa ←, → y el círculo A: arriba, abajo y el círculo B se
    // pintan igualmente, apagados.
    const apagadas = page.locator(".game-pad .is-off");
    await expect(apagadas).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(apagadas.nth(i)).toBeVisible();
      await expect(apagadas.nth(i)).toHaveAttribute("aria-hidden", "true");
    }
    // No están en el árbol de roles y no hay nada enfocable detrás de ellas.
    await expect(page.locator(".game-pad").getByRole("button")).toHaveCount(5);
    const enfocables = await page
      .locator(".game-pad")
      .evaluate(
        (pad) =>
          pad.querySelectorAll("button, [tabindex]:not([tabindex='-1'])")
            .length,
      );
    expect(enfocables).toBe(5);
  });

  test("la señal sube al tubo y ya no queda franja bajo el mando", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/buscaminas");
    await expect(page.locator(".game-pad")).toBeVisible();

    // La de escritorio se calla, y la de debajo del mando ya no existe: el
    // mando es lo último del mueble.
    await expect(page.locator(".crt-bottom-desktop")).toBeHidden();
    await expect(page.locator(".crt-bottom-mobile")).toHaveCount(0);

    // Su información vive ahora dentro del negro del tubo, con el LED verde
    // de siempre y una sola línea.
    const senal = page.locator(".screen-signal");
    await expect(senal).toBeVisible();
    await expect(senal.locator("span")).toHaveText(["SEÑAL OK", "BUSCAMINAS"]);
    await expect(senal).not.toContainText("CRT-83");
    await expect(senal).not.toContainText("CARGA");
    await expect(senal.locator(".led")).toBeVisible();

    // Y es lo primero del tubo, por encima de la leyenda y del juego.
    const primero = await page.evaluate(() => {
      const pantalla = document.querySelector(".crt-screen");
      const senal = document.querySelector(".screen-signal");
      return Boolean(pantalla && senal && pantalla.firstElementChild === senal);
    });
    expect(primero).toBe(true);
  });

  test("cada juego reserva su banda de leyenda dentro del tubo", async ({
    page,
  }) => {
    await signIn(page);

    // BUSCAMINAS cuenta banderas puestas sobre las disponibles y sus minas.
    await page.goto("/jugar/buscaminas");
    await expect(page.locator(".screen-legend")).toBeVisible();
    await expect(page.locator(".screen-legend")).toContainText("MINAS");

    // ASTEROIDES recupera ahí los dos objetos que suelta.
    await page.goto("/jugar/asteroides");
    await expect(page.locator(".screen-legend")).toContainText("TRIPLE");
    await expect(page.locator(".screen-legend")).toContainText("ESCUDO");

    // ARKANOID recupera ahí sus dos premios, desde la SPEC 24.
    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".screen-legend")).toContainText("BOLA EXTRA");
    await expect(page.locator(".screen-legend")).toContainText("+ PALA");

    // Y quien no tiene nada que explicar reserva el hueco igualmente.
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".screen-legend")).toHaveText("LEYENDA");
  });

  test("los tres números bajan del HUD a su banda, bajo el juego", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".game-pad")).toBeVisible();

    // Arriba se queda el nombre del jugador y nada más.
    await expect(page.locator(".player-hud .hud-stat:visible")).toHaveCount(1);
    await expect(page.locator(".player-hud .hud-stat.player")).toBeVisible();

    // Los tres, con sus rótulos, dentro del tubo y debajo del juego.
    const marcador = page.locator(".screen-stats");
    await expect(marcador).toBeVisible();
    await expect(marcador.locator(".screen-stat .l")).toHaveText([
      "PTS",
      "VIDAS",
      "NIVEL",
    ]);
    await expect(marcador.locator(".screen-stat.lives .v")).toHaveText("♥ ♥ ♥");
    await expect(marcador.locator(".screen-stat.level .v")).toHaveText("01");

    const ultimo = await page.evaluate(() => {
      const pantalla = document.querySelector(".crt-screen");
      const stats = document.querySelector(".screen-stats");
      return Boolean(pantalla && stats && pantalla.lastElementChild === stats);
    });
    expect(ultimo).toBe(true);
  });

  test("el tubo y el mando van soldados, sin junta entre los dos", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/asteroides");
    await expect(page.locator(".game-pad")).toBeVisible();

    // Se sondea en vez de medir una vez: el lienzo de ASTEROIDES fija su alto
    // al escalarse, y una medida tomada antes de ese primer ajuste ve una
    // junta que no existe un fotograma después.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const crt = document.querySelector(".crt");
          const pad = document.querySelector(".game-pad");
          if (!crt || !pad) return Number.NaN;
          return (
            pad.getBoundingClientRect().top - crt.getBoundingClientRect().bottom
          );
        }),
      )
      // Cero de verdad, con el margen del subpíxel: entre el tubo y el mando
      // no hay franja, ni separación, ni el borde de nadie.
      .toBeLessThan(1);
  });

  test("el espacio de juego mide exactamente lo mismo en los cinco", async ({
    page,
  }) => {
    await signIn(page);

    const medidas: { w: number; h: number }[] = [];
    for (const slug of JUEGOS) {
      await page.goto(`/jugar/${slug}`);
      await expect(page.locator(".game-pad")).toBeVisible();
      medidas.push(
        await page
          .locator(
            ".tetris-stage, .rocks-stage, .ark-stage, .minas-stage, .snake-stage",
          )
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }),
      );
    }

    // La proporción ya no vive en `.crt-screen` —que apila señal, leyenda,
    // juego y marcador— sino en la banda del juego, y es la misma en los
    // cuatro: TETRIX renunció al 3 / 4 que tenía para él solo.
    //
    // Se comparan con un píxel de margen a propósito: el alto real es
    // fraccionario (277,5) y el navegador lo resuelve a un lado o a otro según
    // la posición de la banda. Exigir igualdad exacta hacía fallar el test una
    // de cada cuatro veces sin que nada estuviera mal.
    for (const m of medidas) {
      expect(m.w / m.h).toBeCloseTo(4 / 3, 2);
      expect(Math.abs(m.w - medidas[0].w)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.h - medidas[0].h)).toBeLessThanOrEqual(1);
    }

    // SIGUIENTE es estado del juego, no un control: se queda dentro del tubo.
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".crt-screen .tetris-next")).toBeVisible();
  });

  test("se juega de verdad con el mando en los cinco juegos", async ({
    page,
  }) => {
    await signIn(page);

    /** Pulsa y suelta una tecla del mando, como haría un pulgar. */
    async function pulsar(nombre: string, ms = 200) {
      const tecla = page.locator(".game-pad").getByLabel(nombre);
      await tecla.scrollIntoViewIfNeeded();
      const caja = await tecla.boundingBox();
      if (!caja) throw new Error(`sin caja: ${nombre}`);
      await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
      await page.waitForTimeout(150);
    }

    /** Huella del lienzo: si la tecla llega al motor, cambia. */
    const huella = (sel: string) =>
      page
        .locator(sel)
        .screenshot()
        .then((b) => b.toString("base64"));

    await page.goto("/jugar/tetrix");
    await expect(page.locator(".tetris-board")).toBeVisible();
    let antes = await huella("canvas.tetris-board");
    await pulsar("Mover a la derecha", 60);
    expect(await huella("canvas.tetris-board")).not.toBe(antes);

    await page.goto("/jugar/asteroides");
    await expect(page.locator(".rocks-field")).toBeVisible();
    antes = await huella("canvas.rocks-field");
    await pulsar("Empujar", 400);
    expect(await huella("canvas.rocks-field")).not.toBe(antes);

    await page.goto("/jugar/arkanoid");
    await expect(page.locator(".ark-board")).toBeVisible();
    antes = await huella("canvas.ark-board");
    await pulsar("Lanzar la bola", 60);
    expect(await huella("canvas.ark-board")).not.toBe(antes);

    await page.goto("/jugar/buscaminas");
    await expect(page.locator(".minas-board")).toBeVisible();
    antes = await huella("canvas.minas-board");
    await pulsar("Mover el cursor a la derecha", 60);
    expect(await huella("canvas.minas-board")).not.toBe(antes);

    // SERPIENTE se mueve sola, así que «la huella cambió» no probaría nada
    // aquí. Lo que se comprueba es el **rumbo**: la cabeza arranca en el centro
    // mirando a la derecha, y tras pulsar ▲ un segundo tiene que haber subido
    // de fila. `cabezaSerpiente` la localiza por color (§ su propio bloque).
    await page.goto("/jugar/serpiente");
    await expect(page.locator(".snake-board")).toBeVisible();
    const filaInicial = (await cabezaSerpiente(page)).fila;
    await pulsar("Girar hacia arriba", 60);
    await page.waitForTimeout(700);
    expect((await cabezaSerpiente(page)).fila).toBeLessThan(filaInicial);
  });

  /**
   * SPEC 23: TETRIX era el único de los cuatro con un hueco en la silueta del
   * mando —B sin acción—. Deja de serlo: B pasa a rotar, lo mismo que ▲, así
   * que ya no queda ninguna tecla apagada en este juego.
   */
  test("B rota la pieza en TETRIX, igual que ▲", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");
    await expect(page.locator(".game-pad")).toBeVisible();

    // Cuatro brazos, dos círculos y las dos pastillas: los ocho activos, cero
    // apagados — la silueta completa, nada atenuado.
    await expect(page.locator(".game-pad .is-off")).toHaveCount(0);
    await expect(page.locator(".game-pad").getByRole("button")).toHaveCount(8);

    const botonB = page.locator(".game-pad .pad-slot-b button");
    await expect(botonB).toHaveAttribute("aria-label", "Rotar la pieza");
    await botonB.scrollIntoViewIfNeeded();

    const huella = () =>
      page
        .locator("canvas.tetris-board")
        .screenshot()
        .then((b) => b.toString("base64"));
    const antes = await huella();

    const caja = await botonB.boundingBox();
    if (!caja) throw new Error("sin caja: B");
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(150);

    expect(await huella()).not.toBe(antes);
  });

  /**
   * SPEC 23: el camino que reportó el usuario. `toggleFlag()` ya marcaba bien
   * la celda —se ve en el lienzo— pero el mando entra por el bucle de
   * `requestAnimationFrame`, que no llamaba a `syncLegend()`, así que el
   * `⚑ 0 / 10` de la leyenda no se movía nunca desde aquí.
   */
  test("el botón B mueve el contador de banderas de BUSCAMINAS", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/buscaminas");
    await expect(page.locator(".game-pad")).toBeVisible();

    const legend = page.locator(".screen-legend");
    await expect(legend).toContainText("0 / 10");

    const botonB = page.locator(".game-pad .pad-slot-b button");
    await expect(botonB).toHaveAttribute("aria-label", "Marcar con bandera");
    await botonB.scrollIntoViewIfNeeded();

    const caja = await botonB.boundingBox();
    if (!caja) throw new Error("sin caja: B");
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(150);
    await expect(legend).toContainText("1 / 10");

    // Soltarla la devuelve: la misma celda, segunda pulsada.
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(150);
    await expect(legend).toContainText("0 / 10");
  });

  test("los controles táctiles sobre el lienzo siguen vivos", async ({
    page,
  }) => {
    await signIn(page);

    // Arrastrar la pala es el control más preciso de ARKANOID.
    await page.goto("/jugar/arkanoid");
    const tablero = page.locator("canvas.ark-board");
    await expect(tablero).toBeVisible();
    const caja = await tablero.boundingBox();
    if (!caja) throw new Error("ARKANOID sin tablero");
    const antes = await tablero.screenshot().then((b) => b.toString("base64"));
    await page.mouse.move(caja.x + 30, caja.y + caja.height - 8);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width - 30, caja.y + caja.height - 8, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(
      await tablero.screenshot().then((b) => b.toString("base64")),
    ).not.toBe(antes);

    // Y tocar la celda es el gesto natural de BUSCAMINAS.
    await page.goto("/jugar/buscaminas");
    const rejilla = page.locator("canvas.minas-board");
    await expect(rejilla).toBeVisible();
    const cajaR = await rejilla.boundingBox();
    if (!cajaR) throw new Error("BUSCAMINAS sin rejilla");
    const antesR = await rejilla.screenshot().then((b) => b.toString("base64"));
    await page.mouse.click(
      cajaR.x + cajaR.width * 0.4,
      cajaR.y + cajaR.height * 0.4,
    );
    await page.waitForTimeout(250);
    expect(
      await rejilla.screenshot().then((b) => b.toString("base64")),
    ).not.toBe(antesR);
  });

  /**
   * SPEC 22: el panel no se desplaza nunca. A 390px el tubo mide unos 300px y
   * la rama más alta del panel es la de invitado en fin de partida —título,
   * etiqueta, puntuación, la línea de sesión y tres botones—, así que es la
   * única que hace falta medir: si esa cabe, caben las otras.
   */
  test("el panel cabe en el tubo sin desplazamiento", async ({ page }) => {
    test.slow();
    await playAsGuest(page, "/jugar/arkanoid");
    await loseArkanoid(page);

    const panel = page.locator(".crt-menu");
    await expect(panel.locator(".guest-save")).toBeVisible();
    const [scrollHeight, clientHeight] = await panel.evaluate((el) => [
      el.scrollHeight,
      el.clientHeight,
    ]);
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  });

  /** Y los cuatro botones del panel miden lo mismo, midan lo que midan sus rótulos. */
  test("los botones del panel forman una sola columna", async ({ page }) => {
    test.slow();
    await playAsGuest(page, "/jugar/arkanoid");
    await loseArkanoid(page);

    const anchos = await page
      .locator(".crt-menu .btn")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(anchos.length).toBeGreaterThan(1);
    expect(new Set(anchos).size).toBe(1);
  });
});

/**
 * El espejo en escritorio: lo que la SPEC 21 prometió NO tocar. Si algo de
 * aquí se rompe, el cambio de móvil se ha filtrado por encima de 720px.
 */
test.describe("el reproductor de escritorio no se entera del mando", () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "es justo lo contrario del bloque de móvil");
  });

  test("los mandos siguen dentro del tubo y el mando nuevo no existe", async ({
    page,
  }) => {
    await signIn(page);

    for (const [slug, dentro] of [
      ["tetrix", ".tetris-side .tetris-pad .btn"],
      ["asteroides", ".rocks-side .rocks-pad .btn"],
      ["arkanoid", ".ark-pad .btn"],
      ["buscaminas", ".minas-side .minas-pad .btn"],
      ["serpiente", ".snake-pad .btn"],
    ] as const) {
      await page.goto(`/jugar/${slug}`);
      await expect(page.locator(".crt-screen")).toBeVisible();
      await expect(page.locator(dentro).first()).toBeVisible();
      await expect(page.locator(".game-pad")).toBeHidden();
    }
  });

  test("la franja visible es la de dentro del CRT, con sus tres textos", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/jugar/buscaminas");

    const franja = page.locator(".crt-bottom-desktop");
    await expect(franja).toBeVisible();
    await expect(franja.locator("span")).toHaveText([
      "SEÑAL OK",
      "BUSCAMINAS · CRT-83 · 60 HZ",
      "CARGA · 1MB",
    ]);
    await expect(page.locator(".crt-bottom-mobile")).toBeHidden();
    // Y sigue viviendo dentro de .crt, no colgando del reproductor.
    await expect(page.locator(".crt > .crt-bottom-desktop")).toHaveCount(1);
  });

  test("PAUSA, MENÚ y ⛶ siguen en el HUD", async ({ page }) => {
    await signIn(page);
    await page.goto("/jugar/tetrix");

    await expect(page.locator(".hud-actions .hud-pause")).toBeVisible();
    await expect(page.locator(".hud-actions .hud-end")).toBeVisible();
    // Desde la SPEC 22 la pantalla completa también está aquí, a la derecha
    // de MENÚ; el mando, en cambio, sigue sin existir por encima de 720px.
    await expect(page.locator(".hud-actions .fullscreen-toggle")).toBeVisible();
    await expect(page.locator(".game-pad")).toBeHidden();
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
    await expect(page.locator(".hall-tabs .chip")).toHaveCount(5);
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
