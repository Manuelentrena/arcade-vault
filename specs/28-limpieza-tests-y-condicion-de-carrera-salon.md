# SPEC 28 — Limpieza de la suite de tests y condición de carrera del salón

> **Estado:** Implementado
> **Depende de:** SPEC 06 (Supabase Auth real), SPEC 07 (modo invitado), SPEC 16/17/18 (catálogo y puntuaciones reales), SPEC 21/22 (mando móvil y menú en el tubo), SPEC 26 (versión y blog), SPEC 27 (documenta la condición de carrera como riesgo conocido, sin arreglarla)
> **Versión:** Fix
> **Fecha:** 2026-10-02
> **Objetivo:** Recortar los tests de `tests/screens.spec.ts` que no protegen ningún riesgo real, y arreglar de una vez la condición de carrera entre los tests que escriben una puntuación real de PX_KAI y los que asumen el catálogo de `scores` vacío.

## Punto de partida

`tests/screens.spec.ts` tiene 2.968 líneas, 27 `describe` y 120 bloques `test()` (dos de ellos son bucles sobre las 7 rutas de `ROUTES`, así que el número de instancias reales por corrida es mayor). SPEC 26 verificó la suite completa en "210 passed" en sus dos últimas corridas limpias.

**La condición de carrera** (documentada como riesgo conocido en SPEC 26 y de nuevo en SPEC 27, sin arreglarse en ninguna de las dos): tres tests escriben una puntuación real de PX_KAI en `scores` corriendo en paralelo con `fullyParallel: true` y `workers: 2` (`playwright.config.ts`):

- `reproductor` → "quedarse sin vidas abre el panel y la primera puntuación se guarda como récord" (ARKANOID, solo desktop).
- `fin de partida como invitado` → "al volver con sesión, una partida récord se autoguarda de verdad" (ASTEROIDES).
- `actividad en vivo` → "una partida récord real aparece en ambas tarjetas" (BUSCAMINAS, añadido por SPEC 27 con el comentario explícito `// Riesgo conocido (SPEC 27): si otra prueba en paralelo guarda una puntuación real mientras esta corre, puede dejar de ver el vacío.`).

Mientras tanto, otros dos tests asumen que **ningún** jugador tiene puntuación en **ningún** juego:

- `actividad en vivo` → "sin puntuaciones guardadas muestra el estado vacío en ambas tarjetas".
- `salón de la fama` → "muestra los chips y el estado vacío".

Los tres juegos elegidos para "guardar de verdad" (ARKANOID, ASTEROIDES, BUSCAMINAS) se escogieron precisamente para no competir **entre sí**, pero nada impide que cualquiera de los tres corra en paralelo con uno de los dos tests de "estado vacío" — que es justo el fallo intermitente que SPEC 26 reportó ("salón de la fama" × 2 y una vez "reproductor"/"fin de partida" en 210 tests).

## Alcance

**Dentro:**

- Arreglar la condición de carrera con `dependencies` + `grep`/`grepInvert` de Playwright (ver Decisiones): un project nuevo `orden-global` ejecuta los dos tests de "estado vacío" primero y hasta el final, y `desktop`/`mobile` —que de ellos dependen— los excluyen de su propia ejecución.
- Quitar el comentario "Riesgo conocido (SPEC 27)" y cualquier otro que documente esta carrera como sin arreglar, ya que deja de serlo.
- Borrar 3 tests que no protegen ningún comportamiento no cubierto ya por otro test vigente:
  - `arkanoid` → "la banda de leyenda sólo se ve en móvil, con los dos premios" — ya cubierto por `mando de consola en móvil` → "cada juego reserva su banda de leyenda dentro del tubo" (que revisa ARKANOID junto con los otros 4, y vive en un `describe` ya filtrado a móvil).
  - `reproductor` → "el botón de pantalla completa existe en los dos viewports" — ya cubierto por `el reproductor de escritorio no se entera del mando` → "PAUSA, MENÚ y ⛶ siguen en el HUD" (desktop) y `mando de consola en móvil` → "el HUD se queda con ⛶ y nada más" (móvil).
  - `reproductor` → "el reproductor entero no se puede seleccionar" — comprobación de una propiedad CSS (`user-select: none`) sin ningún comportamiento de juego detrás; no protege ninguna regresión funcional.
