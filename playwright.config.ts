import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Desde SPEC 06 cada navegación pasa por el stack local de Docker: el proxy
  // valida el token y el layout resuelve la sesión. Con los workers por
  // defecto (uno por núcleo) GoTrue agota su pool de conexiones y la
  // resolución DNS interna de Docker empieza a dar timeouts de 14s — las
  // peticiones mueren con 504 y la suite falla sin que nada esté roto.
  workers: 2,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  expect: {
    // Desde SPEC 06 el layout resuelve la sesión en servidor, así que cada
    // render cuesta dos viajes a Supabase y las siete rutas son dinámicas.
    // Con la suite en paralelo contra un solo `next start`, los 5s por defecto
    // se quedan cortos — el mismo motivo que NAV_TIMEOUT en la suite.
    timeout: 15_000,
    // Las capturas se comparan contra las de este repo, no contra el template.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // iPhone 13 emulado sobre Chromium: es el único motor que instalamos.
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // La suite recorre el modo simulado de /api/contacto: una clave en
      // .env.local mandaría correos de verdad en cada `npm test`.
      RESEND_API_KEY: "",
      // Stack local de `npx supabase start`. Son NEXT_PUBLIC_*: se incrustan
      // en el `next build` que lanza este webServer, así que sin ellas la
      // suite compilaría contra el proyecto remoto y crearía usuarios reales.
      // Valores de demo, iguales en cualquier máquina: no son secretos.
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
    },
  },
});
