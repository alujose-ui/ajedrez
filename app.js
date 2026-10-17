// Problemas de ajedrez — modo "rush" con 3 fallos y dificultad creciente.
// Problemas: base de datos de Lichess (CC0), generada con generar_bbdd.py.
import { Chess } from './chess.js';

const SUBIDA = 60;        // puntos de nivel que sube cada problema
const VENTANA = 30;       // margen alrededor del nivel objetivo
const MAX_FALLOS = 3;
const T_RIVAL = 450;      // ms antes de que el rival responda
const T_INICIO = 700;     // ms antes de la jugada inicial del rival
const T_MOTOR = 800;      // ms que piensa el motor para cada sugerencia

const $ = (id) => document.getElementById(id);
const tablero = $('tablero');
const FILAS = 'abcdefgh';

let DB = [];              // [id, fen, jugadas, nivel], ordenado por nivel
let drag = null;

const S = {
  nivelInicial: 500,
  n: 0, ok: 0, fallos: 0, maxNivel: 0,
  usados: new Set(), fallados: [],
  p: null, movs: [], paso: 0, chess: null, color: 'w',
  modo: 'menu',           // menu | inicio | jugando | rival | fallado | resuelto | repaso
  sel: null, destinos: [], ultimo: null,
  vista: null,            // visor de solución
  gen: 0,                 // invalida temporizadores pendientes
};

// ---------- almacenamiento ----------
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------- utilidades de tablero ----------
function sqVisual(r, c) {
  return S.color === 'w' ? FILAS[c] + (8 - r) : FILAS[7 - c] + (r + 1);
}
function visual(sq) {
  const f = FILAS.indexOf(sq[0]), rk = +sq[1] - 1;
  return S.color === 'w' ? { r: 7 - rk, c: f } : { r: rk, c: 7 - f };
}
function casillaEn(x, y) {
  const b = tablero.getBoundingClientRect();
  const c = Math.floor((x - b.left) / b.width * 8), r = Math.floor((y - b.top) / b.height * 8);
  return (r < 0 || r > 7 || c < 0 || c > 7) ? null : sqVisual(r, c);
}
const uci = (m) => m.from + m.to + (m.promotion || '');
const parseUci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function reyEnJaque(ch) {
  if (!ch.inCheck()) return null;
  const turno = ch.turn();
  for (const fila of ch.board()) for (const x of fila)
    if (x && x.type === 'k' && x.color === turno) return x.square;
  return null;
}

// Dibuja una posición. o: {fen, ultimo, sel, destinos, flechas, malo, anim, jaque}
function dibujar(o) {
  const ch = new Chess(o.fen);
  const jaque = reyEnJaque(ch);
  let html = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = sqVisual(r, c);
    const clase = ['cas', (r + c) % 2 ? 'cs' : 'cl'];
    const pz = ch.get(sq);
    if (o.ultimo && (o.ultimo.from === sq || o.ultimo.to === sq)) clase.push('ultimo');
    if (o.sel === sq) clase.push('sel');
    if (o.malo === sq) clase.push('malo');
    if (jaque === sq) clase.push('jaque');
    if (o.destinos && o.destinos.includes(sq)) clase.push('destino', pz ? 'ocupada' : '');
    let dentro = '';
    if (r === 7) dentro += `<span class="coord f">${sq[0]}</span>`;
    if (c === 0) dentro += `<span class="coord r">${sq[1]}</span>`;
    if (pz) dentro += `<div class="pc ${pz.color}${pz.type}" data-sq="${sq}"></div>`;
    html += `<div class="${clase.join(' ')}">${dentro}</div>`;
  }
  if (o.flechas && o.flechas.length) {
    html += '<svg class="flechas" viewBox="0 0 8 8">';
    for (const f of o.flechas) {
      const a = visual(f.from), b = visual(f.to);
      const x1 = a.c + .5, y1 = a.r + .5, x2 = b.c + .5, y2 = b.r + .5;
      const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d;
      const px = x2 - ux * .12, py = y2 - uy * .12;            // punta
      const bx = px - ux * .42, by = py - uy * .42;            // base de la punta
      const w = .24;
      html += `<g fill="${f.color}" stroke="${f.color}" opacity=".85">` +
        `<line x1="${x1}" y1="${y1}" x2="${bx + ux * .05}" y2="${by + uy * .05}" stroke-width=".18" stroke-linecap="round"/>` +
        `<polygon stroke="none" points="${px},${py} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}"/></g>`;
    }
    html += '</svg>';
  }
  tablero.innerHTML = html;
  if (o.anim) animar(o.anim);
}

