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
const COLS = 16;
const ROWS = 12;
const CELL = 36;
const MINES = 28;

const W = COLS * CELL;
const H = ROWS * CELL;

const SCORE_PER_CELL = 10;

const REPEAT_DELAY = 300; // ms antes de empezar a repetir
const REPEAT_RATE = 70;  // ms entre repeticiones mientras se mantiene la tecla
const repeatAt = { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 };

const NUMBER_COLORS = [
  null,
  '#4da6ff', // 1
  '#6fcf6f', // 2
  '#ff6b6b', // 3
  '#b388ff', // 4
  '#ffa94d', // 5
  '#4dd0e1', // 6
  '#ffffff', // 7
  '#999999', // 8
];

// ── Tablero ───────────────────────────────────────────────────────────────────
let board;       // matriz [row][col] de { mine, revealed, flagged, adjacent }
let cursor;       // { row, col }
let score, flags, revealedCount;
let firstReveal;    // true hasta el primer Space: coloca las minas evitando esa casilla
let state;       // 'playing' | 'gameover'
let win;

function makeBoard() {
  const b = [];
  for ( let r = 0; r < ROWS; r++ ) {
    const row = [];
    for ( let c = 0; c < COLS; c++ ) {
      row.push( { mine: false, revealed: false, flagged: false, adjacent: 0 } );
    }
    b.push( row );
  }
  return b;
}

function inBounds( r, c ) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function neighbors( r, c ) {
  const out = [];
  for ( let dr = -1; dr <= 1; dr++ ) {
    for ( let dc = -1; dc <= 1; dc++ ) {
      if ( dr === 0 && dc === 0 ) continue;
      if ( inBounds( r + dr, c + dc ) ) out.push( [ r + dr, c + dc ] );
    }
  }
  return out;
}

function placeMines( safeRow, safeCol ) {
  const safe = new Set( neighbors( safeRow, safeCol ).map( ( [ r, c ] ) => `${ r },${ c }` ) );
  safe.add( `${ safeRow },${ safeCol }` );

  let placed = 0;
  while ( placed < MINES ) {
    const r = Math.floor( Math.random() * ROWS );
    const c = Math.floor( Math.random() * COLS );
    if ( safe.has( `${ r },${ c }` ) ) continue;
    if ( board[ r ][ c ].mine ) continue;
    board[ r ][ c ].mine = true;
    placed++;
  }

  for ( let r = 0; r < ROWS; r++ ) {
    for ( let c = 0; c < COLS; c++ ) {
      if ( board[ r ][ c ].mine ) continue;
      board[ r ][ c ].adjacent = neighbors( r, c ).filter( ( [ nr, nc ] ) => board[ nr ][ nc ].mine ).length;
    }
  }
}

function initGame() {
  board = makeBoard();
  cursor = { row: Math.floor( ROWS / 2 ), col: Math.floor( COLS / 2 ) };
  score = 0;
  flags = 0;
  revealedCount = 0;
  firstReveal = true;
  state = 'playing';
  win = false;
  refreshSideHud();
}

function revealFlood( startRow, startCol ) {
  const stack = [ [ startRow, startCol ] ];
  while ( stack.length ) {
    const [ r, c ] = stack.pop();
    const cell = board[ r ][ c ];
    if ( cell.revealed || cell.flagged ) continue;
    cell.revealed = true;
    revealedCount++;
    if ( cell.adjacent === 0 ) {
      for ( const [ nr, nc ] of neighbors( r, c ) ) {
        if ( !board[ nr ][ nc ].revealed && !board[ nr ][ nc ].mine ) stack.push( [ nr, nc ] );
      }
    }
  }
}

function revealAllMines() {
  for ( let r = 0; r < ROWS; r++ ) {
    for ( let c = 0; c < COLS; c++ ) {
      if ( board[ r ][ c ].mine ) board[ r ][ c ].revealed = true;
    }
  }
}

function reveal( r, c ) {
  const cell = board[ r ][ c ];
  if ( cell.revealed || cell.flagged ) return;

  if ( firstReveal ) {
    placeMines( r, c );
    firstReveal = false;
  }

  if ( cell.mine ) {
    cell.revealed = true;
    revealAllMines();
    state = 'gameover';
    win = false;
    return;
  }

  const before = revealedCount;
  revealFlood( r, c );
  score += ( revealedCount - before ) * SCORE_PER_CELL;

  if ( revealedCount === COLS * ROWS - MINES ) {
    state = 'gameover';
    win = true;
  }
}

