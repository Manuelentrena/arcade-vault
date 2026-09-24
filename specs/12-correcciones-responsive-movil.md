# SPEC 12 — Correcciones responsive en móvil: captcha, tabla del salón y podio

> **Estado:** Implementado
> **Depende de:** SPEC 11
> **Fecha:** 2026-09-24
> **Objetivo:** Corregir tres defectos de maquetación que sólo se ven por debajo de 720px — el widget de Turnstile desbordando la tarjeta de `/auth`, la tabla del Salón de la Fama saliéndose por la derecha y el podio apilándose en orden plata-oro-bronce.

---

## 1. Punto de partida

Los tres defectos son de CSS, ninguno de lógica. Están medidos sobre el viewport que emula la suite (`playwright.config.ts`, proyecto `mobile`: iPhone 13, 390 × 844), no estimados.

### 1.1 El captcha se sale de la tarjeta

La SPEC 11 hizo visible el widget de Turnstile y dejó escrito que `size: normal` (300 × 71) «cabe de sobra en los 382px de la tarjeta y en el viewport móvil de 390px». Los 382px eran los del escritorio. En móvil la cuenta es otra:

| Tramo | Ancho |
| --- | --- |
| Viewport | 390px |
| `.av-auth-wrap` — `padding: 60px 20px` (`app/globals.css:1497`) | −40px |
| `.auth-card` — `width: min(440px, 100%)` | 350px |
| `.auth-card` — `padding: 28px` (`app/globals.css:1503`) | −56px |
| **Ancho útil dentro de la tarjeta** | **294px** |
| **Ancho del widget de Turnstile** | **300px** |

Faltan **6px**. El iframe de Cloudflare tiene ancho fijo: no se encoge, se sale. Y como `.av-captcha` está centrado con `justify-content: center`, se sale 3px por cada lado. En 360px el déficit sube a 36px y en 320px a 76px.

No hay ninguna `@media` que toque `.av-auth-wrap` ni `.auth-card`: los paddings de escritorio se aplican tal cual en móvil.

### 1.2 La tabla del salón se sale por la derecha

`app/globals.css:1776` estrecha la tabla por debajo de 720px:

```css
@media (max-width: 720px) {
  .hall-table .th,
  .hall-table .tr {
    grid-template-columns: 50px 1fr 90px 90px;
    font-size: 12px;
    padding: 10px 12px;
  }
}
```

El problema es la cabecera. `.th` no hereda el `font-size: 12px` de la regla: se lo pisa su propia declaración `font-family: var(--pixel); font-size: 10px; letter-spacing: 0.16em` (`app/globals.css:1717`). Press Start 2P es de ancho fijo, así que cada carácter ocupa ~11.6px con ese espaciado:

| Celda | Caracteres | Ancho aproximado | Pista asignada |
| --- | --- | --- | --- |
| `RANGO` | 5 | ~58px | 50px |
| `JUGADOR` | 7 | ~81px | `1fr` |
| `PUNTUACIÓN` | 10 | ~116px | 90px |
| `FECHA` | 5 | ~58px | 90px |

Dos consecuencias a la vez. Las pistas de 50px y 90px son fijas, así que `RANGO` y `PUNTUACIÓN` se derraman fuera de su celda y pisan la de al lado. Y la pista `1fr` tiene mínimo automático `min-content`, así que `JUGADOR` la empuja hasta ~81px y el ancho total de la fila supera los 358px que deja `.av-hall` (`padding: 0 16px`) — de ahí el desbordamiento por la derecha de toda la caja.

`/juego/[id]` **no está afectada**: `components/leaderboard.tsx` usa `.lb-row`, tres columnas y sin fila de cabecera.

### 1.3 El podio apila plata, oro, bronce

`components/hall-of-fame.tsx` escribe los tres huecos en el orden **visual** que necesita el escritorio, donde el grid es `1fr 1.2fr 1fr` y el campeón va en el centro:

```
DOM:      silver → gold → bronze
Escritorio: [ 02 ] [ 01 ] [ 03 ]   ✓ podio
```

Por debajo de 720px (`app/globals.css:1646`) el grid colapsa a `grid-template-columns: 1fr` y apila en orden de DOM:

```
Móvil:  02 → 01 → 03   ✗ plata, oro, bronce
```

No es un fallo del componente: el DOM está bien para lo que se diseñó. Lo que falta es decirle al móvil que el orden de apilado no es el de origen.