function animar(m) {
  const el = tablero.querySelector(`.pc[data-sq="${m.to}"]`);
  if (!el) return;
  const a = visual(m.from), b = visual(m.to);
  el.style.transform = `translate(${(a.c - b.c) * 100}%,${(a.r - b.r) * 100}%)`;
  el.getBoundingClientRect();           // fuerza el reflow
  el.classList.add('mov');
  el.style.transform = '';
}

function pintarJuego(extra = {}) {
  dibujar({ fen: S.chess.fen(), ultimo: S.ultimo, sel: S.sel, destinos: S.destinos, ...extra });
}

// ---------- pantallas y marcador ----------
function mostrar(id) {
  for (const s of ['inicio', 'juego', 'fin']) $(s).classList.toggle('oculto', s !== id);
}
function marcador() {
  $('mNum').textContent = S.n + 1;
  $('mNivel').textContent = S.p ? S.p[3] : '–';
  $('mOk').textContent = S.ok;
  [...$('mFallos').children].forEach((i, k) => i.classList.toggle('x', k < S.fallos));
}
function estado(txt, tipo = '') {
  const e = $('estado');
  e.className = 'estado ' + tipo;
  e.innerHTML = txt;
}
const textoTurno = (c) =>
  `<span class="turno" style="background:${c === 'w' ? '#fff' : '#000'}"></span>Juegan ${c === 'w' ? 'blancas' : 'negras'}`;

function botones(modo) {
  $('accJugando').classList.toggle('oculto', modo !== 'jugando');
  $('accSolucion').classList.toggle('oculto', modo !== 'solucion');
}

// ---------- selección de problema ----------
function indiceDesde(nivel) {          // primera posición con nivel >= dado
  let lo = 0, hi = DB.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (DB[m][3] < nivel) lo = m + 1; else hi = m; }
  return lo;
}
function elegirProblema() {
  const max = DB[DB.length - 1][3];
  const objetivo = Math.min(max, S.nivelInicial + SUBIDA * S.n);
  for (let v = VENTANA; v <= 4000; v *= 2) {
    const a = indiceDesde(objetivo - v), b = indiceDesde(objetivo + v);
    const cand = [];
    for (let i = a; i < b; i++) if (!S.usados.has(DB[i][0])) cand.push(DB[i]);
    if (cand.length) return cand[Math.floor(Math.random() * cand.length)];
  }
  S.usados.clear();
  return DB[indiceDesde(objetivo)] || DB[DB.length - 1];
}

// ---------- partida ----------
function nuevaPartida() {
  Object.assign(S, { n: 0, ok: 0, fallos: 0, maxNivel: 0, fallados: [] });
  S.usados.clear();
  mostrar('juego');
  $('btnTerminar').classList.remove('oculto');
  $('juego').querySelector('.marcador').classList.remove('oculto');
  nuevoProblema();
}

function nuevoProblema() {
  const g = ++S.gen;
  S.p = elegirProblema();
  S.usados.add(S.p[0]);
  S.chess = new Chess(S.p[1]);
  S.movs = S.p[2].split(' ');
  S.paso = 0;
  S.color = S.chess.turn() === 'w' ? 'b' : 'w';   // resuelve quien no hace la 1ª jugada
  S.sel = null; S.destinos = []; S.ultimo = null; S.vista = null;
  S.modo = 'inicio';
  marcador();
  botones('jugando');
  $('btnRendirse').disabled = true;
  estado(textoTurno(S.color));
  pintarJuego();
  setTimeout(() => {
    if (g !== S.gen) return;
    jugarRival();
    S.modo = 'jugando';
    $('btnRendirse').disabled = false;
    estado(textoTurno(S.color) + ' · tu turno');
  }, T_INICIO);
}

function jugarRival() {
  const m = S.chess.move(parseUci(S.movs[S.paso]));
  S.paso++;
  S.ultimo = { from: m.from, to: m.to };
  if (S.paso === 1) { S.fenJugador = S.chess.fen(); S.ultimoJugador = S.ultimo; }
  S.sel = null; S.destinos = [];
  pintarJuego({ anim: m });
  sonido(m.san);
}

