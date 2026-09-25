/**
 * Motor de ASTEROIDES. Módulo puro: no toca el DOM, ni el navegador, ni el
 * lienzo; solo aritmética sobre su propio estado.
 *
 * Portado de `references/started-games/02-asteroids/game.js` con los cambios de
 * regla decididos en la SPEC 14: rozamiento por segundo en vez de por fotograma,
 * una sola vida, disparo mantenido, oleada topada en diez rocas y dos objetos
 * (disparo triple y escudo) en vez del único `3x` de la referencia.
 *
 * El estado se muta in situ a propósito: el componente lo guarda en un `useRef`
 * y pinta en un lienzo, así que un objeto nuevo por fotograma no aportaría nada.
 */

export const WORLD_W = 800;
export const WORLD_H = 600;

/** Una sola vida: el primer choque sin escudo termina la partida. */
export const LIVES = 1;

/** Tope de rocas por oleada. El nivel sigue subiendo sin límite. */
export const MAX_ROCKS = 10;

export type Size = 1 | 2 | 3;
export type DropKind = "triple" | "shield";

export type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
};

export type Rock = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: Size;
  rot: number;
  rotSpeed: number;
  /** Polígono irregular precalculado, relativo al centro. */
  verts: number[][];
};

export type Drop = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: DropKind;
  ttl: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  /** Vida inicial, para calcular el desvanecido. */
  life: number;
};

export type Ship = {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  thrusting: boolean;
  /** Segundos restantes de invulnerabilidad. */
  invincible: number;
  /** Segundos que faltan para poder disparar otra vez. */
  cooldown: number;
  /** Segundos restantes de disparo triple. */
  triple: number;
  /** Segundos restantes de escudo. */
  shield: number;
};

/** Lo que el componente lee del teclado y de los mandos, ya mezclado. */
export type Input = {
  left: boolean;
  right: boolean;
  thrust: boolean;
  fire: boolean;
};

export type AsteroidsState = {
  ship: Ship;
  bullets: Bullet[];
  rocks: Rock[];
  drops: Drop[];
  particles: Particle[];
  score: number;
  lives: number;
  level: number;
  /** true tras el choque: el reproductor abre el modal. */
  over: boolean;
  /** Rocas destruidas desde la última caída, para el objeto garantizado. */
  killsSinceDrop: number;
};

/** Radio por tamaño: el índice 0 no se usa. */
export const RADII = [0, 16, 30, 50];
/** Velocidad base por tamaño, con ruido de ±15 al generar. */
const SPEEDS = [0, 85, 55, 32];
/** Puntos por tamaño. Sin multiplicador de nivel, a diferencia de TETRIX. */
const POINTS = [0, 100, 50, 20];

export const SHIP_RADIUS = 12;
export const DROP_RADIUS = 12;
export const BULLET_RADIUS = 2;
/** Morro de la nave: de ahí salen las balas. */
export const NOSE = 21;

const ROT_SPEED = 3.5; // rad/s
const THRUST = 260; // px/s²

/**
 * La referencia multiplica por 0,987 en cada vuelta del bucle, así que ata la
 * velocidad máxima de la nave a los fotogramas por segundo del monitor. Aquí el
 * factor es por segundo y se eleva a `dt`: a 60 fps el tacto es el mismo.
 */
const DRAG = 0.987 ** 60;

const BULLET_SPEED = 520;
const BULLET_TTL = 1.1;
const SHOOT_COOLDOWN = 0.2;
const TRIPLE_SPREAD = 0.18;

const INVINCIBLE = 3;
/** Distancia mínima al centro al generar una oleada. */
const SAFE_DIST = 130;

const DROP_CHANCE = 0.15;
/** Rocas destruidas seguidas sin caída que garantizan la siguiente. */
const DROP_PITY = 5;
export const DROP_DURATION = 5;
const DROP_TTL = 12;

/** `dt` topado: una pestaña que vuelve del fondo no teletransporta nada. */
export const MAX_DT = 0.05;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

