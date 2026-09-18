import { expect, test, type Locator, type Page } from "@playwright/test";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "biblioteca", path: "/biblioteca" },
  { name: "detalle", path: "/juego/serpentina" },
  { name: "reproductor", path: "/jugar/serpentina" },
  { name: "auth", path: "/auth" },
  { name: "salon", path: "/salon" },
] as const;

/** Las fuentes de next/font cambian el layout al cargar: esperarlas evita capturas inestables. */
async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
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

/**
 * El reproductor sube la puntuación con un setInterval. Se congela el reloj tras
 * cargar la página para que la partida sólo avance cuando la prueba lo pide.
 */
const CLOCK_START = new Date("2026-09-15T12:00:00Z");
/** Margen amplio: pauseAt sólo avanza hacia adelante y la carga puede tardar. */
const CLOCK_PAUSE = new Date(CLOCK_START.getTime() + 60_000);

async function openPlayer(page: Page, path = "/jugar/serpentina") {
  await page.clock.install({ time: CLOCK_START });
  await page.goto(path);
  await page.clock.pauseAt(CLOCK_PAUSE);
}

/** Debe seguir a TICK_MS en components/game-player.tsx. */
const TICK_MS = 220;

/**
 * Anula el setInterval de la partida antes de que cargue la página, dejándola
 * en su estado inicial. Congelar el reloj no basta: el intervalo nace cuando
 * React monta, así que el número de ticks depende del tiempo de carga, y con él
 * los dígitos de la puntuación — que al ser el HUD flex-wrap cambian su altura
 * y desplazan toda la página. Se filtra sólo ese intervalo para no tocar los
 * temporizadores de React ni de Next.
 */
async function freezeRun(page: Page) {
  await page.addInitScript((tick) => {
    const real = window.setInterval;
    window.setInterval = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) =>
      delay === tick
        ? 0
        : real(handler, delay, ...args)) as typeof window.setInterval;
  }, TICK_MS);
}

function scoreOf(text: string): number {
  return Number(text.replace(/\D/g, ""));
}

async function signIn(page: Page, name = "px_kai") {
  await page.goto("/auth");
  await page.getByLabel("Usuario").fill(name);
  await page.getByRole("button", { name: "ENTRAR AL VAULT" }).click();
  await expect(page).toHaveURL("/biblioteca");
}

test.describe("capturas de referencia", () => {
  for (const route of ROUTES) {
    test(`${route.name} coincide con su captura`, async ({ page }) => {
      // La partida avanza sola con puntuación aleatoria: se congela para que la
      // captura no dependa del tiempo de carga.
      if (route.name === "reproductor") await freezeRun(page);
      await page.goto(route.path);
      await ready(page);
      if (route.name === "home") await disarmReveal(page);

      if (route.name === "reproductor") {
        // Se captura en pausa, el estado con más interfaz visible.
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
      });
    });
  }
});

test.describe("home", () => {
  test("pinta las siete secciones", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1.home-title")).toContainText("EL ARCADE");
    await expect(page.locator(".feature-card")).toHaveCount(4);
    await expect(page.locator(".mini-card")).toHaveCount(6);
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
    await expect(first).toHaveAttribute("href", "/juego/bloque-buster");
    await settled(page.locator(".home-section", { has: first }));
    await first.click();
    await expect(page).toHaveURL("/juego/bloque-buster", {
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
  test("muestra los 8 juegos", async ({ page }) => {
    await page.goto("/biblioteca");
    await expect(page.locator(".card")).toHaveCount(8);
    await expect(page.locator(".cover-bg")).toHaveCount(8);
  });

  test("el buscador filtra por nombre", async ({ page }) => {
    await page.goto("/biblioteca");
    await page.getByLabel("Buscar un juego por nombre").fill("ser");
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(page.locator(".card .title")).toHaveText("SERPENTINA");
  });

  test("una búsqueda sin resultados muestra el estado vacío", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.getByLabel("Buscar un juego por nombre").fill("serzzz");
    await expect(page.locator(".card")).toHaveCount(0);
    await expect(page.getByText("NO HAY RESULTADOS")).toBeVisible();
  });

  test("el chip PUZZLE deja un solo juego", async ({ page }) => {
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "PUZZLE" }).click();
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(page.locator(".card .title")).toHaveText("CAÍDA");
  });

  test("la tarjeta navega al detalle y el botón atrás vuelve", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.locator(".card", { hasText: "SERPENTINA" }).click();
    await expect(page).toHaveURL("/juego/serpentina");
    await page.goBack();
    await expect(page).toHaveURL("/biblioteca");
    await expect(page.locator(".card")).toHaveCount(8);
  });
});