- Fusionar, sin perder ninguna aserción, 6 grupos de tests redundantes en su forma (duplicados exactos, o misma secuencia repetida por motor):
  - `home` → "EXPLORAR JUEGOS lleva a la biblioteca" + "VER SALÓN lleva al salón de la fama" → un solo test que comprueba los dos enlaces.
  - `biblioteca` → los 3 tests de chip de categoría (SHOOTER, ARCADE, PUZZLE) → un solo test parametrizado sobre las 3 categorías.
  - `mando de consola en móvil` → "el panel cabe en el tubo sin desplazamiento" + "los botones del panel forman una sola columna" → un solo test que pierde una partida de invitado una sola vez (ambos usan `playAsGuest` + `loseArkanoid`, con `test.slow()` por los ~11s que cuesta) y comprueba las dos cosas sobre ese mismo panel.
  - "PAUSA congela la partida" en `tetrix`, `asteroides`, `arkanoid` y `buscaminas` (misma forma exacta: puntuar algo, pulsar PAUSA, comprobar "EN PAUSA" y puntuación congelada) → un solo test parametrizado sobre esos 4 slugs, que visita cada motor por separado dentro del bucle. La versión de `serpiente` (comparación de huella de canvas, no de marcador) se queda aparte, es un mecanismo distinto.
  - "puntúa y no desplaza la página" en `tetrix` (hard drop), `arkanoid` (romper ladrillos) y `buscaminas` (revelar) — misma forma exacta: pulsar Espacio, comprobar `score > 0` y `scrollY` sin cambios — → un solo test parametrizado sobre esos 3 slugs. Las versiones de `asteroides` (mantener Espacio, solo comprueba scroll, no puntuación) y `serpiente` (girar, no puntúa por tecla) se quedan aparte, prueban mecánicas distintas.
  - "arranca con..." de `tetrix`, `asteroides`, `arkanoid` y `buscaminas` (4 tests: tablero visible, HUD en 0/nivel 01, botones del mando interno con sus `aria-label`, ausencia de PAUSA en el tubo — cada uno con su propia tabla de rótulos/cantidad de botones) → un solo test parametrizado sobre una tabla de configuración por slug (`boardAlt`, cantidad de botones, rótulos de columna cuando aplique, lista de `aria-label`). Cero pérdida: cada motor se sigue comprobando por separado dentro del bucle, solo cambia que se reporta como un `test()` en vez de cuatro. La versión de `serpiente` (línea 1601, ya con menos aserciones y `test.skip(isMobile)`) se queda aparte por tener una forma distinta.
- Cierre estándar: bump de versión **Fix** (sin post de changelog).
- Fila de la SPEC 28 en el índice de specs del `README.md`.

**Fuera de alcance (explícito):**

- Las 14 capturas de referencia (`capturas de referencia`, pixel-diff) — decisión explícita del usuario, no se tocan.
- Los tests de módulo puro (`arkanoid — motor de premios y multibola`, `serpiente — motor`) — se revisaron contra el mismo criterio y no se encontró redundancia real: son los más baratos de la suite (sin navegador, sin Supabase) y los únicos que aíslan reglas de negocio exactas (multiplicadores, topes de bolas/ensanches) sin depender de la suerte de una partida real.
- Nada queda ya que sea redundancia pura sin coste de cobertura: la única fusión "gratis" que faltaba (los 5 "arranca con...") se añadió al Alcance. Ir más allá de ahí exige aceptar perder cobertura real (muestrear menos motores en los chequeos genéricos), lo que esta spec no decide unilateralmente — ver Decisiones.
- Añadir cobertura nueva (accesibilidad, flujos no probados hoy) — esta spec poda y arregla, no expande.
- Cambiar qué juego usa cada test de guardado real (ARKANOID/ASTEROIDES/BUSCAMINAS) o la cuenta semilla `PX_KAI` de `supabase/seed.sql` — ya resuelto por SPEC 27 para que no choquen entre sí; no se toca.
- Cambiar `workers`, `fullyParallel` o los viewports existentes de `playwright.config.ts` — el arreglo de la carrera usa `dependencies`/`grep`, no reduce el paralelismo del resto de la suite.
- Un objetivo numérico de recorte fijado de antemano — el usuario lo dejó a criterio de riesgo real; el resultado de aplicar ese criterio (3 tests borrados, 6 fusiones) baja la suite de 120 a 105 bloques `test()`, sin tocar las capturas de referencia ni los módulos puros.

## Modelo de datos