---

## 2. Alcance

**Dentro:** paddings de `.av-auth-wrap` y `.auth-card` por debajo de 720px · scroll horizontal de `.hall-table` con ancho mínimo de fila · reordenación del podio con `order` dentro de la media query · región desplazable accesible en `components/hall-of-fame.tsx` · regeneración de las dos capturas de referencia de `mobile` afectadas · fila de la SPEC 12 en el índice de specs del `README.md`.

**Fuera (para futuras specs):** cualquier cambio en `appearance` o `size` del widget de Turnstile · escalado del widget con `transform` para viewports por debajo de 360px · cubrir el widget en la suite de Playwright · reflujo de la tabla del salón a tarjetas apiladas · la tabla de `/juego/[id]` (`.lb-row`, no está afectada) · cabecera pegajosa (`position: sticky`) en la tabla desplazable · cualquier cambio en `lib/scores.ts`, en las semillas o en el marcador falso del jugador · capturas de referencia del proyecto `desktop`.

---

## 3. Contrato

### 3.1 Modelo de datos

**Ninguno.** Esta spec no introduce estructuras nuevas ni en cliente ni en base de datos. No toca `lib/`, ni `app/`, ni `proxy.ts`, ni ninguna migración. Los únicos ficheros de código que cambian son `app/globals.css` y `components/hall-of-fame.tsx`.

### 3.2 Tarjeta de `/auth` en móvil

Bloque nuevo dentro de la `@media (max-width: 720px)` que ya existe en `app/globals.css:1776`:

```css
/* El widget de Turnstile mide 300px fijos y no se encoge (SPEC 11). Con los
   paddings de escritorio la tarjeta sólo deja 294px útiles a 390px de ancho y
   el iframe se sale. Estos paddings dejan 334px. */
.av-auth-wrap {
  padding: 40px 12px;
}
.auth-card {
  padding: 24px 16px;
}
```

La cuenta nueva a 390px: `390 − 24 − 32 = 334px` útiles, 34px de margen sobre los 300 del widget.

`width: min(440px, 100%)` no cambia: sigue limitando la tarjeta en escritorio y ocupando el hueco disponible en móvil.

`.auth-card::before` es el marco de puntos en `inset: 4px`. Con el padding vertical en 24px y el horizontal en 16px sigue habiendo 12px de separación entre el marco y el contenido por el lado más estrecho — no se solapa con los campos.

**El escritorio no se toca.** La regla vive dentro de la media query; por encima de 720px los paddings siguen siendo `60px 20px` y `28px`.

**Lo que no cubre.** Por debajo de ~356px de viewport el ancho útil vuelve a caer de 300px y el widget se saldría otra vez. Se acepta: iPhone SE (375px) y el catálogo Android habitual quedan cubiertos, y el escalado con `transform` queda fuera de alcance (§6).

### 3.3 Tabla del Salón de la Fama

Se **elimina** el bloque de `@media (max-width: 720px)` que estrecha las pistas (`app/globals.css:1777-1781`) y se sustituye por scroll horizontal del bloque entero. La tabla conserva sus cuatro columnas y sus tamaños de escritorio en todos los viewports; lo que cambia es que en móvil se arrastra.

En la regla base:

```css
.hall-table {
  border: 1px solid var(--line);
  background: var(--bg-2);
  /* Las cuatro columnas no caben en 390px sin recortar la cabecera en pixel
     font hasta lo ilegible. En vez de encogerlas, la caja se arrastra. */
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.hall-table .th,
.hall-table .tr {
  /* Suma de las pistas fijas (70 + 140), los tres huecos (30), el padding
     lateral (36) y un mínimo de 142px para cada una de las dos pistas 1fr —
     lo que necesitan JUGADOR (~81px) y PUNTUACIÓN (~116px) en pixel font. */
  min-width: 560px;
}
```

El `min-width` va también en `.hall-table .tr.you-label`, que es la única fila con su propio `grid-template-columns`: sin él se quedaría del ancho del contenedor y se desalinearía al arrastrar.

**Por qué 560px.** Con `grid-template-columns: 70px 1fr 1fr 140px`, `gap: 10px` y `padding: 12px 18px`, lo fijo suma `70 + 140 + 30 + 36 = 276px`. Los 284px restantes se reparten a partes iguales entre las dos pistas `1fr`: 142px cada una, por encima de los ~116px que necesita `PUNTUACIÓN`, que es la celda más ancha. En escritorio `.av-hall` deja 1136px útiles, muy por encima de 560, así que la barra no aparece y **la captura de `desktop` no cambia**.

