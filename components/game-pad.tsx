"use client";

import type { PointerEvent, RefObject } from "react";
import type { PadAction, PadHandle, PadLayout } from "@/components/game-player";

/**
 * El mando de consola de móvil (SPEC 21). Es hermano de `.crt` y el CSS lo
 * suelda a él: mismo cuerpo, mismo negro y sin junta entre los dos.
 *
 * El dibujo sigue la consola de la foto de referencia: la marca arriba, la
 * cruceta a la izquierda, los dos botones de acción a la derecha y en diagonal
 * —B abajo, A arriba—, y abajo del todo, centrada, la fila de PAUSA y FIN.
 *
 * Tres reglas gobiernan el componente:
 *
 * 1. **La silueta es la misma en los cuatro juegos.** Cruz completa, dos
 *    botones y dos pastillas siempre; lo que un juego no usa se pinta
 *    atenuado como un `<span>` inerte —ni rol, ni foco, ni puntero—, no se
 *    oculta. Cambia lo que hace cada tecla, no el dibujo del mando.
 * 2. **Ninguna tecla lleva nada escrito dentro.** Los botones de acción son
 *    círculos lisos y las pastillas, cápsulas lisas: el nombre va
 *    **debajo** de la tecla, como el `B`/`A`/`SELECT`/`START` de la consola
 *    real. Para un lector de pantalla el nombre es el `aria-label` del botón,
 *    y el rótulo de debajo es decorativo (`aria-hidden`).
 * 3. **Lo que un botón hace no se pinta en el botón.** Ni la bandera de
 *    BUSCAMINAS ni el `LANZAR` de ARKANOID: eso lo cuenta la leyenda que vive
 *    dentro del tubo, no el mando.
 *
 * No toca el estado del juego por su cuenta: pulsa el `PadHandle` que cada
 * motor publica, igual que un teclado haría `keydown`/`keyup`.
 */

/**
 * Los cuatro brazos de la cruz. Su flecha la dibuja el CSS (`.pad-arm::before`)
 * y no el JSX: forma parte de la silueta, no del juego, y así el mando no
 * tiene ni un nodo de texto suelto en la cruceta — ni siquiera en los brazos
 * apagados, que son `<span>` inertes.
 */
const DPAD: readonly {
  dir: "up" | "down" | "left" | "right";
  cls: string;
}[] = [
  { dir: "up", cls: "pad-up" },
  { dir: "left", cls: "pad-left" },
  { dir: "right", cls: "pad-right" },
  { dir: "down", cls: "pad-down" },
];

/** Los dos botones de acción, en el orden en que se leen: B a la izquierda. */
const ROUNDS: readonly { action: PadAction; label: string; cls: string }[] = [
  { action: "b", label: "B", cls: "pad-slot-b" },
  { action: "a", label: "A", cls: "pad-slot-a" },
];

export function GamePad({
  layout,
  handle,
  paused,
  onTogglePause,
  onEnd,
}: {
  layout: PadLayout;
  /** El PadHandle del motor montado; null hasta que publica el suyo. */
  handle: RefObject<PadHandle | null>;
  paused: boolean;
  onTogglePause: () => void;
  onEnd: () => void;
}) {
  /**
   * Pulsar y soltar, nunca "hacer la acción": la repetición mientras se
   * mantiene es asunto del motor, que ya la resuelve. `preventDefault` evita
   * que el navegador convierta el toque en un clic sintético o en un scroll.
   */
  const keyProps = (action: PadAction) => ({
    type: "button" as const,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      handle.current?.press(action);
    },
    onPointerUp: () => handle.current?.release(action),
    onPointerCancel: () => handle.current?.release(action),
    onPointerLeave: () => handle.current?.release(action),
  });

  return (
    <div className="game-pad">
      {/* El sitio que en la consola de referencia ocupa la marca. Es el mismo
          logotipo del encabezado, misma tipografía y mismo neón, y es
          decorativo: el nombre del sitio ya lo anuncia el Nav. */}
      <div className="pad-brand" aria-hidden="true">
        <span className="pad-brand-mark" />
        <span className="pad-brand-text neon-cyan">
          ARCADE <span className="neon-magenta">VAULT</span>
        </span>
      </div>

      <div className="pad-controls">
        <div className="pad-cross">
          {DPAD.map(({ dir, cls }) => {
            const aria = layout.dpad[dir];
            return aria ? (
              <button
                key={dir}
                {...keyProps(dir)}
                className={`pad-key pad-arm ${cls}`}
                aria-label={aria}
              />
            ) : (
              <span
                key={dir}
                className={`pad-key pad-arm ${cls} is-off`}
                aria-hidden="true"
              />
            );
          })}
          <span className="pad-hub" aria-hidden="true" />
        </div>

        {/* Los dos botones de acción: lisos y en diagonal. Lo que hace cada
            uno cambia con el juego, pero su cara nunca lo dice. */}
        <div className="pad-rounds">
          {ROUNDS.map(({ action, label, cls }) => {
            const aria = layout.buttons[action === "a" ? 0 : 1];
            return (
              <div className={`pad-slot ${cls}`} key={action}>
                {aria ? (
                  <button
                    {...keyProps(action)}
                    className="pad-key pad-round"
                    aria-label={aria}
                  />
                ) : (
                  <span
                    className="pad-key pad-round is-off"
                    aria-hidden="true"
                  />
                )}
                <span className="pad-slot-label" aria-hidden="true">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* PAUSA y FIN, las dos idénticas en los cuatro juegos y en el sitio que
          la consola de referencia reserva a SELECT y START: abajo del todo,
          centradas y en horizontal. Llaman a las mismas funciones que el HUD. */}
      <div className="pad-mid">
        <div className="pad-slot">
          <button
            type="button"
            className="pad-key pad-pill pad-pause"
            onClick={onTogglePause}
            /* El nombre accesible es el mismo que el rótulo visible de
               debajo: quien lo oye y quien lo lee usan la misma palabra. */
            aria-label={paused ? "REANUDAR" : "PAUSA"}
          />
          <span className="pad-slot-label" aria-hidden="true">
            {paused ? "REANUDAR" : "PAUSA"}
          </span>
        </div>
        <div className="pad-slot">
          <button
            type="button"
            className="pad-key pad-pill pad-end"
            onClick={onEnd}
            aria-label="FIN"
          />
          <span className="pad-slot-label" aria-hidden="true">
            FIN
          </span>
        </div>
      </div>
    </div>
  );
}
