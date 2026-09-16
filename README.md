# Arcade Vault

Plataforma web para jugar a clásicos arcade y competir por la mayor puntuación, con estética CRT de salón recreativo.

## Estado actual

El repo contiene una **maqueta navegable completa**: cinco pantallas reales sobre Next.js App Router, con navegación, filtros, formulario de sesión y tablas de puntuaciones funcionando de extremo a extremo. Lo que todavía **no** existe:

- **Los ocho juegos son decorativos.** No hay motor de juego. El reproductor (`/jugar/[id]`) anima una escena CRT y sube la puntuación sola con un temporizador; no se juega nada.
- **No hay backend, base de datos ni API.** Todos los datos son estáticos y viven en `lib/`.
- **La sesión es falsa.** El formulario de `/auth` no valida credenciales: crea un usuario en `localStorage` bajo la clave `av_user`. Los botones de Google y GitHub son decorativos.
- **Las puntuaciones no se guardan.** Las genera un LCG determinista (`seededScores()` en `lib/scores.ts`) a partir del `id` del juego, así que son siempre las mismas y nadie las escribe.
- **No hay página de cuenta de usuario ni internacionalización.** La interfaz es solo español y solo tema oscuro.

## Requisitos

- **Node.js >= 20.9.0** (lo exige `next@16.3.5`; comprobable en `engines.node` de `node_modules/next/package.json`).
- **npm** (el repo trae `package-lock.json`).
- **Navegador de Playwright**, solo si vas a ejecutar las pruebas:

  ```bash
  npx playwright install chromium
  ```

  Es el único motor que usa la suite: los dos proyectos corren sobre Chromium.

## Puesta en marcha

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:3000`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. También regenera el bloque `nextjs-agent-rules` de `AGENTS.md`. |
| `npm run build` | Compilación de producción. |
| `npm run start` | Sirve la compilación de producción (requiere un `build` previo). |
| `npm run lint` | ESLint con configuración plana; recorre todo el proyecto, sin argumento `--dir`. |
| `npm test` | Suite de Playwright completa, proyectos `desktop` y `mobile`. |
| `npm run test:update` | Igual, pero regenerando las capturas de referencia. |
| `npx tsc --noEmit` | Comprobación de tipos. No hay script de npm para esto. |

## Pantallas

| Ruta | Fichero | Qué muestra |
| --- | --- | --- |
| `/` | `app/page.tsx` | Biblioteca: hero, buscador, chips de categoría y rejilla con los ocho juegos. |
| `/juego/[id]` | `app/juego/[id]/page.tsx` | Detalle: portada grande, etiquetas, descripción, estadísticas y las diez mejores puntuaciones. `notFound()` si el `id` no existe. |
| `/jugar/[id]` | `app/jugar/[id]/page.tsx` | Reproductor: pantalla CRT animada, HUD con puntuación y vidas, pausa, `FIN` y modal de fin de partida. `notFound()` si el `id` no existe. |
| `/auth` | `app/auth/page.tsx` | Entrar o crear cuenta. Crea la sesión falsa y vuelve a la biblioteca. |
| `/salon` | `app/salon/page.tsx` | Salón de la Fama: podio, tabla de puntuaciones y selector de juego. |
| — | `app/not-found.tsx` | Pantalla 404 con el tema arcade. |
| — | `app/error.tsx` | Límite de error de React con botón de reintento. |

Las URL están en español a propósito y coinciden con la maqueta original.

## Estructura

```
app/                      # App Router: rutas, layout raíz y CSS global
  layout.tsx              # fuentes, metadatos, SessionProvider, Nav y Footer
  globals.css             # tema arcade completo (~1.800 líneas) + import de Tailwind
  page.tsx                # biblioteca
  juego/[id]/page.tsx     # detalle del juego
  jugar/[id]/page.tsx     # reproductor
  auth/page.tsx           # entrar / crear cuenta
  salon/page.tsx          # salón de la fama
  not-found.tsx           # 404
  error.tsx               # límite de error