// En 'jugando' se resuelve el problema; en los modos de análisis (tras
// acertar, fallar o al repasar) se pueden mover libremente ambos colores.
const ANALISIS = new Set(['fallado', 'resuelto', 'repaso']);
const interactivo = () => S.modo === 'jugando' || (ANALISIS.has(S.modo) && !!S.vista);
const chessActivo = () => (S.modo === 'jugando' ? S.chess : S.vista.ch);
const redibujar = () => (S.modo === 'jugando' ? pintarJuego() : pintarVista());

// En análisis se puede mover cualquier pieza aunque no sea su turno:
// se usa la misma posición cambiando el bando que mueve.
function chessParaPieza(sq) {
  const ch = chessActivo();
  if (S.modo === 'jugando') return ch;
  const pz = ch.get(sq);
  if (!pz || pz.color === ch.turn()) return ch;
  const f = ch.fen().split(' ');
  f[1] = pz.color; f[3] = '-';
  try { return new Chess(f.join(' ')); } catch { return ch; }
}

function seleccionar(sq) {
  S.sel = sq;
  S.destinos = [...new Set(chessParaPieza(sq).moves({ square: sq, verbose: true }).map((m) => m.to))];
  redibujar();
}
function deseleccionar() {
  if (!S.sel) return;
  S.sel = null; S.destinos = [];
  redibujar();
}
function mover(from, to, conAnimacion) {
  if (S.modo === 'jugando') intentar(from, to, conAnimacion);
  else movimientoLibre(from, to, conAnimacion);
}

function intentar(from, to, conAnimacion) {
  const esperado = parseUci(S.movs[S.paso]);
  const legales = S.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!legales.length) { deseleccionar(); return; }
  let promocion;
  if (legales[0].promotion)
    promocion = (esperado.from === from && esperado.to === to && esperado.promotion) || 'q';
  const m = S.chess.move({ from, to, promotion: promocion });
  S.sel = null; S.destinos = [];
  const correcto = uci(m) === S.movs[S.paso] || S.chess.isCheckmate();

  if (correcto) {
    S.paso++;
    S.ultimo = { from: m.from, to: m.to };
    pintarJuego({ anim: conAnimacion ? m : null });
    sonido(m.san);
    if (S.chess.isCheckmate() || S.paso >= S.movs.length) return resuelto();
    S.modo = 'rival';
    estado('¡Bien! Sigue…', 'ok');
    const g = S.gen;
    setTimeout(() => {
      if (g !== S.gen) return;
      jugarRival();
      S.modo = 'jugando';
      estado(textoTurno(S.color) + ' · tu turno');
    }, T_RIVAL);
  } else {
    // Enseña brevemente la jugada errónea y la deshace
    pintarJuego({ ultimo: { from: m.from, to: m.to }, malo: m.to, anim: conAnimacion ? m : null });
    sonido(m.san);
    S.modo = 'fallado';
    const g = S.gen;
    setTimeout(() => {
      if (g !== S.gen) return;
      S.chess.undo();
      fallo(`Incorrecto: ${m.san} no era la jugada.`);
    }, 650);
  }
}

function resuelto() {
  S.modo = 'resuelto';
  S.ok++;
  S.maxNivel = Math.max(S.maxNivel, S.p[3]);
  marcador();
  estado('¡Correcto! ✓', 'ok');
  $('btnRendirse').disabled = true;
  const g = S.gen;
  if (S.auto) {
    setTimeout(() => { if (g === S.gen) { S.n++; nuevoProblema(); } }, 900);
    return;
  }
  // Muestra la línea jugada (puede ser un mate distinto del oficial) y permite analizar
  const jugadas = S.chess.history({ verbose: true }).slice(1).map(uci);
  setTimeout(() => {
    if (g !== S.gen) return;
    abrirSolucion(S.fenJugador, jugadas, S.ultimoJugador);
    S.vista.i = S.vista.inicio = S.vista.jug.length;
    S.vista.texto = '¡Correcto! ✓';
    S.vista.tipo = 'ok';
    $('btnSiguiente').textContent = 'Siguiente problema';
    pintarVista();
  }, 350);
}

