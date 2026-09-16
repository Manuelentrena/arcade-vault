# SPEC 03 — Documentación real del repo: `README.md` y `CLAUDE.md`

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-09-16
> **Objetivo:** Reescribir `README.md` y `CLAUDE.md` para que describan el repo que existe hoy —cinco pantallas, nueve componentes, `lib/`, suite de Playwright y flujo de specs— en vez del scaffold que describen ahora.

---

## 1. Por qué existe esta spec

`CLAUDE.md` miente en cada una de sus secciones. Afirmaciones falsas verificadas hoy:

| Dice | Realidad |
| --- | --- |
| "Currently a bare `create-next-app` scaffold" | Cinco rutas (`/`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`), nueve componentes en `components/`, tres módulos en `lib/` |
| "`app/layout.tsx` + `app/page.tsx` are still the untouched template (metadata says 'Create Next App')" | `metadata.title` es `"Arcade Vault"`, `lang="es"`, monta `SessionProvider`, `Nav` y `Footer` |
| "No domain code, data layer, or tests exist yet" | `lib/games.ts`, `lib/scores.ts`, `lib/session.ts` y `tests/screens.spec.ts` con diez capturas de referencia |
| "No test runner is installed" | `@playwright/test` en `devDependencies`, `playwright.config.ts` con proyectos `desktop` y `mobile`, scripts `test` y `test:update` |
| "Those skills are not present in this repo (`.claude/` does not exist)" | Existen `.claude/skills/` y `.agents/skills/spec/` + `.agents/skills/spec-impl/` |
| "Fonts are loaded with `next/font/google` (Geist, Geist Mono)" | Son `Press_Start_2P` y `JetBrains_Mono`, expuestas como `--font-press-start` y `--font-jetbrains-mono` |

`README.md` no miente, pero son trece líneas: qué es el proyecto y que usa spec-driven design. No dice el stack, ni cómo arrancarlo, ni que las pruebas existen, ni qué parte de la aplicación es maqueta.

Las dos cosas se arreglan juntas porque salen del mismo trabajo: auditar el repo una vez y volcar los hechos en los dos documentos, cada uno con su público. El `README.md` es para una persona que clona el repo; el `CLAUDE.md` es para el agente que va a escribir código en él.

---

## 2. Alcance

**Dentro:**

- Reescritura completa de `README.md` en **español**, con onboarding completo: qué es, estado actual, requisitos, instalación, comandos, mapa de rutas, estructura de carpetas, pruebas y capturas, y flujo de specs con su índice en tabla.
- Reescritura por secciones de `CLAUDE.md` en **inglés**, corrigiendo las seis afirmaciones falsas de la tabla anterior y añadiendo arquitectura de rutas y componentes, convención server/client, dónde vive el CSS, flujo de pruebas y snapshots, y flujo de specs.
- Corrección de la errata `**Estado:** Aprovado` → `**Estado:** Implementado` en la cabecera de `specs/02-nav-movil-sesion-en-hamburguesa.md`, para que coincida con la tabla del README.
- Verificación ejecutando: todos los comandos documentados se corren de verdad, y toda ruta, fichero o carpeta citada se comprueba que existe.

**Fuera de alcance:**

- `AGENTS.md`. Lo regenera `next dev`; editarlo a mano se revierte solo. `CLAUDE.md` sí explica esa mecánica, pero no se toca el fichero.
- `specs/README.md` o cualquier índice de specs fuera del `README.md` raíz.
- El contenido de las specs 01 y 02, salvo la palabra de estado de la 02.
- Código de aplicación, CSS, componentes y pruebas. Esta spec no cambia ni una línea bajo `app/`, `components/`, `lib/` o `tests/`.
- Capturas de pantalla embebidas en el README. Se descarta mantener imágenes.
- Licencia, guía de contribución, despliegue, CI e insignias.
- Traducir el código o los comentarios. Siguen en español donde ya lo están.

---

## 3. Modelo de datos

Esta spec no introduce estructuras nuevas. No toca tipos, ni `lib/`, ni persistencia. El único "dato" que se modifica es un campo de texto de la cabecera de la SPEC 02.

---

## 4. Plan de implementación

Cada paso deja el repo consistente.

1. **Auditoría de hechos.** Antes de escribir, recoger y anotar, sin memoria ni suposiciones:
   - versión de Node exigida: `node_modules/next/package.json` → campo `engines.node`;
   - versiones reales de `next`, `react`, `react-dom`, `typescript`, `@playwright/test` desde `package.json`;
   - lista exacta de scripts de `package.json`;
   - las cinco rutas desde los ficheros de `app/`;
   - los nueve componentes de `components/` y cuáles llevan `"use client"`;
   - los tres módulos de `lib/` y qué exporta cada uno;
   - proyectos, viewports y `webServer` de `playwright.config.ts`;
   - nombres de los `describe` de `tests/screens.spec.ts` y ubicación de las capturas;
   - fuentes y variables CSS reales de `app/layout.tsx`;
   - qué hay realmente en `.claude/` y `.agents/`.

2. **`README.md` — esqueleto.** Escribir el fichero nuevo con este orden de secciones:
   1. `# Arcade Vault` + una frase de qué es.
   2. **Estado actual** — bloque corto y explícito: los ocho juegos son decorativos y no tienen motor real; no hay backend, base de datos ni API; la sesión es falsa y vive en `localStorage` bajo `av_user`; las puntuaciones las genera un LCG determinista en `lib/scores.ts` y nadie las guarda.
   3. **Requisitos** — Node según `engines.node` de Next (dato del paso 1, no de memoria), npm, y `npx playwright install chromium` antes de la primera ejecución de pruebas.
   4. **Puesta en marcha** — `npm install`, `npm run dev`, puerto por defecto.
   5. **Comandos** — tabla con `dev`, `build`, `start`, `lint`, `test`, `test:update` y `npx tsc --noEmit`, cada uno con una línea de qué hace.
   6. **Pantallas** — tabla ruta → fichero → qué muestra, para las cinco rutas, más `not-found` y `error`.
   7. **Estructura** — árbol comentado de `app/`, `components/`, `lib/`, `tests/`, `specs/`, `references/`.
   8. **Pruebas** — los dos proyectos de Playwright y sus viewports, que el `webServer` hace `npm run build` + `next start` en el puerto 3100, dónde viven las diez capturas y cuándo se usa `npm run test:update`.
   9. **Desarrollo guiado por specs** — `/spec` y `/spec-impl`, de dónde salen las skills, y la tabla del paso 3.
   10. **Referencias** — qué es `references/templates/` y por qué sigue ahí.

3. **`README.md` — tabla de specs.** Una fila por spec con número, título enlazado al fichero, estado y dependencias:

   | Spec | Estado | Depende de |
   | --- | --- | --- |
   | 01 — MVP visual de las pantallas | Implementado | — |
   | 02 — Barra móvil: sesión en la hamburguesa | Implementado | SPEC 01 |
   | 03 — Documentación del repo | Borrador | SPEC 01, SPEC 02 |

   La fila de la 03 se actualiza a `Implementado` cuando se cierre esta misma spec.

4. **Corregir el estado de la SPEC 02.** En `specs/02-nav-movil-sesion-en-hamburguesa.md`, línea de cabecera: `**Estado:** Aprovado` → `**Estado:** Implementado`. Es el único cambio en ese fichero.

5. **`CLAUDE.md` — sección `## Project`.** Sustituir el párrafo del scaffold por la descripción real: plataforma arcade con cinco pantallas navegables portadas desde `references/templates/`, capa de datos falsa en `lib/`, sesión en `localStorage`, y suite Playwright con capturas. Mantener la regla de escribir spec antes de implementar, pero corrigiendo que las skills **sí** están en el repo (`.claude/skills/`, `.agents/skills/spec/` y `.agents/skills/spec-impl/`).

6. **`CLAUDE.md` — sección `## Commands`.** Añadir `npm test` y `npm run test:update` al bloque, con la nota de que el `webServer` de Playwright compila y arranca en producción sobre el puerto 3100, así que la suite tarda. Borrar la frase "No test runner is installed" y sustituirla por la realidad: Playwright es el corredor, no hay pruebas unitarias.

7. **`CLAUDE.md` — sección `## Stack and conventions`.** Corregir las fuentes (`Press_Start_2P` + `JetBrains_Mono`, variables `--font-press-start` y `--font-jetbrains-mono`) y matizar lo de Tailwind: se usan utilidades de Tailwind v4 en el JSX **y** un tema arcade propio de ~1.800 líneas en `app/globals.css` con clases `.av-*`, `.cover-*`, `.btn`, `.chip`; las dos cosas conviven y el CSS de pantalla no se convierte a utilidades. Mantener lo que ya es cierto: App Router sin `src/`, alias `@/*`, `LayoutProps<"/">` desde `.next/types`, configuración CSS-first sin `tailwind.config.*`.

8. **`CLAUDE.md` — sección nueva `## Architecture`.** Mapa de rutas a ficheros, los nueve componentes con cuáles son de cliente y por qué, y qué exporta cada módulo de `lib/`. Regla explícita: el estado de sesión se lee con `useSession()` y nunca directamente de `localStorage` dentro de un componente.

9. **`CLAUDE.md` — sección nueva `## Testing`.** Los dos proyectos y sus viewports, el patrón `test.skip(isMobile, ...)` / `test.skip(!isMobile, ...)` que ya usan las pruebas, dónde viven las capturas, y la regla de SPEC 02: verificar a mano antes de regenerar capturas, y regenerar solo las del proyecto afectado.

10. **`CLAUDE.md` — sección `## AGENTS.md`.** Se mantiene tal cual; ya es correcta.

11. **Mantener las secciones de skills de UI.** Los párrafos de `/frontend-design` y `/ui-ux-pro-max` no se tocan salvo para reubicarlos si el orden de secciones cambia.

12. **Verificar ejecutando.** Correr en este orden y no dar por buena la doc hasta que todo pase:
    - `npm run lint`
    - `npx tsc --noEmit`
    - `npm run build`
    - `npm test`
    - cada comando que aparezca en cualquiera de los dos documentos;
    - comprobar con `ls` que existe cada ruta, fichero y carpeta citada en los dos documentos.

---

## 5. Criterios de aceptación

- [ ] `CLAUDE.md` no contiene ninguna de estas cadenas: `bare create-next-app scaffold`, `No domain code`, `No test runner is installed`, `Geist`, `.claude/` does not exist.
- [ ] `CLAUDE.md` nombra `Press_Start_2P` y `JetBrains_Mono` y las variables `--font-press-start` y `--font-jetbrains-mono`.
- [ ] `CLAUDE.md` documenta `npm test` y `npm run test:update`.
- [ ] `CLAUDE.md` tiene una sección de arquitectura que lista las cinco rutas y los nueve componentes de `components/`.
- [ ] `CLAUDE.md` tiene una sección de pruebas que nombra los proyectos `desktop` y `mobile` y la carpeta `tests/screens.spec.ts-snapshots/`.
- [ ] `CLAUDE.md` conserva `@AGENTS.md`, la sección `## AGENTS.md` y los párrafos de `/frontend-design` y `/ui-ux-pro-max`.
- [ ] `CLAUDE.md` está íntegramente en inglés.
- [ ] `README.md` está íntegramente en español.
- [ ] `README.md` contiene las secciones: estado actual, requisitos, puesta en marcha, comandos, pantallas, estructura, pruebas, desarrollo guiado por specs y referencias.
- [ ] La sección de estado actual dice explícitamente que los juegos no tienen motor real, que no hay backend y que la sesión es falsa.
- [ ] La versión de Node del README coincide con `engines.node` de `node_modules/next/package.json`.
- [ ] La tabla de comandos del README lista exactamente los seis scripts de `package.json` más `npx tsc --noEmit`, sin inventar ninguno.
- [ ] La tabla de pantallas lista las cinco rutas y cada fichero citado existe.
- [ ] La tabla de specs lista las tres specs con su estado y sus dependencias, y cada enlace apunta a un fichero que existe en `specs/`.
- [ ] `specs/02-nav-movil-sesion-en-hamburguesa.md` dice `**Estado:** Implementado` y ya no contiene `Aprovado`.
- [ ] Todos los comandos documentados en los dos ficheros se han ejecutado y terminan sin error.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` y `npm test` salen limpios.
- [ ] `git status` no marca ningún fichero bajo `app/`, `components/`, `lib/` o `tests/`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** `README.md` en español y `CLAUDE.md` en inglés. El README acompaña a las specs, las rutas y los comentarios del código, que ya son españoles; el `CLAUDE.md` es instrucción para el agente, cuyo `CLAUDE.md` global pide responder siempre en inglés.
- **No:** los dos en el mismo idioma. Unificar en español dejaría al agente leyendo instrucciones en un idioma y contestando en otro; unificar en inglés rompería con todo lo demás del repo.
- **Sí:** README de onboarding completo. El proyecto ya tiene cinco pantallas, dos proyectos de Playwright y un flujo de specs; trece líneas no cubren nada de eso.
- **No:** capturas de pantalla embebidas en el README. Habría que decidir dónde viven las imágenes y regenerarlas en cada cambio visual — justo el mantenimiento que esta spec intenta evitar.
- **Sí:** sección "Estado actual" explícita sobre lo que es maqueta. Sin ella, cualquiera que llegue nuevo (o el propio agente) asume que los juegos funcionan y que hay backend.
- **Sí:** reescritura completa de `CLAUDE.md` por secciones, no solo parcheo de las frases falsas. Las secciones que faltan —arquitectura y pruebas— son justo las que evitan que el agente se invente la estructura.
- **No:** regenerar `CLAUDE.md` con `/init`. Perdería los párrafos escritos a mano de `/frontend-design` y `/ui-ux-pro-max`, que son la parte que no se deduce leyendo el código.
- **Sí:** corregir `Aprovado` → `Implementado` en la SPEC 02. Es una palabra, y sin ella el README y el fichero de la spec se contradicen desde el día uno.
- **No:** tocar `AGENTS.md`. `next dev` lo reescribe; cualquier edición manual reaparece como cambio sin commitear en el siguiente arranque.
- **No:** crear `specs/README.md`. La tabla de specs vive en el README raíz, que es donde se busca. Dos índices se desincronizan.
- **Sí:** criterios de aceptación ejecutables (correr los comandos, comprobar que los ficheros citados existen). La doc actual falla precisamente por haberse validado solo leyéndola.
- **No:** añadir licencia, guía de contribución, insignias o instrucciones de despliegue. Nada de eso está decidido todavía y documentarlo sería inventar.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| La doc nueva vuelve a quedar obsoleta en dos specs | El `CLAUDE.md` describe estructura y convenciones, que cambian despacio, y evita listar cuentas exactas (número de pruebas, líneas de CSS) que se desajustan a la primera. El flujo de `/spec-impl` deja la doc como paso final cuando una spec cambia rutas o comandos. |
| Copiar versiones o números "de memoria" y volver a documentar algo falso | El paso 1 es una auditoría explícita: cada número sale de `package.json`, `node_modules/next/package.json` o `playwright.config.ts`, y los criterios de aceptación comparan contra esos ficheros. |
| `npm test` tarda mucho y se termina saltando la verificación | Es el coste real de la suite: el `webServer` hace `npm run build` + `next start`. Se asume y se ejecuta una sola vez, al final del plan. |
| Documentar Tailwind como si fuera el sistema de estilos principal | El paso 7 obliga a describir la convivencia: utilidades en el JSX, tema arcade propio en `app/globals.css`, y la regla de no convertir el CSS de pantalla a utilidades. |
| Tocar sin querer código al "verificar" | `npm run build` genera `.next/` y `tsconfig.tsbuildinfo`, ya ignorados o esperados; el criterio de `git status` limpio bajo `app/`, `components/`, `lib/` y `tests/` lo confirma. |

---

## 8. Lo que **no** entra en esta spec

- `AGENTS.md`.
- Índices de specs fuera del `README.md` raíz.
- Cualquier cambio de código, CSS, componentes o pruebas.
- Capturas embebidas, licencia, contribución, despliegue o CI.
- El contenido de las specs 01 y 02, salvo la palabra de estado de la 02.
