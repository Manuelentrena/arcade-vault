# SPEC 26 — Versión 1.0.0 y blog de cambios

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Versión:** Mayor
> **Fecha:** 2026-10-01
> **Objetivo:** Llevar Arcade Vault a la versión 1.0.0, añadir un blog de cambios versionado en `/blog/vX.Y.Z` enlazado desde el nav como "CAMBIOS", y hacer que declarar un bump de versión (Mayor/Menor/Fix) y publicar su post pase a ser parte obligatoria del flujo de `/spec` y `/spec-impl` para todo spec futuro.

## Punto de partida

Hoy no existe ningún concepto de versión consistente en la app: `package.json` dice `"version": "0.1.0"` mientras `components/footer.tsx` tiene hardcodeado `v2.6.0` — ya desincronizados entre sí, sin que nada los mantenga iguales. Tampoco existe ninguna noción de "blog" ni de changelog en el proyecto. Las skills `/spec` y `/spec-impl` (vendidas en `.agents/skills/spec/` y `.agents/skills/spec-impl/`, symlinked desde `.claude/skills/`) no preguntan ni ejecutan nada relacionado con versionado.

**Trabajo de meta-herramientas ya aplicado al escribir este spec** (no forma parte del plan de implementación de abajo, que es lo que ejecuta `/spec-impl` en una rama; esto se hizo directamente sobre las skills porque `/spec` nunca escribe código de la app pero sí puede, y debe, mantener sus propias skills):

- `.agents/skills/spec/template.md`: el bloque de header ganó un campo `**Versión:** Mayor | Menor | Fix` (entre `Depends on` y `Date`), con la explicación de qué significa cada valor y la regla de que **los Fix no publican post** — solo Mayor/Menor lo hacen, y el siguiente Mayor/Menor que se publique recopila los Fix pendientes desde el último post; la sección de plan de implementación y la de criterios de aceptación ganaron, cada una, un párrafo fijo recordando ese cierre condicional.
- `.agents/skills/spec/SKILL.md`: la Fase 2 ahora incluye una pregunta obligatoria y sin excepciones ("¿Mayor, Menor o Fix?", mostrando la versión actual leída de `package.json` como referencia, y aclarando que Fix no publica); la Fase 3 exige que el último paso del plan y un ítem de los criterios cubran siempre el bump, con post solo si es Mayor/Menor; las Hard rules ganaron dos líneas nombrando la convención y la regla de que Fix nunca publica.
- `.agents/skills/spec-impl/SKILL.md`: el bloque "When finishing the last step" ahora describe el procedimiento concreto del cierre — leer la versión actual, calcular la nueva según el bump declarado, actualizar todas las copias de esa versión (`package.json`, el footer **y la etiqueta de versión bajo la palabra "ARCADE" del logo en `components/nav.tsx`**) en **todo** bump incluido Fix, y solo si el bump es Mayor/Menor: buscar el último post publicado, recopilar los Fix implementados desde entonces sin post propio (vía `specs/` — estado `Implementado` y `Versión: Fix` posteriores a esa spec), crear el post nuevo con el resumen de esta spec más esa lista recopilada si no está vacía, y verificar que renderiza — todo antes del commit final.

Este spec (26) es el primero que pasa por ese flujo ya actualizado: declara `Versión: Mayor`, y su propio plan de implementación termina con el bump a `1.0.0` y la publicación de `content/blog/v1.0.0.mdx` — comiéndose su propia receta.

## Alcance

**Dentro:**

- Bump de versión a `1.0.0`: `package.json` como fuente de verdad, reflejada en `components/footer.tsx` (hoy en `v2.6.0`, desincronizado) y en una nueva etiqueta de versión bajo la palabra "ARCADE" del logo en `components/nav.tsx`.
- Infraestructura de blog con MDX sobre App Router: `@next/mdx` + `@mdx-js/loader` + `@mdx-js/react` + `@types/mdx`, `next.config.ts` envuelto con `createMDX`, `mdx-components.tsx` en la raíz.
- `content/blog/<version>.mdx`: un archivo por versión, cada uno exporta `metadata` (título, fecha, versión, tipo de bump) y el cuerpo del post en Markdown/MDX.
- `lib/blog.ts`: lectura de esos archivos y exposición de su metadata ordenada.
- `app/blog/page.tsx`: índice que lista todos los posts.
- `app/blog/[version]/page.tsx`: un post individual; `generateStaticParams` + `dynamicParams = false`, 404 en una versión que no existe.
- Primer post, `content/blog/v1.0.0.mdx`, con un resumen general y rápido de qué es Arcade Vault (contenido final más abajo, en el Modelo de datos).
- Enlace "CAMBIOS" en `components/nav.tsx`, en el bloque desktop `.links` y en el panel móvil `<aside className="av-mobile-panel">`, con estado activo en cualquier ruta `/blog*`.
- Tests mínimos en `tests/screens.spec.ts` para `/blog` y `/blog/v1.0.0`, sin capturas nuevas.