components/               # nueve componentes de interfaz
  nav.tsx                 # barra, enlaces activos y panel móvil con la sesión dentro
  footer.tsx              # pie (componente de servidor)
  session-provider.tsx    # contexto de sesión, expone useSession()
  library-browser.tsx     # buscador y filtrado por categoría
  game-card.tsx           # tarjeta con efecto tilt
  leaderboard.tsx         # tabla de puntuaciones del detalle (componente de servidor)
  game-player.tsx         # reproductor CRT, HUD y modal de fin de partida
  auth-form.tsx           # formulario de sesión
  hall-of-fame.tsx        # podio y tabla del salón

lib/                      # datos y estado, todo simulado
  games.ts                # los ocho juegos, categorías y getGame()
  scores.ts               # generador determinista de puntuaciones
  session.ts              # lectura y escritura de la sesión en localStorage

tests/                    # suite de Playwright
  screens.spec.ts
  screens.spec.ts-snapshots/   # diez capturas de referencia

specs/                    # specs del proyecto, una por funcionalidad
references/templates/     # maqueta HTML/JSX original de la que salieron las pantallas
```

## Pruebas

La suite vive entera en `tests/screens.spec.ts` y cubre humo, interacción y comparación visual. Se organiza por bloques: capturas de referencia, biblioteca, detalle, reproductor, auth, salón de la fama y responsive.

Dos proyectos, ambos sobre Chromium (`playwright.config.ts`):

| Proyecto | Viewport |
| --- | --- |
| `desktop` | 1440 × 900 |
| `mobile` | iPhone 13 emulado (390 × 844) |

El `webServer` de Playwright ejecuta `npm run build` y luego `next start -p 3100`, así que la primera ejecución tarda: se prueba contra la compilación de producción, no contra el servidor de desarrollo.

Las capturas de referencia están en `tests/screens.spec.ts-snapshots/`: cinco por proyecto, una por ruta. Regenéralas **solo** cuando un cambio visual sea intencionado, y solo las del proyecto afectado:

```bash
npx playwright test --project=mobile --update-snapshots   # solo móvil
npm run test:update                                        # todas
```

Antes de regenerar, verifica el cambio a mano en el navegador. Una captura regenerada a ciegas convierte una regresión en la nueva referencia.

## Desarrollo guiado por specs

Cada funcionalidad se escribe primero como spec y solo después como código. Dos skills gobiernan el flujo:

- **`/spec`** — hace las preguntas necesarias y deja la spec en `specs/NN-slug.md`, en estado `Borrador`.
- **`/spec-impl NN-slug`** — implementa una spec ya `Aprobado`, paso a paso, en la rama `spec-NN-slug`.

Las skills son las de [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills) y están incluidas en el repo, en `.agents/skills/`, con enlaces simbólicos desde `.claude/skills/` para que Claude Code las vea. Se instalaron con:

```bash
npx skills@latest add Klerith/fernando-skills
```

`specs/.spec-config.yml` controla la creación automática de rama (`AutoCreateBranch`).

### Specs

| Spec | Estado | Depende de |
| --- | --- | --- |
| [01 — MVP visual de las pantallas](specs/01-mvp-pantallas-visuales.md) | Implementado | — |
| [02 — Barra móvil: sesión en la hamburguesa](specs/02-nav-movil-sesion-en-hamburguesa.md) | Implementado | SPEC 01 |
| [03 — Documentación del repo](specs/03-documentacion-readme-y-claude.md) | Implementado | SPEC 01, SPEC 02 |

## Referencias

`references/templates/` guarda la maqueta original de la que salieron las cinco pantallas: HTML con React UMD y Babel en el navegador, más un `styles.css` de 950 líneas. No se compila ni se despliega; sigue en el repo como fuente visual de verdad para comparar cuando un estilo portado no cuadra.