**Accesibilidad.** Una región desplazable tiene que poder recorrerse con el teclado. En `components/hall-of-fame.tsx`:

```diff
-      <div className="hall-table">
+      <div
+        className="hall-table"
+        role="region"
+        aria-label="Tabla de puntuaciones"
+        tabIndex={0}
+      >
```

Es el único cambio del componente. No toca el podio, ni las pestañas, ni el marcador del jugador.

**La animación no se rompe.** `.tr` entra con `animation: rise` sobre `opacity` y `transform`; un contenedor con `overflow-x: auto` no altera eso, y la excepción de `prefers-reduced-motion` (`app/globals.css:2908`) sigue aplicando igual.

### 3.4 Orden del podio

Dentro de la `@media (max-width: 720px)` de `app/globals.css:1646`:

```css
@media (max-width: 720px) {
  .podium {
    grid-template-columns: 1fr;
  }
  /* El DOM va en orden de podio (plata, oro, bronce) porque el escritorio pone
     al campeón en el centro. Apilado, el orden que importa es el del ranking. */
  .podium-slot.gold {
    order: 1;
  }
  .podium-slot.silver {
    order: 2;
  }
  .podium-slot.bronze {
    order: 3;
  }
}
```

`order` sólo afecta al pintado, no al orden del DOM ni al de lectura de un lector de pantalla. Es un compromiso conocido y aceptado aquí: el contenido de cada hueco lleva su propio número de rango (`01`, `02`, `03`) y la etiqueta `CAMPEÓN`, así que el orden de lectura sigue siendo interpretable sin ver la pantalla. Reordenar el DOM y recolocar el escritorio con `grid-column` sería lo estrictamente correcto, y queda descartado en §6 por tocar el componente y el viewport que hoy funciona.

El `align-items: end` del grid deja de tener efecto al colapsar a una sola columna. No hace falta anularlo.

### 3.5 Capturas de referencia

Dos de las catorce cambian, las dos del proyecto `mobile`:

