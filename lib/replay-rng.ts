/**
 * PRNG determinista compartido por los motores con replay en servidor
 * (SPEC 32, SPEC 33). Un solo generador: `start_game_session` emite la
 * semilla, el cliente la siembra para jugar y el servidor la siembra igual
 * para reproducir — da igual qué motor sea, el generador es el mismo.
 */

/**
 * Paso fijo del replay para los motores con física continua (SPEC 35,
 * SPEC 36): fino de sobra frente al MAX_DT de 50 ms del cliente. Compartido
 * por `lib/asteroids-replay.ts` y `lib/arkanoid-replay.ts` para no mantener
 * la misma constante en dos sitios.
 */
export const FIXED_DT = 1 / 120;

/** mulberry32: PRNG determinista y seedable a partir de un entero de 32 bits. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La semilla hex de `start_game_session` a un entero de 32 bits para sembrar el PRNG. */
export function seedToInt(seed: string): number {
  return parseInt(seed.slice(0, 8), 16) || 0;
}

/**
 * PRNG seedeado a partir del string de semilla. Un solo generador para los
 * cinco motores: cada uno lo siembra con la semilla de `start_game_session`
 * y el servidor reproduce la misma secuencia después.
 */
export function createSeededRng(seed: string): () => number {
  return mulberry32(seedToInt(seed));
}