/** Envolvente toroidal: salir por un borde es entrar por el opuesto. */
export function wrap(v: number, max: number): number {
  return ((v % max) + max) % max;
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Rocas de la oleada: sube con el nivel hasta el tope de MAX_ROCKS. */
export function rocksForLevel(level: number): number {
  return Math.min(MAX_ROCKS, 3 + level);
}

function createRock(x: number, y: number, size: Size): Rock {
  const angle = rand(0, Math.PI * 2);
  const speed = SPEEDS[size] + rand(-15, 15);
  const radius = RADII[size];
  const n = randInt(8, 13);
  const verts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * rand(0.6, 1);
    verts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    rot: rand(0, Math.PI * 2),
    rotSpeed: rand(-1.2, 1.2),
    verts,
  };
}

function createShip(): Ship {
  return {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    thrusting: false,
    invincible: INVINCIBLE,
    cooldown: 0,
    triple: 0,
    shield: 0,
  };
}

/** Puebla el campo dejando libre un círculo alrededor del centro. */
function spawnWave(state: AsteroidsState): void {
  const count = rocksForLevel(state.level);
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    do {
      x = rand(0, WORLD_W);
      y = rand(0, WORLD_H);
    } while (Math.hypot(x - WORLD_W / 2, y - WORLD_H / 2) < SAFE_DIST);
    state.rocks.push(createRock(x, y, 3));
  }
}

export function createState(): AsteroidsState {
  const state: AsteroidsState = {
    ship: createShip(),
    bullets: [],
    rocks: [],
    drops: [],
    particles: [],
    score: 0,
    lives: LIVES,
    level: 1,
    over: false,
    killsSinceDrop: 0,
  };
  spawnWave(state);
  return state;
}

/**
 * Campo vacío: sube el nivel y vuelve a poblarlo. La nave regresa al centro con
 * el campo ya lleno, así que recupera la invulnerabilidad de arranque.
 */
function nextWave(state: AsteroidsState): void {
  state.level++;
  state.bullets = [];
  state.drops = [];
  state.killsSinceDrop = 0;
  const { ship } = state;
  ship.x = WORLD_W / 2;
  ship.y = WORLD_H / 2;
  ship.angle = -Math.PI / 2;
  ship.vx = 0;
  ship.vy = 0;
  ship.thrusting = false;
  ship.invincible = INVINCIBLE;
  ship.cooldown = 0;
  spawnWave(state);
}

function explode(state: AsteroidsState, x: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    const life = rand(0.4, 1.1);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ttl: life,
      life,
    });
  }
}

/**
 * Una roca menos. Suma puntos, la parte en dos del tamaño inferior y decide si
 * suelta un objeto: solo puede haber uno en el campo, cae al 15 % y la quinta
 * roca seguida sin caída lo garantiza.
 */
function destroyRock(state: AsteroidsState, rock: Rock): Rock[] {
  state.score += POINTS[rock.size];
  explode(state, rock.x, rock.y, rock.size * 5);

  if (state.drops.length === 0) {
    state.killsSinceDrop++;
    if (state.killsSinceDrop >= DROP_PITY || Math.random() < DROP_CHANCE) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(20, 40);
      state.drops.push({
        x: rock.x,
        y: rock.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        kind: Math.random() < 0.5 ? "triple" : "shield",
        ttl: DROP_TTL,
      });
      state.killsSinceDrop = 0;
    }
  }

  if (rock.size <= 1) return [];
  const smaller = (rock.size - 1) as Size;
  return [
    createRock(rock.x, rock.y, smaller),
    createRock(rock.x, rock.y, smaller),
  ];
}

/**
 * Balas que salen del morro. `fire` es un estado, no un flanco: mientras esté a
 * `true` sale una bala cada vez que el enfriamiento llega a cero.
 */
function tryShoot(state: AsteroidsState): void {
  const { ship } = state;
  if (ship.cooldown > 0) return;
  ship.cooldown = SHOOT_COOLDOWN;
  const ox = ship.x + Math.cos(ship.angle) * NOSE;
  const oy = ship.y + Math.sin(ship.angle) * NOSE;
  const angles =
    ship.triple > 0
      ? [ship.angle - TRIPLE_SPREAD, ship.angle, ship.angle + TRIPLE_SPREAD]
      : [ship.angle];
  for (const angle of angles) {
    state.bullets.push({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      ttl: BULLET_TTL,
    });
  }
}