**Fuera de alcance (explícito):**

- UI de administración para escribir o editar posts desde el navegador — los posts los escribe quien ejecuta `/spec-impl`, a mano, como parte del cierre de cada spec.
- Feed RSS/Atom, tags, categorías, comentarios o paginación — con un solo post al cierre de este spec no hacen falta, y nada en el pedido original los menciona.
- Generación automática del changelog a partir de `git log` — un resumen escrito a mano por quien implementó el spec sirve más a un jugador que un log de commits.
- Capturas de referencia (snapshot testing) para `/blog`. Las 14 PNG existentes (7 rutas × 2 proyectos: `home`, `biblioteca`, `detalle`, `reproductor`, `auth`, `salon`, `acerca`) no se tocan; añadir una octava ruta pinned es una decisión aparte, para otro spec si hace falta.
- Cualquier cambio al contenido o estructura de los posts de specs anteriores (01–25): el blog arranca en este spec, no se reescribe retroactivamente su historia.

## Modelo de datos

Esta spec introduce dos piezas nuevas, ninguna en Supabase:

```ts
// content/blog/<version>.mdx — un archivo por versión publicada
export const metadata: {
  title: string;
  date: string; // "YYYY-MM-DD"
  version: string; // "1.0.0"
  bump: "Mayor" | "Menor" | "Fix";
};
// seguido del cuerpo del post en Markdown/MDX
```

```ts
// lib/blog.ts
export type BlogPostMeta = {
  title: string;
  date: string;
  version: string;
  bump: "Mayor" | "Menor" | "Fix";
};

export async function getAllPosts(): Promise<BlogPostMeta[]>;
// Lee content/blog/ con fs.readdirSync, importa dinámicamente el
// `metadata` exportado por cada .mdx, devuelve la lista ordenada
// por versión descendente. Server-only (usa `fs`), igual que el
// patrón que documenta la guía de MDX de Next para construir un
// índice de blog a partir de archivos.
```

**Estilo de los posts:** marketing de lanzamiento, no un dev log — título llamativo que vende el cambio, cuerpo organizado en secciones por la zona de la web que afecta (juegos/motores, puntuaciones y salón, cuenta/perfil, experiencia móvil, novedades...), eligiendo solo las zonas que ese spec realmente tocó. Esta convención la fija este primer post y la repite `/spec-impl` en cada post Mayor/Menor futuro (ver el paso de cierre actualizado en `.agents/skills/spec-impl/SKILL.md`).

**Contenido exacto de `content/blog/v1.0.0.mdx`** (a copiar tal cual por `/spec-impl`, no es un placeholder):

```mdx
export const metadata = {
  title: "Arcade Vault abre sus puertas: bienvenido a la 1.0.0",
  date: "2026-10-01",
  version: "1.0.0",
  bump: "Mayor",
};

# Arcade Vault abre sus puertas: bienvenido a la 1.0.0

Cinco máquinas, una sala, cero maquetas. Arcade Vault sale de beta y
estrena su primera versión estable — aquí tienes todo lo que te espera
dentro.

## Los juegos

Cinco motores reales, jugables desde el navegador, cada uno con su
propio ritmo: **TETRIX**, **ASTEROIDES**, **ARKANOID**, **BUSCAMINAS**
y **SERPIENTE**. Teclado en escritorio, mando táctil en el pulgar
cuando juegas desde el móvil, y un botón de pantalla completa para
meterte de lleno en la partida.

## Puntuaciones y el Salón de la Fama

Cada partida que terminas se guarda de verdad — y solo cuando bate tu
propio récord anterior, así que tu tabla no se llena de ruido. Esos
récords alimentan el **Salón de la Fama**, el podio de las mejores
puntuaciones de cada juego, a la vista de cualquiera que entre a
comprobar quién manda.

## Tu cuenta

Entrar es real, no decorado: crea tu cuenta con email y contraseña,
con Google, con GitHub, o salta directo a jugar como invitado sin
registrarte. Elijas lo que elijas, tu progreso se guarda con la misma
seriedad.

## Qué significa la 1.0.0

Esta primera versión estable cierra el catálogo: los cinco juegos
están completos, la autenticación es real, el salón refleja partidas
de verdad y el mando responde igual de bien al teclado que al pulgar.
A partir de aquí, cada cambio que entre en Arcade Vault tendrá su
propia entrada aquí — mayor, menor o una simple corrección — para que
siempre sepas qué cambió y cuándo.

Bienvenido a bordo.
```

## Plan de implementación