| Captura | Por qué cambia |
| --- | --- |
| `auth-mobile-darwin.png` | Paddings de la tarjeta (§3.2). El widget no sale en la captura — la suite no define `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — pero el contenido de la tarjeta se ensancha 24px. |
| `salon-mobile-darwin.png` | Podio reordenado y tabla con pistas de escritorio recortadas por el borde del contenedor (§3.3, §3.4). |

Las siete de `desktop` y las cinco restantes de `mobile` **no se tocan**, y que sigan intactas es parte de los criterios de aceptación: es la evidencia de que ningún cambio se filtró fuera de su media query.

Procedimiento, según la regla de `CLAUDE.md`: verificar los tres arreglos a mano en un navegador a 390px **antes** de regenerar nada, y luego `npx playwright test --project=mobile --update-snapshots`.

### 3.6 Documentación

Fila de la SPEC 12 en el índice de specs del `README.md`. Nada más: ni `CLAUDE.md` ni el `README.md` describen los paddings de la tarjeta, el grid de la tabla ni el orden del podio, así que no hay ninguna frase que quede desmentida por este cambio.

---

## 4. Plan de implementación

1. **Podio.** Las tres reglas de `order` en la media query de `app/globals.css:1646` (§3.4). Comprobación: en `/salon` a 390px el apilado es `01 CAMPEÓN`, `02`, `03`; a 1440px el podio sigue siendo `02 · 01 · 03` con el oro en el centro y más ancho.
2. **Tabla.** `overflow-x` y `overscroll-behavior-x` en `.hall-table`, `min-width: 560px` en `.th`, `.tr` y `.tr.you-label`, y borrado del bloque que estrechaba las pistas por debajo de 720px (§3.3). Comprobación: en `/salon` a 390px la página no tiene scroll horizontal propio (`document.documentElement.scrollWidth === clientWidth`), la tabla sí lo tiene, ninguna cabecera pisa la celda vecina y al arrastrar hasta el final se lee `FECHA` completa. A 1440px no aparece barra alguna.
3. **Tarjeta de `/auth`.** Los dos paddings dentro de la media query (§3.2). Comprobación: con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` de pruebas en `.env.local` y `npm run dev`, en `/auth` a 390px el iframe de Turnstile queda dentro del borde de la tarjeta en las dos pestañas y sobre `JUGAR COMO INVITADO`, y la página no desborda. A 1440px la tarjeta queda idéntica a hoy.
4. **Accesibilidad de la región desplazable.** `role`, `aria-label` y `tabIndex` en el `div.hall-table` de `components/hall-of-fame.tsx` (§3.3). Comprobación: con `Tab` se llega a la tabla y las flechas horizontales la desplazan.
5. **Capturas.** Verificación manual de los tres arreglos en el navegador y luego `npx playwright test --project=mobile --update-snapshots`. Revisar el diff: sólo `auth-mobile-darwin.png` y `salon-mobile-darwin.png` deben aparecer modificadas.
6. **Documentación y cierre.** Fila de la SPEC 12 en el índice del `README.md`. Verificación final: `npm test` verde, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] A 390px de ancho, `/auth` pinta el widget de Turnstile completamente dentro del borde de `.auth-card`, en las pestañas INICIAR SESIÓN y CREAR CUENTA.
- [ ] A 390px, `document.documentElement.scrollWidth` es igual a `clientWidth` en `/auth` y en `/salon` — ninguna de las dos páginas desborda horizontalmente.
- [ ] A 390px, el podio de `/salon` se apila en el orden `01` (CAMPEÓN), `02`, `03`.
- [ ] A 1440px, el podio de `/salon` sigue mostrando `02 · 01 · 03` con el hueco del campeón en el centro y más ancho que los otros dos.
- [ ] A 390px, la tabla de `/salon` se desplaza horizontalmente y ninguna celda de cabecera se solapa con la contigua; `FECHA` y su columna son legibles al final del arrastre.
- [ ] A 1440px, la tabla de `/salon` no muestra barra de desplazamiento horizontal.
- [ ] La fila `▸ TU MEJOR MARCA EN …` y la fila del jugador se mantienen alineadas con el resto de la tabla en cualquier posición del desplazamiento.
- [ ] Con `Tab` se puede enfocar la tabla de `/salon` y desplazarla con las flechas del teclado.
- [ ] A 1440px, `/auth` es idéntica a antes del cambio: la captura `auth-desktop-darwin.png` no se regenera.
- [ ] De las 14 capturas de referencia se regeneran exactamente dos: `auth-mobile-darwin.png` y `salon-mobile-darwin.png`. Las 12 restantes quedan intactas en el diff.
- [ ] `npm test` verde.
- [ ] `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] `package.json` no tiene dependencias nuevas y no hay variables de entorno nuevas.
- [ ] `components/hall-of-fame.tsx` cambia únicamente en los atributos del `div.hall-table`; ni el podio, ni las pestañas, ni el cálculo del marcador del jugador se tocan.
- [ ] `components/auth-form.tsx`, `lib/scores.ts` y `lib/games.ts` no cambian.

---

## 6. Decisiones

- **Sí:** ensanchar la tarjeta de `/auth` reduciendo paddings en móvil. Es la corrección de la causa real — el contenedor es más estrecho que su contenido — y no toca `components/auth-form.tsx`, así que no roza nada del contrato de seguridad de las SPEC 09 y 11.
- **No:** escalar el widget con `transform: scale()`. Cubriría cualquier ancho, pero desenfoca un iframe de terceros y obliga a compensar a mano la altura reservada de `.av-captcha`, que la SPEC 11 acaba de fijar en los 71px medidos. Si algún día hace falta cubrir por debajo de 356px, es una spec aparte con una medición delante.
- **No:** `size: compact` (150 × 144) por debajo de 720px. Cabe seguro, pero duplica la altura del bloque y la SPEC 11 ya lo descartó por empujar los botones de OAuth fuera de la primera pantalla — que es justo el problema que empeora en móvil.
- **No:** `size: flexible`. Su mínimo sigue siendo 300px de ancho, así que no resuelve nada, y obligaría a quitar el `justify-content: center` de `.av-captcha`.
- **Sí:** scroll horizontal para la tabla del salón. Ninguna columna se pierde y la cabecera en Press Start 2P se lee al tamaño para el que se diseñó. El coste es que el jugador arrastra para ver la fecha, que es el dato menos importante de la fila.
- **No:** ocultar la columna `FECHA` en móvil. Cabría todo sin arrastrar, pero es borrar un dato de la pantalla para resolver un problema de ancho, y el dato es el mismo que el podio ya muestra arriba.
- **No:** encoger la cabecera a 7-8px y recortar el `letter-spacing`. Press Start 2P a 8px con espaciado reducido deja `PUNTUACIÓN` al límite de lo legible, y es precisamente la tipografía que define la pantalla.
- **No:** reflujo a tarjetas apiladas por debajo de 720px. Sería lo más legible de las cuatro opciones, pero reescribe la sección entera y cambia la captura de referencia de `/salon` hasta hacerla irreconocible. Queda como spec posterior si el scroll resulta incómodo de verdad.
- **Sí:** `order` en la media query para el podio. El escritorio necesita el orden visual en el DOM y el móvil necesita el orden del ranking; `order` es exactamente la propiedad para esa situación, y deja `components/hall-of-fame.tsx` sin tocar en esa parte.
- **No:** reordenar el DOM a oro-plata-bronce y recolocar el escritorio con `grid-column`. Es lo estrictamente correcto para el orden de lectura, pero toca el componente y reescribe el layout de escritorio, que hoy funciona. El número de rango dentro de cada hueco hace que el orden de lectura siga siendo interpretable.
- **No:** pintar sólo al campeón en móvil. Ahorra dos tarjetas de scroll a cambio de perder información que la pantalla existe para mostrar.
- **Sí:** región desplazable enfocable con `role`, `aria-label` y `tabIndex`. Un bloque que sólo se puede recorrer arrastrando con el dedo deja fuera a quien navega con teclado, y son tres atributos.
- **No:** cabecera pegajosa (`position: sticky`) en la tabla desplazable. Con cuatro columnas y un arrastre corto no aporta, y `sticky` dentro de un contenedor con `overflow-x` tiene comportamientos distintos según el navegador que habría que verificar uno a uno.
- **Sí:** regenerar sólo las capturas de `mobile`, y a mano después de verificar en el navegador. Es la regla de `CLAUDE.md`: las de `desktop` intactas son la prueba de que el cambio no se filtró de viewport.
- **No:** añadir una prueba de no desbordamiento (`scrollWidth <= clientWidth`) a `tests/screens.spec.ts`. Capturaría la regresión aunque una captura futura se regenerase a ciegas, pero es cobertura nueva sobre una pantalla que esta spec no está cambiando de comportamiento. Si se quiere, va en su propia spec junto al resto de rutas, no sólo en `/salon`.
- **No:** tocar la tabla de `/juego/[id]`. Usa `.lb-row`, tres columnas y sin cabecera: verificada como no afectada en §1.2.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los paddings nuevos de `/auth` se filtran al escritorio y descuadran la tarjeta | Van dentro de la `@media (max-width: 720px)` que ya existe. El criterio de que `auth-desktop-darwin.png` no se regenere lo verifica. |
| Por debajo de ~356px el widget vuelve a salirse | Aceptado y escrito en §3.2. Queda por debajo del catálogo de dispositivos que la suite emula y del iPhone SE (375px). El arreglo del `transform` está descrito en §6 para cuando haga falta. |
| El `min-width: 560px` de las filas hace aparecer una barra en algún ancho intermedio donde antes no la había | Es el comportamiento buscado: por debajo de 560px de tabla útil, arrastrar es preferible a recortar. Entre 721px y 1200px de viewport hay de sobra y no aparece. |
| La barra de desplazamiento horizontal desentona con la estética CRT | El navegador la pinta con el esquema oscuro de la página y sólo aparece en móvil, donde en iOS y Android es una barra fina que se desvanece. Si molesta, es un ajuste posterior de `::-webkit-scrollbar`, no parte de este arreglo. |
| Alguien vuelve a estrechar las pistas de la tabla en móvil creyendo que el scroll es un descuido | El comentario de §3.3 queda en el CSS junto a la regla, explicando que las columnas no caben y que arrastrar es la decisión. |
| La captura de `/salon` en móvil se regenera a ciegas y consagra el desbordamiento actual | El paso 5 del plan exige verificar los tres arreglos en el navegador antes de regenerar, y el criterio de aceptación limita el diff a dos ficheros `.png`. |
| `order` deja el orden de lectura del podio en plata-oro-bronce para un lector de pantalla | Cada hueco lleva su número de rango (`01`, `02`, `03`) y el campeón además la etiqueta `CAMPEÓN`, así que el orden se deduce del contenido. Descartado reordenar el DOM en §6 con su motivo. |