/** Un fotograma del juego. Única función que muta el estado desde fuera. */
export function step(state: AsteroidsState, input: Input, dt: number): void {
  if (state.over) return;
  const delta = Math.min(dt, MAX_DT);
  if (delta <= 0) return;

  const { ship } = state;

  // ── Nave ───────────────────────────────────────────────────────────────────
  if (ship.invincible > 0) ship.invincible -= delta;
  if (ship.cooldown > 0) ship.cooldown -= delta;
  if (ship.triple > 0) ship.triple = Math.max(0, ship.triple - delta);
  if (ship.shield > 0) ship.shield = Math.max(0, ship.shield - delta);

  if (input.left) ship.angle -= ROT_SPEED * delta;
  if (input.right) ship.angle += ROT_SPEED * delta;

  ship.thrusting = input.thrust;
  if (ship.thrusting) {
    ship.vx += Math.cos(ship.angle) * THRUST * delta;
    ship.vy += Math.sin(ship.angle) * THRUST * delta;
  }

  const drag = DRAG ** delta;
  ship.vx *= drag;
  ship.vy *= drag;
  ship.x = wrap(ship.x + ship.vx * delta, WORLD_W);
  ship.y = wrap(ship.y + ship.vy * delta, WORLD_H);

  if (input.fire) tryShoot(state);

  // ── Movimiento del resto ───────────────────────────────────────────────────
  for (const b of state.bullets) {
    b.x = wrap(b.x + b.vx * delta, WORLD_W);
    b.y = wrap(b.y + b.vy * delta, WORLD_H);
    b.ttl -= delta;
  }
  state.bullets = state.bullets.filter((b) => b.ttl > 0);

  for (const r of state.rocks) {
    r.x = wrap(r.x + r.vx * delta, WORLD_W);
    r.y = wrap(r.y + r.vy * delta, WORLD_H);
    r.rot += r.rotSpeed * delta;
  }

  for (const d of state.drops) {
    d.x = wrap(d.x + d.vx * delta, WORLD_W);
    d.y = wrap(d.y + d.vy * delta, WORLD_H);
    d.ttl -= delta;
  }
  state.drops = state.drops.filter((d) => d.ttl > 0);

  for (const p of state.particles) {
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.ttl -= delta;
  }
  state.particles = state.particles.filter((p) => p.ttl > 0);

  // ── Recogida de objetos ────────────────────────────────────────────────────
  state.drops = state.drops.filter((d) => {
    if (dist(ship, d) >= SHIP_RADIUS + DROP_RADIUS) return true;
    // Recoger fija el temporizador; no se acumula.
    if (d.kind === "triple") ship.triple = DROP_DURATION;
    else ship.shield = DROP_DURATION;
    state.killsSinceDrop = 0;
    return false;
  });

  // ── Bala contra roca ───────────────────────────────────────────────────────
  const spawned: Rock[] = [];
  const deadRocks = new Set<Rock>();
  const deadBullets = new Set<Bullet>();
  for (const b of state.bullets) {
    if (deadBullets.has(b)) continue;
    for (const r of state.rocks) {
      if (deadRocks.has(r)) continue;
      if (dist(b, r) >= RADII[r.size]) continue;
      deadBullets.add(b);
      deadRocks.add(r);
      spawned.push(...destroyRock(state, r));
      break;
    }
  }
  if (deadRocks.size > 0) {
    state.bullets = state.bullets.filter((b) => !deadBullets.has(b));
    state.rocks = state.rocks.filter((r) => !deadRocks.has(r)).concat(spawned);
  }

  // ── Nave contra roca ───────────────────────────────────────────────────────
  if (ship.invincible <= 0) {
    for (const r of state.rocks) {
      // El factor 0,82 es el «tacto» de la referencia: perdona el roce.
      if (dist(ship, r) >= SHIP_RADIUS + RADII[r.size] * 0.82) continue;
      if (ship.shield > 0) {
        // El escudo se gasta y la roca explota como si la hubiera dado una bala.
        ship.shield = 0;
        ship.invincible = 1;
        const rest = destroyRock(state, r);
        state.rocks = state.rocks.filter((other) => other !== r).concat(rest);
      } else {
        explode(state, ship.x, ship.y, 14);
        state.lives = Math.max(0, state.lives - 1);
        state.over = state.lives === 0;
      }
      break;
    }
  }
  if (state.over) return;

  // ── Oleada completada ──────────────────────────────────────────────────────
  if (state.rocks.length === 0) nextWave(state);
}
