'use strict';

const canvas = document.getElementById( 'canvas' );
const ctx = canvas.getContext( '2d' );

// ── Input ─────────────────────────────────────────────────────────────────────

const keys = {};
const justPressed = {};

window.addEventListener( 'keydown', e => {
  if ( !keys[ e.code ] ) justPressed[ e.code ] = true;
  keys[ e.code ] = true;
  if ( [ 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space' ].includes( e.code ) ) {
    e.preventDefault();
  }
} );
window.addEventListener( 'keyup', e => { keys[ e.code ] = false; } );

function pressed( code ) {
  const val = justPressed[ code ];
  justPressed[ code ] = false;
  return val;
}

// ── Constantes ────────────────────────────────────────────────────────────────
const COLS = 24;
const ROWS = 18;
const CELL = 24;

const W = COLS * CELL;
const H = ROWS * CELL;

const START_LENGTH = 4;

const SCORE_PER_FRUIT = 10;   // × nivel
const FRUITS_PER_LEVEL = 5;   // frutas necesarias para subir de nivel

const TICK_BASE = 150;        // ms por paso en el nivel 1
const TICK_STEP = 12;         // ms que se recortan por nivel
const TICK_MIN = 60;          // suelo: por debajo deja de ser jugable

const QUEUE_MAX = 2;          // giros encolados; más que esto es ruido, no intención

const DIRS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

// ── Estado ────────────────────────────────────────────────────────────────────
let snake;        // array de { x, y }; snake[0] es la cabeza
let dir;          // dirección aplicada en el último paso
let dirQueue;     // giros pendientes, uno por paso
let fruit;        // { x, y }
let score, fruits, level;
let acc, lastTs;  // acumulador de tiempo para el paso discreto
let state;        // 'playing' | 'gameover'

function tickMs() {
  return Math.max( TICK_MIN, TICK_BASE - ( level - 1 ) * TICK_STEP );
}

function occupied( x, y ) {
  return snake.some( s => s.x === x && s.y === y );
}

function placeFruit() {
  const free = [];
  for ( let y = 0; y < ROWS; y++ ) {
    for ( let x = 0; x < COLS; x++ ) {
      if ( !occupied( x, y ) ) free.push( { x, y } );
    }
  }
  // La rejilla es mucho mayor que la serpiente más larga alcanzable, así que free nunca queda vacío.
  fruit = free[ Math.floor( Math.random() * free.length ) ];
}

function initGame() {
  const cy = Math.floor( ROWS / 2 );
  const cx = Math.floor( COLS / 2 );

  snake = [];
  for ( let i = 0; i < START_LENGTH; i++ ) snake.push( { x: cx - i, y: cy } );

  dir = DIRS.ArrowRight;
  dirQueue = [];
  score = 0;
  fruits = 0;
  level = 1;
  acc = 0;
  lastTs = 0;
  state = 'playing';

  placeFruit();
  refreshSideHud();
}

// ── Dirección: se encola, nunca se sobrescribe ───────────────────────────────
// Dos giros dentro del mismo paso con una sola ranura dejarían a la serpiente
// morderse el cuello: el segundo giro invertiría una dirección que todavía no
// se ha aplicado. Por eso se encola y cada paso consume exactamente uno.
function enqueueDir( code ) {
  if ( !pressed( code ) ) return;

  const next = DIRS[ code ];
  const last = dirQueue.length ? dirQueue[ dirQueue.length - 1 ] : dir;

  if ( next.x === -last.x && next.y === -last.y ) return; // marcha atrás: se descarta
  if ( next.x === last.x && next.y === last.y ) return;   // misma dirección: no es un giro
  if ( dirQueue.length >= QUEUE_MAX ) return;

  dirQueue.push( next );
}

// ── Paso ──────────────────────────────────────────────────────────────────────
function step() {
  if ( dirQueue.length ) dir = dirQueue.shift();

  const head = snake[ 0 ];
  const next = { x: head.x + dir.x, y: head.y + dir.y };

  if ( next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS ) {
    state = 'gameover';
    return;
  }

  const willEat = next.x === fruit.x && next.y === fruit.y;

  // Si no come, la cola se libera en este mismo paso: no cuenta como choque.
  const body = willEat ? snake : snake.slice( 0, snake.length - 1 );
  if ( body.some( s => s.x === next.x && s.y === next.y ) ) {
    state = 'gameover';
    return;
  }

  snake.unshift( next );

  if ( willEat ) {
    fruits++;
    score += SCORE_PER_FRUIT * level;
    level = 1 + Math.floor( fruits / FRUITS_PER_LEVEL );
    placeFruit();
    refreshSideHud();
  } else {
    snake.pop();
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update( ts ) {
  const dt = lastTs ? ts - lastTs : 0;
  lastTs = ts;

  if ( state === 'gameover' ) {
    if ( pressed( 'Space' ) ) initGame();
    return;
  }

  enqueueDir( 'ArrowUp' );
  enqueueDir( 'ArrowDown' );
  enqueueDir( 'ArrowLeft' );
  enqueueDir( 'ArrowRight' );

  acc += Math.min( dt, 200 ); // una pestaña en segundo plano no debe soltar una ráfaga de pasos
  while ( state === 'playing' && acc >= tickMs() ) {
    acc -= tickMs();
    step();
  }
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawGrid() {
  ctx.strokeStyle = '#0d1a0d';
  ctx.lineWidth = 1;
  for ( let x = 1; x < COLS; x++ ) {
    ctx.beginPath();
    ctx.moveTo( x * CELL + 0.5, 0 );
    ctx.lineTo( x * CELL + 0.5, H );
    ctx.stroke();
  }
  for ( let y = 1; y < ROWS; y++ ) {
    ctx.beginPath();
    ctx.moveTo( 0, y * CELL + 0.5 );
    ctx.lineTo( W, y * CELL + 0.5 );
    ctx.stroke();
  }
}

function drawFruit() {
  const cx = fruit.x * CELL + CELL / 2;
  const cy = fruit.y * CELL + CELL / 2;

  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc( cx, cy + 1, CELL * 0.3, 0, Math.PI * 2 );
  ctx.fill();

  ctx.strokeStyle = '#6fcf6f';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo( cx, cy - CELL * 0.22 );
  ctx.lineTo( cx + CELL * 0.16, cy - CELL * 0.4 );
  ctx.stroke();
}

function drawSnake() {
  for ( let i = snake.length - 1; i >= 0; i-- ) {
    const s = snake[ i ];
    const x = s.x * CELL;
    const y = s.y * CELL;

    if ( i === 0 ) {
      ctx.fillStyle = '#b6ffb6';
      ctx.fillRect( x + 1, y + 1, CELL - 2, CELL - 2 );

      // Ojos orientados según la dirección actual
      ctx.fillStyle = '#0a1a0a';
      const ox = dir.x * CELL * 0.18;
      const oy = dir.y * CELL * 0.18;
      const px = dir.x === 0 ? CELL * 0.18 : 0;
      const py = dir.x === 0 ? 0 : CELL * 0.18;
      const cx = x + CELL / 2 + ox;
      const cy = y + CELL / 2 + oy;
      ctx.beginPath();
      ctx.arc( cx - px, cy - py, 2, 0, Math.PI * 2 );
      ctx.arc( cx + px, cy + py, 2, 0, Math.PI * 2 );
      ctx.fill();
    } else {
      // El cuerpo se apaga hacia la cola para que la trayectoria propia se lea de un vistazo
      const t = 1 - i / snake.length;
      ctx.fillStyle = `rgba(0, 255, 0, ${ ( 0.35 + t * 0.4 ).toFixed( 3 ) })`;
      ctx.fillRect( x + 2, y + 2, CELL - 4, CELL - 4 );
    }
  }
}

function drawOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect( 0, 0, W, H );

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px monospace';
  ctx.fillText( 'FIN DE LA PARTIDA', W / 2, H / 2 - 18 );

  ctx.font = '16px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText( `PUNTAJE: ${ score }   —   ESPACIO PARA REINICIAR`, W / 2, H / 2 + 18 );
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect( 0, 0, W, H );

  drawGrid();
  drawFruit();
  drawSnake();

  if ( state === 'gameover' ) drawOverlay();
}

// ── HUD externo (panel de controles a la derecha) ────────────────────────────
const levelHud = document.getElementById( 'hud-level' );
const lengthHud = document.getElementById( 'hud-length' );

function refreshSideHud() {
  if ( levelHud ) levelHud.textContent = String( level );
  if ( lengthHud ) lengthHud.textContent = String( snake.length );
}

// ── Controles táctiles ────────────────────────────────────────────────────────
document.querySelectorAll( '[data-code]' ).forEach( btn => {
  const code = btn.dataset.code;
  const press = e => {
    e.preventDefault();
    if ( !keys[ code ] ) justPressed[ code ] = true;
    keys[ code ] = true;
    btn.classList.add( 'is-active' );
  };
  const release = () => {
    keys[ code ] = false;
    btn.classList.remove( 'is-active' );
  };
  btn.addEventListener( 'pointerdown', press );
  btn.addEventListener( 'pointerup', release );
  btn.addEventListener( 'pointerleave', release );
  btn.addEventListener( 'pointercancel', release );
} );

// ── Loop principal ────────────────────────────────────────────────────────────
function loop( ts ) {
  update( ts );
  draw();
  requestAnimationFrame( loop );
}

initGame();
requestAnimationFrame( loop );