function toggleFlag( r, c ) {
  const cell = board[ r ][ c ];
  if ( cell.revealed ) return;
  if ( !cell.flagged && flags >= MINES ) return;
  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
  refreshSideHud();
}

// ── Update ────────────────────────────────────────────────────────────────────
function moveCursor( code, dr, dc, ts ) {
  if ( pressed( code ) ) {
    cursor.row = Math.min( ROWS - 1, Math.max( 0, cursor.row + dr ) );
    cursor.col = Math.min( COLS - 1, Math.max( 0, cursor.col + dc ) );
    repeatAt[ code ] = ts + REPEAT_DELAY;
  } else if ( keys[ code ] && ts >= repeatAt[ code ] ) {
    cursor.row = Math.min( ROWS - 1, Math.max( 0, cursor.row + dr ) );
    cursor.col = Math.min( COLS - 1, Math.max( 0, cursor.col + dc ) );
    repeatAt[ code ] = ts + REPEAT_RATE;
  }
}

function update( ts ) {
  if ( state === 'gameover' ) {
    if ( pressed( 'Space' ) ) initGame();
    return;
  }

  moveCursor( 'ArrowUp', -1, 0, ts );
  moveCursor( 'ArrowDown', 1, 0, ts );
  moveCursor( 'ArrowLeft', 0, -1, ts );
  moveCursor( 'ArrowRight', 0, 1, ts );

  if ( pressed( 'Space' ) ) reveal( cursor.row, cursor.col );
  if ( pressed( 'KeyF' ) ) toggleFlag( cursor.row, cursor.col );
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawFlag( x, y ) {
  ctx.save();
  ctx.translate( x, y );
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo( 0, 9 );
  ctx.lineTo( 0, -9 );
  ctx.stroke();
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.moveTo( 0, -9 );
  ctx.lineTo( 9, -5 );
  ctx.lineTo( 0, -1 );
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.fillRect( -6, 9, 12, 2.5 );
  ctx.restore();
}

function drawMine( x, y ) {
  ctx.save();
  ctx.translate( x, y );
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for ( let i = 0; i < 8; i++ ) {
    const a = ( i / 8 ) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo( Math.cos( a ) * 5, Math.sin( a ) * 5 );
    ctx.lineTo( Math.cos( a ) * 10, Math.sin( a ) * 10 );
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc( 0, 0, 7, 0, Math.PI * 2 );
  ctx.fill();
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc( -2, -2, 1.5, 0, Math.PI * 2 );
  ctx.fill();
  ctx.restore();
}

function drawBoard() {
  for ( let r = 0; r < ROWS; r++ ) {
    for ( let c = 0; c < COLS; c++ ) {
      const cell = board[ r ][ c ];
      const x = c * CELL;
      const y = r * CELL;
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;

      if ( cell.revealed ) {
        ctx.fillStyle = cell.mine ? '#5c1a1a' : '#161616';
        ctx.fillRect( x, y, CELL, CELL );
        ctx.strokeStyle = '#000';
        ctx.strokeRect( x, y, CELL, CELL );

        if ( cell.mine ) {
          drawMine( cx, cy );
        } else if ( cell.adjacent > 0 ) {
          ctx.fillStyle = NUMBER_COLORS[ cell.adjacent ];
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText( String( cell.adjacent ), cx, cy + 1 );
        }
      } else {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect( x + 1, y + 1, CELL - 2, CELL - 2 );
        ctx.strokeStyle = '#000';
        ctx.strokeRect( x, y, CELL, CELL );
        if ( cell.flagged ) drawFlag( cx, cy );
      }
    }
  }

  // Casilla resaltada bajo el cursor
  const hx = cursor.col * CELL;
  const hy = cursor.row * CELL;
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth = 3;
  ctx.strokeRect( hx + 1.5, hy + 1.5, CELL - 3, CELL - 3 );
}

function drawOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect( 0, 0, W, H );

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px monospace';
  ctx.fillText( win ? 'CAMPO LIMPIO' : 'BOOM', W / 2, H / 2 - 18 );

  ctx.font = '16px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText( `PUNTAJE: ${ score }   —   ESPACIO PARA REINICIAR`, W / 2, H / 2 + 18 );
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect( 0, 0, W, H );

  drawBoard();

  if ( state === 'gameover' ) drawOverlay();
}

// ── HUD externo (panel de controles a la derecha) ────────────────────────────
const flagsHud = document.getElementById( 'hud-flags' );
const minesHud = document.getElementById( 'hud-mines' );

function refreshSideHud() {
  if ( minesHud ) minesHud.textContent = String( MINES );
  if ( flagsHud ) flagsHud.textContent = `${ flags }/${ MINES }`;
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