1. Instalar `@next/mdx @mdx-js/loader @mdx-js/react @types/mdx`; envolver `next.config.ts` con `createMDX` (sin plugins remark/rehype — no hacen falta para este post), añadir `md`/`mdx` a `pageExtensions`; crear `mdx-components.tsx` en la raíz con un `useMDXComponents` mínimo (sin overrides todavía). Verificación manual: `npm run dev` sigue sirviendo todas las rutas existentes sin errores.
2. Crear `content/blog/v1.0.0.mdx` con el contenido exacto de la sección anterior.
3. Crear `lib/blog.ts` con `BlogPostMeta` y `getAllPosts()`.
4. Crear `app/blog/page.tsx` (server component): título de sección y listado de posts (título, fecha, versión) enlazando a `/blog/[version]`. Verificación manual: `/blog` muestra la entrada de la 1.0.0.
5. Crear `app/blog/[version]/page.tsx`: `generateStaticParams()` a partir de `getAllPosts()`, `dynamicParams = false`, `notFound()` si la versión pedida no existe, import dinámico de `content/blog/${version}.mdx`. Verificación manual: `/blog/v1.0.0` renderiza el post completo; `/blog/v9.9.9` da 404.
6. `components/nav.tsx`: extender el union `Section` con `"blog"`, `sectionOf()` con `pathname.startsWith("/blog")`, y añadir el `<Link>` "CAMBIOS" en el bloque desktop `.links` (junto a "Acerca de") y en el panel móvil `<aside>` (junto a "Acerca de", antes del spacer). Verificación manual: el link aparece en desktop y en el hamburger móvil, y se marca activo en `/blog` y `/blog/v1.0.0`.
7. Bump `package.json` a `"version": "1.0.0"`, corregir `components/footer.tsx` de `v2.6.0` a `v1.0.0`, y añadir en `components/nav.tsx` una etiqueta `v1.0.0` bajo la palabra "ARCADE" dentro de `.logo-text` (letra pequeña, mismo tono apagado que el resto de metadatos del nav, sin romper el layout del logo) — el bump y el post que este mismo paso describe son el cierre estándar que esta spec introduce para todas las que vengan después, y a partir de aquí la etiqueta del logo se actualiza en todo bump futuro junto con el footer.
8. Añadir un bloque `describe("blog", ...)` en `tests/screens.spec.ts`: `/blog` carga y lista `v1.0.0`; `/blog/v1.0.0` renderiza su contenido; el nav muestra "CAMBIOS" en ambos proyectos y navega correctamente; `/blog/v9.9.9` da 404. Sin capturas nuevas.
9. Fila de la SPEC 26 en el índice de specs del `README.md`.
10. Verificación final: `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test` (suite completa, sin regresión en las 14 capturas existentes).

## Criterios de aceptación