Esta spec no introduce ninguna estructura de datos nueva. Solo reorganiza `tests/screens.spec.ts` y añade un `project` a `playwright.config.ts`.

## Plan de implementación

1. **`playwright.config.ts` — project `orden-global`.** Añadir un tercer project junto a `desktop`/`mobile`:

   ```ts
   {
     name: "orden-global",
     grep: /@orden-global/,
     use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
   },
   ```

   y a `desktop`/`mobile` añadirles `dependencies: ["orden-global"]` y `grepInvert: /@orden-global/`. Verificación manual: `npx playwright test --project=orden-global --list` lista exactamente los dos tests del paso 2, sin ejecutarlos.

2. **`tests/screens.spec.ts` — etiquetar las dos aserciones de catálogo vacío.** Añadir `{ tag: "@orden-global" }` como segundo argumento de `test(...)` en `actividad en vivo` → "sin puntuaciones guardadas muestra el estado vacío en ambas tarjetas" y en `salón de la fama` → "muestra los chips y el estado vacío". Borrar el comentario `// Riesgo conocido (SPEC 27): ...` que ya no aplica. Verificación manual: `npx playwright test --project=orden-global --list` sigue mostrando los mismos dos tests.

3. **`tests/screens.spec.ts` — borrar los 3 tests redundantes.** Confirmar antes de cada borrado que la aserción equivalente sigue viva en el test que la sustituye (los tres casos están listados en el Alcance). Verificación manual: `grep -c "^\s*test(" tests/screens.spec.ts` baja en 3.

4. **`tests/screens.spec.ts` — fusionar los CTA del home.** Un solo test `"los CTA del home navegan a biblioteca y salón"` con las dos navegaciones y sus dos `expect(page).toHaveURL(...)` secuenciales.

5. **`tests/screens.spec.ts` — fusionar los 3 tests de chip de categoría.** Un array `[{ chip: "SHOOTER", esperados: ["ASTEROIDES"] }, { chip: "ARCADE", esperados: ["ARKANOID", "SERPIENTE"] }, { chip: "PUZZLE", esperados: ["TETRIX", "BUSCAMINAS"] }]` recorrido con un `for` dentro de un solo `test()`, conservando la comprobación de portada real (`cover-shot`, `src`) para ASTEROIDES y SERPIENTE que ya hacían los tests originales.

6. **`tests/screens.spec.ts` — fusionar los 2 tests del panel de invitado en móvil.** Un solo test que hace `playAsGuest` + `loseArkanoid` una vez y comprueba, sobre el mismo `.crt-menu`, que `scrollHeight <= clientHeight` y que los botones (`.btn`) comparten un único ancho.

7. **`tests/screens.spec.ts` — fusionar "PAUSA congela la partida" de los 4 motores con bucle simple.** Un array `[{ slug: "tetrix", board: ".tetris-board" }, { slug: "asteroides", board: ".rocks-field" }, { slug: "arkanoid", board: ".ark-board" }, { slug: "buscaminas", board: ".minas-board" }]` recorrido con un `for` dentro de un solo `test()`, repitiendo para cada slug la secuencia que ya hacía cada test individual (abrir el juego, puntuar, pulsar PAUSA, comprobar "EN PAUSA" y marcador congelado, reanudar). La versión de `serpiente` no entra: compara huella de canvas, no marcador, y vive en su propio test.

8. **`tests/screens.spec.ts` — fusionar "puntúa y no desplaza la página" de los 3 motores con la misma forma.** Un array `[{ slug: "tetrix", trigger: "hard drop" }, { slug: "arkanoid", trigger: "romper ladrillo" }, { slug: "buscaminas", trigger: "revelar" }]` recorrido igual: abrir el juego, pulsar Espacio, comprobar `score > 0` y `scrollY` sin cambios. Las versiones de `asteroides` y `serpiente` no entran: prueban mecánicas distintas (mantener tecla / girar) y se quedan en sus propios tests.

9. **`tests/screens.spec.ts` — fusionar los 4 "arranca con..." parametrizables.** Un array de configuración por slug (`tetrix`, `asteroides`, `arkanoid`, `buscaminas`) con el selector del tablero, la cantidad de botones del mando interno, sus rótulos/`aria-label` y, cuando aplique, los rótulos de columna y la leyenda — recorrido con un `for` dentro de un solo `test()`, repitiendo para cada slug exactamente las aserciones que ya hacía su test individual. `serpiente` (forma distinta, menos aserciones) se queda en su propio test.