function fallo(texto) {
  S.gen++;                                // cancela respuestas pendientes
  S.modo = 'fallado';
  S.fallos++;
  S.fallados.push(S.p);
  marcador();
  abrirSolucion(S.chess.fen(), S.movs.slice(S.paso), S.ultimo);
  const fin = S.fallos >= MAX_FALLOS;
  $('btnSiguiente').textContent = fin ? 'Ver resultados' : 'Siguiente problema';
  S.vista.texto = `${texto} La buena era <b>${S.vista.san[0]}</b>.` +
    (fin ? ' Tercer fallo: fin de la partida.' : '');
  S.vista.tipo = 'bad';
  pintarVista();
}

// ---------- visor de la solución ----------
function abrirSolucion(fen, movs, ultimo) {
  const ch = new Chess(fen);
  const fens = [fen], jug = [], san = [];
  for (const u of movs) {
    const m = ch.move(parseUci(u));
    jug.push({ from: m.from, to: m.to });
    san.push(m.san);
    fens.push(ch.fen());
  }
  S.vista = { fens, jug, san, uci: movs, i: 0, inicio: 0, ultimo0: ultimo, texto: '', tipo: '', libre: null, ch: null };
  S.sel = null; S.destinos = [];
  botones('solucion');
}

function pintarVista(anim = null) {
  const v = S.vista, i = v.i, L = v.libre, n = v.jug.length;
  const fen = L ? L.fens[L.fens.length - 1] : v.fens[i];
  const ultimo = L ? L.jug[L.jug.length - 1] : i > 0 ? v.jug[i - 1] : v.ultimo0;
  v.ch = new Chess(fen);
  const terminada = v.ch.isGameOver();

  // Sugerencia del motor: solo en tus variantes (en la solución ya está la flecha verde)
  let sugerencia = '';
  const flechas = !L && i < n ? [{ ...v.jug[i], color: i % 2 === 0 ? '#15781b' : '#882020' }] : [];
  if (L && S.sugerencias && !terminada) {
    if (S.sug && S.sug.fen === fen) {
      if (S.sug.mov) flechas.push({ ...parseUci(S.sug.mov), color: '#1f5fbf' });
      sugerencia = S.sug.texto;
    } else if (Motor.disponible()) {
      sugerencia = '💡 Pensando…';
      Motor.analizar(fen, (mov, score) => {
        S.sug = { fen, mov, texto: textoSugerencia(fen, mov, score) };
        if (S.vista && S.vista.libre && ANALISIS.has(S.modo)) pintarVista();
      });
    } else sugerencia = '💡 El motor no ha podido cargarse';
  }
  dibujar({ fen, ultimo, flechas, sel: S.sel, destinos: S.destinos, anim });
  $('btnAtras').disabled = !L && i === 0;
  $('btnAdelante').disabled = !!L || i >= n;

  let txt, tipo = '';
  if (L) {
    const fin = v.ch.isCheckmate() ? ' — jaque mate' : v.ch.isStalemate() ? ' — ahogado' : '';
    txt = `Tu análisis: <b>${L.san.join(' ')}</b>${fin}`;
  } else if (i === v.inicio && v.texto) { txt = v.texto; tipo = v.tipo; }
  else if (i >= n) txt = 'Fin de la solución';
  else txt = `${i % 2 === 0 ? 'Tu jugada' : 'Responde el rival'}: <b>${v.san[i]}</b> (flecha ${i % 2 === 0 ? 'verde' : 'roja'})`;

  let pista;
  if (L) pista = '◀ deshace tus jugadas y vuelve a la solución';
  else if (i === v.inicio && v.tipo === 'bad') pista = 'Repite tu jugada en el tablero para ver qué te habría respondido el rival';
  else pista = `Toca o arrastra cualquier pieza para probar otras jugadas${i < n ? ' · ▶ avanza la solución' : ''}`;
  estado(`${txt}${sugerencia ? `<div class="sug">${sugerencia}</div>` : ''}` +
    `<div class="linea">Solución: ${lineaSolucion(v.san, L ? -1 : i)}</div><small>${pista}</small>`, tipo);
}

function textoSugerencia(fen, mov, score) {
  if (!mov || mov === '(none)') return '';
  let san = mov;
  try { san = new Chess(fen).move(parseUci(mov)).san; } catch {}
  const bando = fen.split(' ')[1] === 'w' ? 'blancas' : 'negras';
  let extra = '';
  if (score && score.tipo === 'mate') extra = score.v > 0 ? ` · da mate en ${score.v}` : ` · aun así, las ${bando} reciben mate en ${-score.v}`;
  else if (score) {
    const p = (fen.split(' ')[1] === 'w' ? score.v : -score.v) / 100;   // desde las blancas
    extra = ` · evaluación ${p > 0 ? '+' : ''}${p.toFixed(1)}`;
  }
  return `💡 Mejor jugada de ${bando}: <b>${san}</b> (flecha azul)${extra}`;
}