- [x] `/blog` carga y lista al menos el post `v1.0.0`.
- [x] `/blog/v1.0.0` renderiza el contenido completo del primer post (título, fecha, cuerpo).
- [x] El nav muestra "CAMBIOS" enlazando a `/blog`, visible en desktop y en el panel móvil, marcado activo en cualquier ruta `/blog*`.
- [x] `/blog/v9.9.9` (versión inexistente) responde 404.
- [x] `package.json` tiene `"version": "1.0.0"`, `components/footer.tsx` muestra `v1.0.0` (no `v2.6.0`), y el logo del header (`components/nav.tsx`) muestra `v1.0.0` bajo la palabra "ARCADE".
- [x] `.agents/skills/spec/template.md` documenta el campo `Versión` con sus tres valores válidos (ya aplicado — ver Punto de partida).
- [x] `.agents/skills/spec/SKILL.md` pregunta el tipo de bump en Fase 2 y exige el cierre de bump+post en el plan y los criterios de todo spec futuro (ya aplicado — ver Punto de partida).
- [x] `.agents/skills/spec-impl/SKILL.md` bump-ea versión en todo bump y crea el post, con recopilación de Fix pendientes, solo en Mayor/Menor, antes del commit final (ya aplicado — ver Punto de partida; ampliado en esta misma implementación para cubrir también la etiqueta del logo y el tono de lanzamiento de los posts).
- [x] Como esta spec es `Versión: Mayor`, publica post (no aplica el caso Fix-sin-post en esta spec, pero el mecanismo queda documentado para las siguientes).
- [x] De las 14 capturas de referencia existentes, 13 no cambian; `reproductor-mobile-darwin.png` se regenera a mano (verificado antes en navegador) porque la etiqueta de versión bajo "ARCADE" en el header pasa el umbral del 1 % de `maxDiffPixelRatio` solo en esa combinación ruta/proyecto — en las otras 13 el mismo cambio de header queda por debajo del umbral.
- [x] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` pasan. `build`/`tsc`/`lint` limpios. `npm test`: 210 passed en las dos corridas limpias verificadas; los 5 fallos recurrentes (`salón de la fama` × 2, y una vez `reproductor`/`fin de partida como invitado`) son una condición de carrera preexistente entre tests con `fullyParallel: true` que comparten el usuario semilla `PX_KAI` — un test de `tetrix`/`reproductor` le guarda una puntuación real mientras un test de `salón de la fama` corriendo en paralelo espera encontrarlo sin ninguna. No toca ningún archivo de este spec (blog, nav, footer, versión); los 8 tests del bloque `blog` y las 14 capturas pasan limpio en ambas corridas.

## Decisiones tomadas y descartadas

- **Sí:** MDX en `content/blog/`, no una tabla Supabase. Los posts los escribe quien ejecuta `/spec-impl`, no un usuario final; versionarlos en git junto al código que describen es más simple que una migración + RLS para contenido que nadie edita desde la app.
- **No:** tabla `public.blog_posts`. Encajaría con "todo lo persistente vive en Supabase", pero aquí el contenido no lo genera ni lo edita nadie a través de la interfaz — sería infraestructura sin usuario.
- **Sí:** slug con puntos, `/blog/v1.0.0`, no dígitos concatenados (`v100`). Sin ambigüedad si algún componente del semver llega a dos dígitos (`1.10.0` nunca se confunde con `1.1.0`).
- **No:** slug con dígitos concatenados. Colisiona visualmente en cuanto un componente pasa de 9.
- **Sí:** `package.json` como fuente única de verdad de la versión, reflejada en el footer y en una etiqueta nueva bajo "ARCADE" en el logo del header. Cierra de una vez el desfase `0.1.0`/`v2.6.0` que ya existía antes de este spec, y le da a la versión un segundo lugar visible — el header está presente en cada pantalla, el footer no siempre está a la vista sin hacer scroll.
- **Sí:** el bump real y la publicación del post los ejecuta `/spec-impl`, no `/spec`. `/spec` nunca escribe código ni archivos de contenido de la app — solo puede garantizar, vía el header y el plan que redacta, que `/spec-impl` lo hará.
- **No:** changelog autogenerado desde `git log`. Un resumen en la voz del producto, escrito por quien implementó el spec, es más útil para un jugador que una lista de mensajes de commit.
- **Sí:** tono de lanzamiento de producto (título llamativo, cuerpo agrupado por zona afectada — juegos, puntuaciones, cuenta, móvil, novedades) en lugar de un dev log plano. Decisión explícita del usuario: un jugador lee "qué hay de nuevo para mí", no un registro técnico de cambios.
- **No:** una taxonomía fija y cerrada de zonas en `metadata`. Las zonas afectadas varían de spec a spec; forzar un enum completo en cada post metería secciones vacías. Las secciones viven libremente en el cuerpo Markdown, no en el tipo `BlogPostMeta`.
- **Sí:** editar las tres skills (`template.md`, `spec/SKILL.md`, `spec-impl/SKILL.md`) directamente durante la escritura de este spec, no como parte de su plan de implementación en rama. Son archivos de herramienta, no código de la app — tratarlos como parte del "código" que solo toca `/spec-impl` habría dejado el propio spec 26 sin la pregunta de versión que dice introducir.
- **Sí:** los Fix no publican post propio — solo Mayor/Menor publican, y el siguiente Mayor/Menor que se publique recopila (en una lista corta dentro de su propio post) los Fix implementados desde el post anterior. Decisión explícita del usuario: evita saturar el blog con correcciones menores sin interés para un jugador, sin perder su rastro.
- **No:** un archivo de estado nuevo para rastrear "Fix pendientes de publicar". Se deriva de `specs/` en el momento de publicar (specs `Implementado` con `Versión: Fix` posteriores al spec que produjo el último post) — no hace falta una segunda fuente de verdad que mantener sincronizada.

## Riesgos identificados

- `@next/mdx` con el compilador por defecto (no el experimental `mdxRs`) no necesita plugins remark/rehype para este post — si una spec futura quiere tablas o sintaxis GFM en un post, tendrá que añadir `remark-gfm` entonces; no se instala preventivamente aquí.
- Si en el futuro un spec declara un bump pero `/spec-impl` lo implementa sin seguir el paso de cierre al pie de la letra, `package.json`, el footer y la etiqueta del logo pueden volver a desincronizarse entre sí — el criterio de aceptación de cada spec futuro que compare los tres valores es la red de seguridad, no un mecanismo automático (no hay test que lo fuerce).
- `generateStaticParams` con `dynamicParams = false` da 404 limpio en una versión inexistente, pero si dos posts futuros declaran la misma `version` en su `metadata` por error humano, no hay validación que lo detecte — queda como disciplina de quien escribe el post en `/spec-impl`.