10. **`README.md`** — fila de la SPEC 28 en el índice de specs.

11. **Cierre.** Bump de versión **Fix** — `package.json`, `components/footer.tsx` y la etiqueta `v1.0.1` bajo "ARCADE" en `components/nav.tsx` pasan a `1.0.2`. Sin post de changelog. `npx tsc --noEmit` y `npm run lint` se corren tras cada paso si hace falta, pero **`npm test` se corre una sola vez al final de todo el plan, nunca entre pasos intermedios** — la suite tarda minutos porque `pretest` reinicia la base y `webServer` hace un build de producción, y el usuario pidió explícitamente minimizar las corridas mientras se ejecuta esta spec. Al final, correrla **dos veces consecutivas** (como hizo SPEC 26) para confirmar que la condición de carrera no reaparece de forma intermitente.

## Criterios de aceptación

- [x] `playwright.config.ts` tiene un project `orden-global` del que `desktop` y `mobile` dependen (`dependencies`), y los tres usan `grep`/`grepInvert` de forma que los tests `@orden-global` corren una sola vez cada uno, no tres. (El project terminó con 3 tests, no 2 — ver Riesgos identificados.)
- [x] Dos corridas consecutivas de `npm test` completas no reproducen el fallo histórico de "salón de la fama" ni "actividad en vivo" por condición de carrera.
- [x] Los 3 tests redundantes listados en el Alcance ya no existen en `tests/screens.spec.ts`, y la aserción que cada uno protegía sigue viva en el test que la sustituye.
- [x] Las 6 fusiones existen como un solo `test()` cada una, con las mismas aserciones que los tests originales que sustituyen (incluyendo que cada motor afectado sigue visitándose por separado dentro del bucle, en las tres fusiones parametrizadas por motor).
- [x] `grep -c "^\s*test(" tests/screens.spec.ts` baja de 120 a 105.
- [x] Ningún test de `capturas de referencia`, `arkanoid — motor de premios y multibola` ni `serpiente — motor` cambió.
- [x] `package.json`, `components/footer.tsx` y la etiqueta del logo en `components/nav.tsx` muestran `1.0.2`.
- [x] Como esta spec es `Versión: Fix`, no se crea ninguna entrada nueva en `/blog`.
- [x] `npx tsc --noEmit` y `npm run lint` pasan. `npm test` pasa en sus dos corridas finales consecutivas. **Con una excepción al "no se ejecutó en ningún paso intermedio":** la primera corrida completa (antes de las dos finales) reveló las dos carreras adicionales descritas en Riesgos identificados, y hicieron falta dos corridas completas más para diagnosticarlas y confirmar el arreglo antes de las dos corridas finales limpias. No fue un desvío gratuito del plan — se activó porque la implementación tal como estaba escrita no bastaba para la condición de carrera que el Objetivo pedía resolver "de una vez".

## Decisiones tomadas y descartadas