// ---------- sonidos (generados con Web Audio, sin ficheros) ----------
const Sonido = {
  ctx: null,
  activar() {                       // los móviles exigen crear el audio tras un toque
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.ctx = null; }
  },
  // "toc" de pieza de madera: ruido corto filtrado + golpe grave
  toc(fuerza = 1) {
    const c = this.ctx, t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.06);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const ruido = c.createBufferSource(); ruido.buffer = buf;
    const filtro = c.createBiquadFilter(); filtro.type = 'bandpass';
    filtro.frequency.value = 1700 - 300 * (fuerza - 1); filtro.Q.value = 1.2;
    const gr = c.createGain(); gr.gain.value = 0.55 * fuerza;
    ruido.connect(filtro).connect(gr).connect(c.destination);
    ruido.start(t);
    const osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t); osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    const go = c.createGain();
    go.gain.setValueAtTime(0.35 * fuerza, t); go.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(go).connect(c.destination);
    osc.start(t); osc.stop(t + 0.12);
  },
  nota(freq, ini, dur, vol = 0.18) {
    const c = this.ctx, t = c.currentTime + ini;
    const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  },
  jugada(san) {
    if (!S.sonido || !this.ctx || !san) return;
    try {
      if (san.includes('#')) {        // mate: toc + acorde ascendente
        this.toc(1.3); this.nota(659, 0.05, 0.25); this.nota(880, 0.14, 0.25); this.nota(1319, 0.23, 0.5);
      } else if (san.includes('+')) { // jaque: toc + dos notas
        this.toc(1.2); this.nota(988, 0.04, 0.16); this.nota(1319, 0.13, 0.3);
      } else if (san.includes('x')) this.toc(1.5);   // captura: más seco
      else this.toc(1);
    } catch {}
  },
};
const sonido = (san) => Sonido.jugada(san);
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => Sonido.activar(), { capture: true });

// ---------- motor de ajedrez (Stockfish 19 lite, un hilo, sin conexión) ----------
const Motor = {
  w: null, fallo: false, ocupado: null, cola: null,
  disponible() { this.iniciar(); return !!this.w; },
  iniciar() {
    if (this.w || this.fallo) return;
    try {
      this.w = new Worker('stockfish-19-lite-single.js');
      this.w.onmessage = (e) => this.linea(String(e.data));
      this.w.onerror = () => { this.w = null; this.fallo = true; };
      this.w.postMessage('uci');
      this.w.postMessage('isready');
    } catch { this.w = null; this.fallo = true; }
  },
  analizar(fen, cb) {
    if (!this.w) return;
    this.cola = { fen, cb, score: null };
    if (this.ocupado) this.w.postMessage('stop');   // la respuesta antigua se descarta
    else this.lanzar();
  },
  lanzar() {
    const t = this.cola;
    this.cola = null;
    if (!t) return;
    this.ocupado = t;
    this.w.postMessage('position fen ' + t.fen);
    this.w.postMessage('go movetime ' + T_MOTOR);
  },
  linea(l) {
    const t = this.ocupado;
    if (!t) return;
    if (l.startsWith('info') && l.includes(' pv ')) {
      const m = l.match(/score (cp|mate) (-?\d+)/);
      if (m) t.score = { tipo: m[1], v: +m[2] };
    } else if (l.startsWith('bestmove')) {
      this.ocupado = null;
      if (!this.cola) t.cb(l.split(' ')[1], t.score);
      this.lanzar();
    }
  },
};

// Jugada libre en modo análisis (cualquier color, sin comprobar la solución)
function movimientoLibre(from, to, conAnimacion) {
  const v = S.vista, ch = chessParaPieza(from);
  const legales = ch.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!legales.length) { deseleccionar(); return; }
  const fenAntes = ch.fen();
  const ultimoAntes = v.libre ? v.libre.jug[v.libre.jug.length - 1] : v.i > 0 ? v.jug[v.i - 1] : v.ultimo0;
  const m = ch.move({ from, to, promotion: legales[0].promotion ? 'q' : undefined });
  S.sel = null; S.destinos = [];
  const anim = conAnimacion ? m : null;
  sonido(m.san);
  // Si coincide con la siguiente jugada de la solución, simplemente avanza
  if (!v.libre && v.i < v.jug.length && uci(m) === v.uci[v.i]) { v.i++; pintarVista(anim); return; }
  if (!v.libre) v.libre = { fens: [fenAntes], jug: [ultimoAntes], san: [] };
  v.libre.fens.push(ch.fen());
  v.libre.jug.push({ from: m.from, to: m.to });
  v.libre.san.push(m.san);
  pintarVista(anim);
}

