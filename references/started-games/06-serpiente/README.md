# Serpiente

Clon del clásico **Snake** implementado en canvas HTML5 puro, sin dependencias ni bundler, con control 100% por teclado.

## Descripción

Una serpiente de neón recorre una rejilla de 24×18 casillas y nunca se detiene: avanza un paso cada pocos milisegundos en la dirección que lleve. Gírala para atrapar la fruta y hacerla más larga. Cada 5 frutas sube el nivel y el paso se acorta, sin final. Solo tienes una vida: chocar contra el muro o contra tu propio cuerpo termina la partida.

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
| `↑` `↓` `←` `→` | Girar la serpiente (una pulsación = un giro; no hay repetición al mantener) |
| `Espacio`             | Reiniciar, solo en la pantalla de fin de partida |

También hay un panel táctil a la derecha del tablero (flechas + `SPACE`) para jugar desde móvil sin teclado.

## Puntuación

Cada fruta suma **10 puntos × el nivel actual**: la misma fruta vale 10 en el nivel 1 y 40 en el nivel 4. Cada 5 frutas sube el nivel.

## Características

- La serpiente nunca se detiene: el paso es discreto y temporizado, no depende de que pulses nada
- Los giros se **encolan** (hasta 2) y se consumen uno por paso, así que dos pulsaciones rápidas dentro del mismo paso no la hacen morderse el cuello
- Un giro contrario a la dirección pendiente se descarta: nunca hay marcha atrás
- La cola se libera en el mismo paso en que avanza la cabeza, así que seguirla de cerca no es un choque
- Velocidad creciente por nivel, con un suelo de 60 ms por paso
- Una sola vida: el muro o tu propio cuerpo terminan la partida
- Sin HUD sobre el tablero: la puntuación solo se revela en la pantalla de fin de partida; nivel y longitud se muestran en el panel lateral
- El cuerpo se apaga hacia la cola, para leer de un vistazo tu propia trayectoria
- Panel de controles táctiles a la derecha del tablero
- Pantalla de fin de partida con puntuación final y reinicio por `Espacio`