test.describe("detalle", () => {
  test("muestra la ficha y 10 puntuaciones", async ({ page }) => {
    await page.goto("/juego/serpentina");
    await expect(page.locator("h2")).toHaveText("SERPENTINA");
    await expect(page.locator(".detail-tags span")).toHaveCount(4);
    await expect(page.locator(".stat-strip > div")).toHaveCount(3);
    await expect(page.locator(".lb-row")).toHaveCount(10);
    await expect(page.locator(".lb-row").first()).toHaveClass(/top1/);
  });

  test("un id desconocido devuelve 404", async ({ page }) => {
    const response = await page.goto("/juego/no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("PANTALLA NO ENCONTRADA")).toBeVisible();
  });
});

test.describe("reproductor", () => {
  test("la puntuación sube sola y se congela al pausar", async ({ page }) => {
    await openPlayer(page);
    const score = page.locator(".hud-stat").nth(1).locator(".v");
    const before = scoreOf(await score.innerText());

    await page.clock.runFor(1100);
    const running = scoreOf(await score.innerText());
    expect(running).toBeGreaterThan(before);

    await page.getByRole("button", { name: "PAUSA" }).click();
    await page.clock.runFor(3000);
    expect(scoreOf(await score.innerText())).toBe(running);
  });

  test("FIN abre el modal y guardar no persiste nada", async ({ page }) => {
    await openPlayer(page);
    await page.clock.runFor(1100);
    await page.getByRole("button", { name: "FIN" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator("h2")).toHaveText("FIN DEL JUEGO");

    await modal.getByRole("button", { name: "GUARDAR PUNTUACIÓN" }).click();
    await expect(page.locator(".toast-saved")).toHaveText(
      "▸ PUNTUACIÓN GUARDADA_",
    );

    const stored = await page.evaluate(() => localStorage.getItem("av_scores"));
    expect(stored).toBeNull();
  });

  test("JUGAR DE NUEVO reinicia la partida", async ({ page }) => {
    await openPlayer(page);
    await page.clock.runFor(1100);
    await page.getByRole("button", { name: "FIN" }).click();
    await page.getByRole("button", { name: "JUGAR DE NUEVO" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    // Con el reloj congelado la partida reiniciada no avanza: 0 puntos, nivel 01.
    await expect(page.locator(".hud-stat").nth(1).locator(".v")).toHaveText(
      "0",
    );
    await expect(page.locator(".hud-stat.level .v")).toHaveText("01");
    await expect(page.getByRole("button", { name: "PAUSA" })).toBeVisible();
  });

  test("un id desconocido devuelve 404", async ({ page }) => {
    const response = await page.goto("/jugar/no-existe");
    expect(response?.status()).toBe(404);
  });
});

test.describe("auth", () => {
  test("la pestaña CREAR CUENTA añade el correo", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator(".field")).toHaveCount(2);

    await page.getByRole("button", { name: "CREAR CUENTA" }).click();
    await expect(page.locator(".field")).toHaveCount(3);
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "CREAR Y JUGAR" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "INICIAR SESIÓN" }).click();
    await expect(page.locator(".field")).toHaveCount(2);
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

  test("cerrar sesión borra av_user", async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      "el control de sesión vive en el panel, ver responsive",
    );

    await signIn(page);
    await page.locator(".auth-btn").click();

    await expect(page.locator(".auth-btn")).toHaveText("Iniciar Sesión");
    const stored = await page.evaluate(() => localStorage.getItem("av_user"));
    expect(stored).toBeNull();
  });

  test("JUGAR COMO INVITADO vuelve a la biblioteca sin sesión", async ({
    page,
  }) => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "JUGAR COMO INVITADO" }).click();

    await expect(page).toHaveURL("/biblioteca");
    expect(
      await page.evaluate(() => localStorage.getItem("av_user")),
    ).toBeNull();
  });
});

test.describe("salón de la fama", () => {
  test("muestra podio, tabla y chips", async ({ page }) => {
    await page.goto("/salon");
    await expect(page.locator(".podium-slot")).toHaveCount(3);
    await expect(page.locator(".hall-tabs .chip")).toHaveCount(8);
    await expect(page.locator(".hall-table .tr")).toHaveCount(12);
    await expect(page.locator(".podium-slot.gold .rank-num")).toHaveText("01");
  });

  test("cambiar de juego recalcula la tabla", async ({ page }) => {
    await page.goto("/salon");
    const champion = page.locator(".podium-slot.gold .name");
    const first = await champion.innerText();

    await page.getByRole("button", { name: "SERPENTINA" }).click();
    await expect(champion).not.toHaveText(first);
    await expect(page.locator(".hall-table .tr")).toHaveCount(12);
  });

  test("con sesión aparece TU MEJOR MARCA", async ({ page }) => {
    await signIn(page);
    await page.goto("/salon");

    await expect(page.locator(".tr.you-label")).toContainText(
      "TU MEJOR MARCA EN",
    );
    await expect(page.locator(".tr.you .pl")).toHaveText("PX_KAI");
    await expect(page.locator(".hall-table .tr")).toHaveCount(14);
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
    expect(
      await page.evaluate(() => localStorage.getItem("av_user")),
    ).toBeNull();

    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(
      panel.getByRole("link", { name: "INICIAR SESIÓN" }),
    ).toBeVisible();
  });

  for (const route of ROUTES) {
    test(`${route.name} no provoca scroll horizontal`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "solo aplica al proyecto mobile");

      await page.goto(route.path);
      await ready(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