// "1. Rd8+ Kh7 2. Qh5#", marcando la jugada que señala la flecha
function lineaSolucion(san, actual) {
  return san.map((s, k) => {
    const num = k % 2 === 0 ? `${k / 2 + 1}. ` : '';
    const cls = k === actual ? 'act' : k < actual ? 'hecha' : '';
    return `${num}<span class="${cls}">${s}</span>`;
  }).join(' ');
}

// ---------- fin de partida ----------
function terminar() {
  S.gen++;
  S.modo = 'menu';
  const rec = leer('ajedrez.record', { resueltos: 0, nivel: 0 });
  const nuevo = S.ok > rec.resueltos || (S.ok === rec.resueltos && S.maxNivel > rec.nivel);
  if (nuevo) guardar('ajedrez.record', { resueltos: S.ok, nivel: S.maxNivel });
  $('fResueltos').textContent = S.ok;
  $('fNivel').textContent = S.ok ? `Nivel más alto resuelto: ${S.maxNivel}` : 'Ningún problema resuelto esta vez';
  $('fRecord').textContent = nuevo && S.ok ? '¡Nuevo récord!' : `Récord: ${rec.resueltos} (nivel ${rec.nivel})`;
  const lista = $('fFallados');
  lista.innerHTML = '';
  for (const p of S.fallados) {
    const b = document.createElement('button');
    const turno = new Chess(p[1]).turn() === 'w' ? 'negras' : 'blancas';
    b.innerHTML = `<span>Nivel ${p[3]}</span><span>juegan ${turno} ›</span>`;
    b.onclick = () => repasar(p);
    lista.appendChild(b);
  }
  $('fFalladosCaja').classList.toggle('oculto', !S.fallados.length);
  mostrar('fin');
  actualizarInicio();
}

function repasar(p) {
  S.gen++;
  S.modo = 'repaso';
  S.p = p;
  const ch = new Chess(p[1]);
  const movs = p[2].split(' ');
  S.color = ch.turn() === 'w' ? 'b' : 'w';
  const m = ch.move(parseUci(movs[0]));
  mostrar('juego');
  $('juego').querySelector('.marcador').classList.add('oculto');
  $('btnTerminar').classList.add('oculto');
  abrirSolucion(ch.fen(), movs.slice(1), { from: m.from, to: m.to });
  $('btnSiguiente').textContent = 'Volver';
  S.vista.texto = '';
  pintarVista();
}

function actualizarInicio() {
  const rec = leer('ajedrez.record', { resueltos: 0, nivel: 0 });
  $('recordResueltos').textContent = rec.resueltos;
  $('recordNivel').textContent = rec.resueltos ? `Nivel más alto: ${rec.nivel}` : 'Aún no hay récord';
}

// ---------- entrada: tocar o arrastrar ----------
tablero.addEventListener('pointerdown', (e) => {
  if (!interactivo()) return;
  const sq = casillaEn(e.clientX, e.clientY);
  if (!sq) return;
  if (S.sel && S.destinos.includes(sq)) { mover(S.sel, sq, true); return; }
  const pz = chessActivo().get(sq);
  if (pz && (S.modo !== 'jugando' || pz.color === S.color)) {
    if (S.sel !== sq) seleccionar(sq);
    drag = { sq, x: e.clientX, y: e.clientY, activo: false, id: e.pointerId, fantasma: null };
    tablero.setPointerCapture(e.pointerId);
  } else deseleccionar();
});

tablero.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.activo) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    const el = tablero.querySelector(`.pc[data-sq="${drag.sq}"]`);
    if (!el) return;
    drag.activo = true;
    el.classList.add('arrastrada');
    const tam = tablero.getBoundingClientRect().width / 8 * 1.15;
    const f = document.createElement('div');
    f.className = el.className.replace('arrastrada', '') + ' fantasma';
    f.classList.remove('pc');
    f.style.backgroundImage = getComputedStyle(el).backgroundImage;
    f.style.width = f.style.height = tam + 'px';
    document.body.appendChild(f);
    drag.fantasma = f; drag.tam = tam;
  }
  drag.fantasma.style.left = e.clientX - drag.tam / 2 + 'px';
  drag.fantasma.style.top = e.clientY - drag.tam / 2 + 'px';
});

