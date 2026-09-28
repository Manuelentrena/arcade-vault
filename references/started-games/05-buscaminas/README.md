# Buscaminas

Clon del clásico **Buscaminas** implementado en canvas HTML5 puro, sin dependencias ni bundler, con control 100% por teclado.

## Descripción

Un cursor se mueve por una rejilla de 16×12 casillas con 28 minas ocultas. La casilla bajo el cursor queda siempre resaltada. Descubre casillas para sumar puntos; marca las que sospeches que ocultan una mina con una bandera. Solo tienes una vida: la primera mina que descubras sin marcar termina la partida.

## Tecnologías

- **HTML5 Canvas** — renderizado 2D
- **JavaScript (ES6+)** — lógica del juego en un solo archivo `game.js`
- Sin frameworks, sin bundler, sin dependencias

## Cómo correr

Abre `index.html` directamente en el navegador (doble clic), o usa un servidor local:

```bash
npx serve .
```

Luego visita `http://localhost:3000`.

## Controles

| Tecla                | Acción                          |
| --------------------- | -------------------------------- |
| `↑` `↓` `←` `→` | Mover el cursor (mantén pulsada para avanzar casilla a casilla) |
| `Espacio`             | Descubrir la casilla              |
| `F`                    | Marcar/desmarcar bandera (sospecha de mina) |

También hay un panel táctil a la derecha del tablero (flechas + `F` + `SPACE`) para jugar desde móvil sin teclado.

## Puntuación

Cada casilla descubierta suma **10 puntos**. Descubrir una casilla vacía puede abrir varias de golpe (relleno en cascada) y sumar todas a la vez.

## Características

- Primera casilla siempre segura: las minas se colocan después de tu primer clic, evitando esa casilla y sus vecinas
- Relleno en cascada al descubrir una casilla sin minas adyacentes
- Casilla bajo el cursor resaltada en todo momento
- Una sola vida: una mina sin marcar termina la partida
- Sin HUD sobre el tablero: la puntuación solo se revela en la pantalla de fin de partida; banderas colocadas y total de minas se muestran en el panel lateral
- Panel de controles táctiles a la derecha del tablero, con soporte de repetición al mantener pulsado
- Pantalla de fin de partida (victoria o derrota) con puntuación final y reinicio por `Espacio`