- **Sí:** arreglar la condición de carrera con `dependencies` + `grep`/`grepInvert` de Playwright. Resuelve el fondo del problema —orden garantizado— sin ralentizar el resto de la suite: solo los dos tests `@orden-global` corren en serie antes de que empiece el paralelismo habitual de `desktop`/`mobile`.
- **No:** bajar `workers` a 1 o quitar `fullyParallel`. Eliminaría la carrera a costa de ralentizar toda la suite, justo lo que el usuario pidió evitar.
- **No:** dar a los tests de "estado vacío" una cuenta semilla distinta de `PX_KAI`. La aserción es sobre puntuaciones de **cualquier** jugador en el juego, no solo de PX_KAI — cambiar de cuenta no aísla nada, el catálogo sigue siendo compartido entre todos los tests.
- **Sí:** el criterio de recorte fue "cobertura de riesgo real", no "solo lo atado a un criterio de aceptación vigente". La arquitectura de 5 motores independientes —cada uno en su propio archivo, sin bucle compartido (ver `references/started-games/games.md`)— significa que "PAUSA congela" y "puntúa y no desplaza" siguen visitando cada motor por separado tras la fusión (el parametrizado no se salta ninguno); lo que cambia es solo que se reporta como un `test()` en vez de varios, no qué se verifica.
- **No:** recortar los tests de módulo puro de ARKANOID y SERPIENTE. Son los más baratos de la suite (sin navegador, sin Supabase, sin partida real) y los únicos que verifican reglas de negocio exactas —multiplicadores de puntuación, topes de bolas y ensanches— que un test de browser no puede aislar con la misma precisión.
- **Sí:** fusionar en vez de borrar cuando dos tests miden cosas distintas sobre el mismo estado costoso de montar (el panel de invitado tras perder una partida real de ARKANOID, con `test.slow()` por los ~11 segundos que cuesta). Mantiene la misma cobertura y evita pagar esa partida dos veces.
- **No:** fijar de antemano un número de tests a recortar. El usuario pidió aplicar criterio, no una meta; el resultado —3 borrados y 6 fusiones sobre 120, hasta 105— sigue siendo menor de lo que "demasiados tests" sugería, porque la mayor parte del tamaño de la suite protege un riesgo genuino por motor o por flujo, no redundancia pura.
- **Sí:** aplicar la fusión paramétrica también a "PAUSA congela la partida" (4→1), "puntúa y no desplaza la página" (3→1) y "arranca con..." (4→1) tras que el usuario señalara, dos veces, que el recorte se quedaba corto. Ninguna de las tres pierde cobertura: cada motor se sigue visitando dentro del bucle, solo baja el número de bloques `test()` reportados.
- **No:** ir más allá de la fusión paramétrica — p. ej. muestrear solo 2 de los 5 motores en los chequeos genéricos en vez de 4-5 — sin que el usuario lo pida explícitamente. A diferencia de las fusiones anteriores, eso sí perdería cobertura real (un motor dejaría de probarse en ese chequeo), y es una decisión de riesgo que le corresponde al usuario, no a esta spec por iniciativa propia.
- **Sí:** dejar las 14 capturas de referencia intactas. Decisión explícita del usuario en la fase de preguntas: son regresión visual real por ruta, sin redundancia entre ellas.

## Riesgos identificados

- Si una spec futura añade un sexto juego y necesita su propio test de "primera puntuación real" (siguiendo el patrón de SPEC 27), debe seguir eligiendo un juego sin colisión con los ya usados (ARKANOID/ASTEROIDES/BUSCAMINAS) para no competir entre sí — eso no cambia con esta spec. Lo que sí queda resuelto es que, elija el juego que elija, los tres tests `@orden-global` ya no pueden chocar con él porque corren antes y hasta el final, no por depender de qué juego quede "libre".
- Fusionar los 3 tests de chip de categoría de `biblioteca` en uno parametrizado hace que un fallo futuro reporte un solo nombre de test para las 3 categorías en vez de uno específico por categoría; se acepta porque la traza de Playwright sigue señalando qué iteración del bucle falló.
- El project `orden-global` reutiliza el mismo `webServer` que `desktop`/`mobile` (no levanta un segundo servidor); si en el futuro CI introduce sharding entre máquinas, las `dependencies` de Playwright exigen que el project dependido corra en el mismo shard que sus dependientes — no aplica hoy porque este repo no tiene CI con sharding, pero queda anotado por si se añade.
- **Dos carreras más, encontradas al correr la suite completa durante la implementación, fuera del Alcance original — el usuario pidió arreglar las dos en esta misma spec:**
  - `salón de la fama` → "con sesión aparece TU MEJOR MARCA" asume que PX_KAI no tiene marca en la pestaña por defecto del salón. `games[0]` es siempre ARKANOID (empate de `created_at` entre TETRIX/ASTEROIDES/ARKANOID, gana el slug), así que esta prueba choca de forma determinista — no probabilística — con el test de guardado real de ARKANOID en "reproductor" cuando éste corre primero. Arreglo: se añadió a `@orden-global`, el mismo mecanismo del paso 1/2 de esta spec. El project `orden-global` pasa de 2 a 3 tests.
  - "al volver con sesión, una partida récord se autoguarda de verdad" (ASTEROIDES) y "una partida récord real aparece en ambas tarjetas" (BUSCAMINAS) corrían sin `test.skip(isMobile)`, a diferencia de su equivalente de ARKANOID. Las tres usan la misma cuenta (PX_KAI) y, dentro de cada una, el mismo juego en los dos proyectos (`desktop`/`mobile`); con puntuación aleatoria, quien corra segundo tiene ~50% de puntuar por debajo de lo que el primero ya guardó, y entonces no registra como récord nuevo. Se confirmó en vivo: ambas fallaron de forma intermitente durante las corridas de verificación de esta spec. Arreglo: mismo `test.skip(isMobile, …)` que ya tenía ARKANOID, aplicado también a estas dos.