function finArrastre(e, cancelado) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.activo) return;                 // fue un toque: la pieza queda seleccionada
  d.fantasma.remove();
  const sq = cancelado ? null : casillaEn(e.clientX, e.clientY);
  if (sq && sq !== d.sq && interactivo() && S.destinos.includes(sq)) mover(d.sq, sq, false);
  else if (interactivo()) redibujar();
}
tablero.addEventListener('pointerup', (e) => finArrastre(e, false));
tablero.addEventListener('pointercancel', (e) => finArrastre(e, true));

// ---------- botones ----------
$('btnRendirse').onclick = () => {
  if (S.modo !== 'jugando') return;
  fallo('Te has rendido.');
};
$('btnIdea').onclick = () => {
  S.sugerencias = !S.sugerencias;
  guardar('ajedrez.sugerencias', S.sugerencias);
  $('btnIdea').classList.toggle('apagado', !S.sugerencias);
  if (S.vista) pintarVista();
};
$('btnAtras').onclick = () => {
  const v = S.vista, L = v.libre;
  S.sel = null; S.destinos = [];
  if (L) {
    L.fens.pop(); L.jug.pop(); L.san.pop();
    if (!L.san.length) v.libre = null;
  } else if (v.i > 0) v.i--;
  pintarVista();
};
$('btnAdelante').onclick = () => {
  const v = S.vista;
  if (v.libre || v.i >= v.jug.length) return;
  S.sel = null; S.destinos = [];
  v.i++;
  pintarVista(v.jug[v.i - 1]);
  sonido(v.san[v.i - 1]);
};
$('btnSiguiente').onclick = () => {
  if (S.modo === 'repaso') { mostrar('fin'); return; }
  if (S.fallos >= MAX_FALLOS) { terminar(); return; }
  S.n++;
  nuevoProblema();
};
$('btnTerminar').onclick = () => {
  if (confirm('¿Terminar la partida?')) terminar();
};
$('btnOtra').onclick = nuevaPartida;
$('btnMenu').onclick = () => { mostrar('inicio'); };
$('btnEmpezar').onclick = nuevaPartida;

for (const b of $('niveles').children) {
  b.onclick = () => {
    S.nivelInicial = +b.dataset.nivel;
    guardar('ajedrez.nivelInicial', S.nivelInicial);
    for (const x of $('niveles').children) x.classList.toggle('activo', x === b);
  };
}

// ---------- arranque ----------
S.nivelInicial = leer('ajedrez.nivelInicial', 500);
S.auto = leer('ajedrez.auto', false);
S.sonido = leer('ajedrez.sonido', true);
$('chkSonido').checked = S.sonido;
$('chkSonido').onchange = () => { S.sonido = $('chkSonido').checked; guardar('ajedrez.sonido', S.sonido); if (S.sonido) { Sonido.activar(); sonido('e4'); } };
S.sugerencias = leer('ajedrez.sugerencias', true);
$('btnIdea').classList.toggle('apagado', !S.sugerencias);
$('chkAuto').checked = S.auto;
$('chkAuto').onchange = () => { S.auto = $('chkAuto').checked; guardar('ajedrez.auto', S.auto); };
for (const x of $('niveles').children) x.classList.toggle('activo', +x.dataset.nivel === S.nivelInicial);
actualizarInicio();

fetch('puzzles.json')
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => {
    DB = d.puzzles.slice().sort((a, b) => a[3] - b[3]);
    if (!DB.length) throw new Error('vacía');
    $('btnEmpezar').disabled = false;
    $('btnEmpezar').textContent = 'Empezar';
    $('infoBbdd').textContent =
      `${DB.length.toLocaleString('es-ES')} problemas · nivel ${DB[0][3]} a ${DB[DB.length - 1][3]}`;
  })
  .catch(() => {
    $('btnEmpezar').textContent = 'Falta puzzles.json';
    $('infoBbdd').textContent = 'Genera la base de datos con generar_bbdd.py y cópiala junto a index.html.';
  });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
