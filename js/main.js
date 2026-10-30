// Liga as regras e a IA ao céu 3D, ao Quest (controles e mãos) e ao mouse do PC.
import * as THREE from '../vendor/three/three.module.js';
import { LEVELS, boardOf } from './levels.js';
import { Game, PLAYER, CPU, PRE } from './game.js';
import { OPPONENTS, ROBOT, chooseMove, rng } from './ai.js';
import { edgeOf } from './board.js';
import { buildWorld, glowTexture, ringTexture } from './sky.js';
import { Panel, Label, C as UIC } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, unlocked, resetSave } from './save.js';

let save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

const R = 6;                                  // raio da esfera de estrelas (m)
const CENTER = new THREE.Vector3(0, 1.5, 0);  // centro da esfera (mais ou menos a altura da cabeça)
const PLAYER_COLOR = 0x5ad8ff, PLAYER_CSS = '#5ad8ff';
const PRE_COLOR = 0xb8c0e8;
const CPU_DELAY = 0.55, COMET_TIME = 0.6, DRAW_TIME = 0.35;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(0.5);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld();
const { scene } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.copy(CENTER);
rig.add(camera);
const view = { yaw: 0, pitch: 0.15, tyaw: 0, tpitch: 0.15, fov: 65 };

const texStar = glowTexture('#ffffff', 'rgba(140,170,255,0.45)');
const texGiant = glowTexture('#fff6d8', 'rgba(255,190,80,0.6)', true);
const texComet = glowTexture('#ffffff', 'rgba(255,160,90,0.6)');
const texRing = ringTexture();
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const matStar = new THREE.SpriteMaterial({ map: texStar, color: 0xdfe6ff, ...additive });
const matGiant = new THREE.SpriteMaterial({ map: texGiant, color: 0xffd27a, ...additive });

const panel = new Panel(1.0);
scene.add(panel.mesh);
panel.mesh.visible = false;
const statusLabel = new Label(0.5, 1024, 176);
statusLabel.mesh.position.set(0, -0.33, -1.0);
statusLabel.mesh.rotation.x = -0.3;
statusLabel.mesh.visible = false;
camera.add(statusLabel.mesh);
const fpsLabel = new Label(0.1);
fpsLabel.mesh.position.set(0.17, -0.12, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);

// Seta que aponta para fora do campo de visão (onde o adversário jogou)
const arrow = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.05); s.lineTo(-0.04, -0.01); s.lineTo(-0.014, -0.01); s.lineTo(-0.014, -0.045);
  s.lineTo(0.014, -0.045); s.lineTo(0.014, -0.01); s.lineTo(0.04, -0.01); s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = 12; m.visible = false;
  camera.add(m);
  return m;
})();
const attention = { pos: null, color: 0xffffff, seen: 0 };

// ---------- Vista do tabuleiro ----------
class ArcCurve extends THREE.Curve {
  constructor(a, b, r) { super(); this.a = a; this.b = b; this.r = r; this.ang = a.angleTo(b); }
  getPoint(t, out = new THREE.Vector3()) {
    const s = Math.sin(this.ang) || 1;
    const wa = Math.sin((1 - t) * this.ang) / s, wb = Math.sin(t * this.ang) / s;
    return out.copy(this.a).multiplyScalar(wa).addScaledVector(this.b, wb).normalize().multiplyScalar(this.r).add(CENTER);
  }
}
const ARC_SEG = 10;
const lineMats = {};
function lineMat(color) { return lineMats[color] ||= new THREE.MeshBasicMaterial({ color, ...additive, opacity: 0.95 }); }
const hoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff, ...additive, opacity: 0.8 });
let hoverMesh = null;

let bv = null; // vista do tabuleiro atual
function clearBoardView() {
  if (!bv) return;
  scene.remove(bv.group);
  bv.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  bv = null;
}
function buildBoardView(board) {
  clearBoardView();
  const group = new THREE.Group();
  const dirs = board.stars.map(s => new THREE.Vector3(...s.dir));
  const pos = dirs.map(d => d.clone().multiplyScalar(R).add(CENTER));
  const sprites = board.stars.map((s, i) => {
    const sp = new THREE.Sprite(s.giant ? matGiant : matStar);
    sp.position.copy(pos[i]);
    sp.userData.base = s.giant ? 0.75 : 0.36;
    sp.scale.setScalar(sp.userData.base);
    group.add(sp);
    return sp;
  });
  // traços possíveis: linhas finas (todas num objeto só)
  const gp = new Float32Array(board.edges.length * ARC_SEG * 2 * 3);
  const gc = new Float32Array(gp.length);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  board.edges.forEach(([a, b], e) => {
    const cv = new ArcCurve(dirs[a], dirs[b], R * 0.998);
    for (let k = 0; k < ARC_SEG; k++) {
      cv.getPoint(k / ARC_SEG, tmp); cv.getPoint((k + 1) / ARC_SEG, tmp2);
      gp.set([tmp.x, tmp.y, tmp.z, tmp2.x, tmp2.y, tmp2.z], (e * ARC_SEG + k) * 6);
    }
  });
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  guideGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const guides = new THREE.LineSegments(guideGeo, new THREE.LineBasicMaterial({ vertexColors: true, ...additive }));
  guides.frustumCulled = false;
  group.add(guides);
  scene.add(group);
  bv = { board, group, dirs, pos, sprites, guides, gc, lines: [], tris: [], anims: [], pulses: new Float32Array(board.stars.length) };
  board.edges.forEach((_, e) => setGuide(e, 0.22));
  return bv;
}
function setGuide(e, v) {
  const c = bv.gc;
  for (let k = e * ARC_SEG * 6; k < (e + 1) * ARC_SEG * 6; k += 3) { c[k] = v * 0.75; c[k + 1] = v * 0.8; c[k + 2] = v * 1.3; }
  bv.guides.geometry.attributes.color.needsUpdate = true;
}
function edgeTube(e, radius = 0.024) {
  const [a, b] = bv.board.edges[e];
  return new THREE.TubeGeometry(new ArcCurve(bv.dirs[a], bv.dirs[b], R * 0.997), 16, radius, 5, false);
}
function drawEdge(e, owner, instant = false) {
  const color = owner === PRE ? PRE_COLOR : owner === PLAYER ? PLAYER_COLOR : OPPONENTS[cur.opp].color;
  const geo = edgeTube(e, owner === PRE ? 0.018 : 0.026);
  const m = new THREE.Mesh(geo, lineMat(color));
  m.frustumCulled = false;
  bv.group.add(m);
  bv.lines[e] = m;
  setGuide(e, 0);
  if (!instant) {
    geo.setDrawRange(0, 0);
    bv.anims.push({ t: 0, dur: DRAW_TIME, fn: (k) => geo.setDrawRange(0, Math.ceil(k * 16) * 5 * 6) });
  }
  const [a, b] = bv.board.edges[e];
  bv.pulses[a] = bv.pulses[b] = 1;
}
function triGeometry(t) {
  const [a, b, c] = bv.board.tris[t].v.map(i => bv.dirs[i]);
  const n = 6, P = [], I = [], idx = [];
  for (let i = 0; i <= n; i++) { idx.push([]); for (let j = 0; j <= n - i; j++) {
    const p = new THREE.Vector3().addScaledVector(a, n - i - j).addScaledVector(b, i).addScaledVector(c, j).normalize().multiplyScalar(R * 0.993).add(CENTER);
    idx[i].push(P.length / 3); P.push(p.x, p.y, p.z);
  } }
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    I.push(idx[i][j], idx[i + 1][j], idx[i][j + 1]);
    if (j < n - i - 1) I.push(idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}
function fillTri(t, owner) {
  const color = owner === PLAYER ? PLAYER_COLOR : OPPONENTS[cur.opp].color;
  const mat = new THREE.MeshBasicMaterial({ color, ...additive, opacity: 0.9, side: THREE.DoubleSide });
  const m = new THREE.Mesh(triGeometry(t), mat);
  bv.group.add(m);
  bv.tris[t] = m;
  bv.anims.push({ t: 0, dur: 0.9, fn: (k) => { mat.opacity = 0.9 - 0.62 * k; } });
  for (const v of bv.board.tris[t].v) bv.pulses[v] = 1.6;
  // "+N" subindo do meio do triângulo
  const val = bv.board.tris[t].value;
  const cen = new THREE.Vector3();
  for (const v of bv.board.tris[t].v) cen.add(bv.dirs[v]);
  cen.normalize();
  const sp = textSprite(`+${val}`, owner === PLAYER ? PLAYER_CSS : OPPONENTS[cur.opp].css);
  sp.position.copy(cen).multiplyScalar(R * 0.95).add(CENTER);
  sp.scale.set(0.7, 0.35, 1);
  bv.group.add(sp);
  bv.anims.push({ t: 0, dur: 1.3, fn: (k) => {
    sp.position.copy(cen).multiplyScalar(R * (0.95 - 0.12 * k)).add(CENTER);
    sp.material.opacity = 1 - k * k;
    if (k >= 1) { bv?.group.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  } });
}
function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
}
const comet = new THREE.Sprite(new THREE.SpriteMaterial({ map: texComet, color: 0xffffff, ...additive }));
comet.scale.setScalar(0.5); comet.visible = false;
scene.add(comet);
const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: texRing, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false }));
reticle.scale.setScalar(0.22); reticle.renderOrder = 8; reticle.visible = false;
scene.add(reticle);

// ---------- Estado da partida ----------
let app = 'menu';       // menu | play | paused | over
let screen = 'main';    // tela do painel
let cur = null;         // { level, opp, game, phase, timer, ... }
let selLevel = 0, selOpp = 0;
let time = 0;
let msg = { text: '', t: 0 };
const rnd = rng((Date.now() & 0xffff) + 1);

function startLevel(level, opp) {
  const board = boardOf(level);
  const game = new Game(board, LEVELS[level].first);
  cur = { level, opp, game, phase: 'wait', timer: 0.6, comet: null, robotT: 0, combo: 0, lastCpu: null };
  buildBoardView(board);
  for (const e of board.pre) drawEdge(e, PRE, true);
  app = 'play';
  panel.hide();
  hideHover();
  setMsg(game.turn === PLAYER ? 'Você começa' : `${OPPONENTS[opp].name} começa`);
  // olhar para o céu: no PC a câmera vira sozinha; no VR a seta mostra onde está
  const c = new THREE.Vector3(...board.center);
  pointAt(c.clone().multiplyScalar(R).add(CENTER), 0xffd98a);
  if (!renderer.xr.isPresenting) faceDir(c);
}
function faceDir(d) {
  view.tyaw = Math.atan2(-d.x, -d.z);
  view.tpitch = clamp(Math.asin(clamp(d.y, -1, 1)), -0.6, 0.75);
  if (d.y > 0.95) view.tyaw = view.yaw;
}
function pointAt(p, color) { attention.pos = p ? p.clone() : null; attention.color = color; attention.seen = 0; }
function setMsg(text, dur = 2.6) { msg = { text, t: dur }; }

function playerCanAct() { return app === 'play' && cur && cur.phase === 'player' && !cur.game.over; }

function playMove(e) {
  const g = cur.game;
  const res = g.play(e);
  drawEdge(e, res.by);
  const mine = res.by === PLAYER;
  sfx.line(mine);
  if (res.closed.length) {
    res.closed.forEach((t, i) => { fillTri(t, res.by); });
    sfx.capture(Math.max(...res.closed.map(t => g.b.tris[t].value)), mine, cur.combo++);
    const name = mine ? 'Você' : OPPONENTS[cur.opp].name;
    const n = res.closed.length;
    setMsg(`${name} fechou ${n === 1 ? 'um triângulo' : `${n} triângulos`} (+${res.points})${g.over ? '' : mine ? ': jogue de novo' : ' e joga de novo'}`);
    pulse('right', 0.6, 60); pulse('left', 0.6, 60);
  } else cur.combo = 0;
  if (mine) { attention.pos = null; }
  else {
    const [a, b] = g.b.edges[e];
    const mid = bv.dirs[a].clone().add(bv.dirs[b]).normalize().multiplyScalar(R).add(CENTER);
    cur.lastCpu = e;
    pointAt(mid, OPPONENTS[cur.opp].color);
  }
  if (g.over) { cur.phase = 'ending'; cur.timer = 1.4; }
  else { cur.phase = 'wait'; cur.timer = g.turn === PLAYER ? 0.25 : CPU_DELAY; }
  return res;
}

function tryPlayerMove(e) {
  if (!playerCanAct() || e < 0) return false;
  if (!cur.game.legal(e)) { sfx.deny(); return false; }
  playMove(e);
  return true;
}

function finishGame() {
  const g = cur.game;
  const w = g.winner;
  app = 'over';
  save.played++;
  if (w === PLAYER) {
    save.beaten[cur.level][cur.opp] = true;
    const b = save.best[cur.level];
    if (!b || g.scores[0] - g.scores[1] > b[0] - b[1]) save.best[cur.level] = [...g.scores];
    sfx.win();
  } else sfx.lose();
  storeSave(save);
  showScreen('over');
}

function stepGame(dt) {
  if (!cur || app !== 'play') return;
  const g = cur.game;
  if (cur.phase === 'wait') {
    cur.timer -= dt;
    if (cur.timer > 0) return;
    if (g.turn === PLAYER) { cur.phase = 'player'; cur.robotT = 0.35; }
    else {
      const e = chooseMove(g, OPPONENTS[cur.opp], rnd);
      const [a, b] = g.b.edges[e];
      const mid = bv.dirs[a].clone().add(bv.dirs[b]).normalize();
      const from = cur.comet ? cur.comet.clone() : new THREE.Vector3(...g.b.center);
      cur.cometMove = { e, from, to: mid, t: 0 };
      cur.phase = 'comet';
      comet.material.color.setHex(OPPONENTS[cur.opp].color);
      comet.visible = true;
    }
  } else if (cur.phase === 'comet') {
    const cm = cur.cometMove;
    cm.t += dt / COMET_TIME;
    const k = Math.min(1, cm.t), s = k * k * (3 - 2 * k);
    const d = cm.from.clone().lerp(cm.to, s).normalize();
    comet.position.copy(d).multiplyScalar(R * 0.99).add(CENTER);
    comet.scale.setScalar(0.45 + Math.sin(k * Math.PI) * 0.25);
    if (!attention.pos || attention.color !== OPPONENTS[cur.opp].color) pointAt(comet.position, OPPONENTS[cur.opp].color);
    else attention.pos.copy(comet.position);
    if (k >= 1) { cur.comet = cm.to.clone(); playMove(cm.e); }
  } else if (cur.phase === 'player') {
    if (dev.autoplay) {
      cur.robotT -= dt;
      if (cur.robotT <= 0) playMove(chooseMove(g, ROBOT, rnd));
    }
  } else if (cur.phase === 'ending') {
    cur.timer -= dt;
    if (cur.timer <= 0) finishGame();
  }
  comet.visible = cur.phase === 'comet' || (cur.phase === 'wait' && g.turn === CPU && cur.comet !== null && !g.over);
}

// ---------- Mirar (raio contra a esfera) ----------
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function hitSphere(o, d) {
  const oc = o.clone().sub(CENTER);
  const b = oc.dot(d), c = oc.lengthSq() - R * R;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b + Math.sqrt(disc);
  return t > 0 ? o.clone().addScaledVector(d, t) : null;
}
// Distância angular de n até o arco a-b (todos unitários).
function arcDist(n, a, b) {
  const m = new THREE.Vector3().crossVectors(a, b).normalize();
  const p = n.clone().addScaledVector(m, -n.dot(m));
  if (p.lengthSq() < 1e-9) return Math.PI;
  p.normalize();
  if (a.angleTo(p) + p.angleTo(b) <= a.angleTo(b) + 1e-6) return Math.asin(clamp(Math.abs(n.dot(m)), 0, 1));
  return Math.min(n.angleTo(a), n.angleTo(b));
}
const hover = { edge: -1, star: -1, point: null };
let drag = null; // { star, src } ligando de uma estrela a outra
function pickAt(o, d) {
  hover.edge = -1; hover.star = -1; hover.point = null;
  if (!bv) return;
  const p = hitSphere(o, d);
  if (!p) return;
  hover.point = p;
  const n = p.clone().sub(CENTER).normalize();
  const board = bv.board, D = board.d;
  if (drag) {
    // ligando: a estrela vizinha mais perto do ponteiro
    let best = -1, bd = Infinity;
    for (const e of board.starEdges[drag.star]) {
      const [a, b] = board.edges[e];
      const other = a === drag.star ? b : a;
      const ang = n.angleTo(bv.dirs[other]);
      if (ang < bd) { bd = ang; best = e; }
    }
    if (best >= 0 && bd < D * 0.5) hover.edge = best;
    return;
  }
  let sb = -1, sd = Infinity;
  bv.dirs.forEach((v, i) => { const a = n.angleTo(v); if (a < sd) { sd = a; sb = i; } });
  if (sd < D * 0.2) hover.star = sb;
  let eb = -1, ed = Infinity;
  board.edges.forEach(([a, b], e) => {
    if (cur && cur.game.edge[e] !== -1) return;
    const dd = arcDist(n, bv.dirs[a], bv.dirs[b]);
    if (dd < ed) { ed = dd; eb = e; }
  });
  if (hover.star < 0 && eb >= 0 && ed < D * 0.4) hover.edge = eb;
}
let hoverShown = -2;
function hideHover() { if (hoverMesh) { scene.remove(hoverMesh); hoverMesh.geometry.dispose(); hoverMesh = null; } hoverShown = -2; }
function updateHoverVisual() {
  const active = app === 'play' && cur && (cur.phase === 'player' || cur.phase === 'wait') && cur.game.turn === PLAYER && !dev.autoplay;
  const e = active && hover.edge >= 0 && cur.game.edge[hover.edge] === -1 ? hover.edge : -1;
  if (e !== hoverShown || (drag && e < 0)) {
    hideHover();
    hoverShown = e;
    if (e >= 0) {
      hoverMesh = new THREE.Mesh(edgeTube(e, 0.04), hoverMat);
      hoverMesh.frustumCulled = false;
      scene.add(hoverMesh);
      sfx.hover();
    } else if (drag && hover.point) {
      // traço solto seguindo o ponteiro
      const n = hover.point.clone().sub(CENTER).normalize();
      hoverMesh = new THREE.Mesh(new THREE.TubeGeometry(new ArcCurve(bv.dirs[drag.star], n, R * 0.997), 10, 0.02, 4, false), hoverMat);
      hoverMesh.frustumCulled = false;
      scene.add(hoverMesh);
      hoverShown = -3;
    }
  }
  if (hoverMesh) {
    let col = 0xffffff;
    if (e >= 0 && save.assist) {
      const ts = cur.game.b.edgeTris[e], cnt = cur.game.cnt;
      if (ts.some(t => cnt[t] === 2)) col = 0x7dffa0;        // fecha triângulo
      else if (ts.some(t => cnt[t] === 1)) col = 0xffe14a;   // entrega triângulo
    }
    hoverMat.color.setHex(col);
    hoverMat.opacity = 0.6 + 0.3 * Math.sin(time * 8);
  }
  if (bv) bv.sprites.forEach((sp, i) => {
    const hs = (i === hover.star && active) || (drag && i === drag.star) ? 1.5 : 1;
    sp.scale.setScalar(sp.userData.base * hs * (1 + bv.pulses[i] * 0.5) * (1 + 0.06 * Math.sin(time * 2.3 + i * 1.7)));
  });
  reticle.visible = !!hover.point && app === 'play' && !panel.visible;
  if (reticle.visible) reticle.position.copy(hover.point.clone().sub(CENTER).multiplyScalar(0.985).add(CENTER));
}

function startDrag(src) {
  if (!playerCanAct() || hover.star < 0) return false;
  drag = { star: hover.star, src };
  sfx.grab();
  return true;
}
function endDrag() {
  if (!drag) return;
  const e = hover.edge;
  drag = null;
  hideHover();
  if (e >= 0) tryPlayerMove(e);
}

// ---------- Painel (menus) ----------
function showScreen(name) {
  screen = name;
  panel.show(drawScreen);
  placePanel();
  if (name === 'levels') previewLevel(selLevel);
}
function previewLevel(i) {
  if (app === 'play' || app === 'paused') return;
  cur = null;
  buildBoardView(boardOf(i));
  for (const e of boardOf(i).pre) { const geo = edgeTube(e, 0.018); const m = new THREE.Mesh(geo, lineMat(PRE_COLOR)); bv.group.add(m); setGuide(e, 0); }
}
function drawScreen(p) {
  const W = 1024;
  if (screen === 'main') {
    p.title('Constelação', 90);
    p.text('Ligue as estrelas, feche triângulos, ganhe o céu', W / 2, 150, { size: 28, color: UIC.dim });
    p.button('Jogar', () => showScreen('levels'), 312, 200, 400, 96, { size: 44 });
    p.button('Como jogar', () => showScreen('help'), 312, 312, 400, 76);
    p.button(`Som: ${save.sound ? 'ligado' : 'desligado'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); p.redraw(); }, 112, 410, 390, 70, { size: 28 });
    p.button(`Cor nos traços: ${!save.assist ? 'não' : 'sim'}`, () => { save.assist = !save.assist; storeSave(save); p.redraw(); }, 522, 410, 390, 70, { size: 28 });
    p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); p.redraw(); }, 312, 496, 400, 64, { size: 26 });
    const won = save.beaten.filter(x => x.some(Boolean)).length, all = save.beaten.flat().filter(Boolean).length;
    p.text(`${won} de 10 céus vencidos · ${all} de 30 estrelas`, W / 2, 610, { size: 26, color: UIC.dim });
    p.text(IS_QUEST || renderer.xr.isPresenting ? 'Aponte e aperte o gatilho' : 'Clique para escolher · arraste para olhar em volta', W / 2, 660, { size: 22, color: UIC.dim });
  } else if (screen === 'levels') {
    p.title('Escolha o céu', 60);
    const tw = 172, th = 112, gap = 16, x0 = (W - (5 * tw + 4 * gap)) / 2;
    LEVELS.forEach((L, i) => {
      const x = x0 + (i % 5) * (tw + gap), y = 105 + Math.floor(i / 5) * (th + gap);
      const n = save.beaten[i].filter(Boolean).length;
      p.tile(x, y, tw, th, { num: i + 1, name: L.name, stars: n, done: n > 0, locked: !unlocked(save, i), master: save.beaten[i][2],
        action: () => { selLevel = i; sfx.click(); previewLevel(i); p.redraw(); } });
      if (i === selLevel) { const g = p.ctx; g.strokeStyle = UIC.btnOn; g.lineWidth = 5; g.strokeRect(x - 4, y - 4, tw + 8, th + 8); }
    });
    const L = LEVELS[selLevel], b = boardOf(selLevel);
    const giants = b.stars.filter(s => s.giant).length;
    p.text(`${selLevel + 1}. ${L.name}`, W / 2, 378, { size: 34, bold: true, color: UIC.edge });
    p.text(L.desc, W / 2, 416, { size: 24 });
    p.text(`${b.stars.length} estrelas · ${b.edges.length - b.pre.length} traços · ${b.tris.length} triângulos${giants ? ` · ${giants} gigante${giants > 1 ? 's' : ''}` : ''} · ${L.first === 0 ? 'você começa' : 'ele começa'}`, W / 2, 450, { size: 22, color: UIC.dim });
    OPPONENTS.forEach((o, k) => {
      const done = save.beaten[selLevel][k];
      p.button(o.name, () => { selOpp = k; sfx.click(); p.redraw(); }, 50 + k * 317, 478, 290, 92, { on: selOpp === k, size: 30, sub: done ? `${o.title} · vencido ✓` : o.title });
    });
    p.text(OPPONENTS[selOpp].about, W / 2, 596, { size: 22, color: OPPONENTS[selOpp].css });
    p.button('Voltar', () => { clearBoardView(); showScreen('main'); }, 50, 622, 300, 76);
    p.button('Começar', () => { sfx.click(); startLevel(selLevel, selOpp); }, 674, 622, 300, 76, { locked: !unlocked(save, selLevel), size: 36 });
  } else if (screen === 'help') {
    p.title('Como jogar', 64);
    const lines = [
      'Na sua vez, ligue duas estrelas vizinhas com um traço de luz.',
      'Fechou os três lados de um triângulo? Ele é seu e você joga de novo.',
      'Estrela gigante (dourada): cada triângulo com ela vale 1 ponto a mais.',
      'Traços prateados já vêm desenhados. Acabaram os traços: ganha quem',
      'tem mais pontos. Empate em pontos: ganha quem fechou o último triângulo.',
      'Cuidado: o 2º lado de um triângulo entrega ele para o adversário.',
      'Traço verde fecha triângulo; amarelo entrega (dá para desligar a cor).',
      'VR: aponte e aperte o gatilho (ou arraste de uma estrela até a vizinha).',
      'Mãos: aponte e faça pinça. Manche: vira 30°. B ou Y: pausa.',
      'PC: arraste para olhar em volta, clique entre duas estrelas. Esc: pausa.',
    ];
    lines.forEach((l, i) => p.text(l, W / 2, 130 + i * 48, { size: 25 }));
    p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 620, 300, 76);
  } else if (screen === 'pause') {
    p.title('Pausa', 80);
    const g = cur.game;
    p.text(`${LEVELS[cur.level].name} contra ${OPPONENTS[cur.opp].name}: você ${g.scores[0]} × ${g.scores[1]}`, W / 2, 150, { size: 28 });
    p.button('Continuar', () => resume(), 312, 200, 400, 86, { size: 38 });
    p.button('Recomeçar', () => startLevel(cur.level, cur.opp), 312, 300, 400, 76);
    p.button('Como jogar', () => showScreen('help'), 312, 390, 400, 76);
    p.button('Escolher outro céu', () => { quitToMenu('levels'); }, 312, 480, 400, 76);
    p.button(`Som: ${save.sound ? 'ligado' : 'desligado'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); p.redraw(); }, 312, 570, 400, 70, { size: 28 });
  } else if (screen === 'over') {
    const g = cur.game, w = g.winner, o = OPPONENTS[cur.opp];
    p.title(w === PLAYER ? 'Você ganhou o céu!' : `${o.name} ganhou o céu`, 90);
    p.text(`Você ${g.scores[0]} × ${g.scores[1]} ${o.name}`, W / 2, 170, { size: 44, bold: true, color: w === PLAYER ? PLAYER_CSS : o.css });
    p.text(`${g.triCount[0]} contra ${g.triCount[1]} triângulos`, W / 2, 225, { size: 26, color: UIC.dim });
    if (g.scores[0] === g.scores[1]) p.text('Empate em pontos: ganhou quem fechou o último triângulo.', W / 2, 265, { size: 24 });
    const next = cur.level + 1;
    if (w === PLAYER && next < LEVELS.length) p.button(`Próximo céu: ${LEVELS[next].name}`, () => { selLevel = next; startLevel(next, cur.opp); }, 212, 320, 600, 90, { size: 34 });
    else if (w === PLAYER) p.text('Você fechou todas as constelações. Tente contra o Mestre Órion!', W / 2, 360, { size: 26, color: UIC.edge });
    p.button('Jogar de novo', () => startLevel(cur.level, cur.opp), 212, 430, 600, 80);
    p.button('Escolher céu', () => quitToMenu('levels'), 212, 530, 600, 80);
  }
}
function placePanel() {
  const head = new THREE.Vector3();
  camera.getWorldPosition(head);
  const q = new THREE.Quaternion();
  camera.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize();
  const dist = renderer.xr.isPresenting ? 1.35 : 1.2;
  panel.mesh.position.copy(head).addScaledVector(fwd, dist);
  panel.mesh.position.y = head.y - (renderer.xr.isPresenting ? 0.1 : 0);
  panel.mesh.lookAt(head.x, panel.mesh.position.y, head.z);
  if (!renderer.xr.isPresenting) { view.tpitch = 0; view.pitch = 0; view.tyaw = view.yaw; }
}
function pause() {
  if (app !== 'play') return;
  app = 'paused';
  drag = null; hideHover();
  showScreen('pause');
}
function resume() { if (app !== 'paused') return; app = 'play'; panel.hide(); }
function quitToMenu(scr = 'main') {
  app = 'menu'; cur = null; drag = null; hideHover(); comet.visible = false; attention.pos = null;
  clearBoardView();
  showScreen(scr);
}
function panelClick(i) {
  const fn = panel.actionAt(i);
  if (fn) { sfx.click(); fn(); return true; }
  return false;
}

// ---------- Mouse e teclado (PC) ----------
const dom = renderer.domElement;
const mouse = { x: 0, y: 0, ndc: new THREE.Vector2(), down: null, inside: false };
const raycaster = new THREE.Raycaster();
function mouseRay() {
  raycaster.setFromCamera(mouse.ndc, camera);
  return raycaster.ray;
}
dom.addEventListener('pointermove', (ev) => {
  mouse.x = ev.clientX; mouse.y = ev.clientY; mouse.inside = true;
  mouse.ndc.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  if (mouse.down && mouse.down.mode === 'look') {
    const k = view.fov / 65 * 0.0045;
    view.tyaw += (ev.clientX - mouse.down.lx) * k;
    view.tpitch = clamp(view.tpitch + (ev.clientY - mouse.down.ly) * k, -1.4, 1.45);
    view.yaw = view.tyaw; view.pitch = view.tpitch;
    mouse.down.lx = ev.clientX; mouse.down.ly = ev.clientY;
    if (Math.hypot(ev.clientX - mouse.down.x, ev.clientY - mouse.down.y) > 6) mouse.down.dragged = true;
  }
});
dom.addEventListener('pointerdown', (ev) => {
  sfx.unlock();
  if (ev.button !== undefined && ev.button !== 0) return;
  mouse.x = ev.clientX; mouse.y = ev.clientY;
  mouse.ndc.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  try { dom.setPointerCapture?.(ev.pointerId); } catch { /* ok */ }
  updatePointerPC();
  if (panel.visible) {
    const hit = raycaster.intersectObject(panel.mesh)[0];
    if (hit) { panelClick(panel.pick(hit.uv)); return; }
  }
  if (!panel.visible && hover.star >= 0 && startDrag('mouse')) { mouse.down = { mode: 'drag', x: ev.clientX, y: ev.clientY }; return; }
  mouse.down = { mode: 'look', x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, dragged: false };
});
function pointerUp() {
  const d = mouse.down;
  mouse.down = null;
  if (!d) return;
  if (d.mode === 'drag') { updatePointerPC(); endDrag(); return; }
  if (!d.dragged && !panel.visible && hover.edge >= 0) tryPlayerMove(hover.edge);
}
dom.addEventListener('pointerup', pointerUp);
window.addEventListener('pointerup', () => { if (mouse.down) pointerUp(); });
dom.addEventListener('wheel', (ev) => { view.fov = clamp(view.fov + Math.sign(ev.deltaY) * 4, 35, 85); ev.preventDefault?.(); }, { passive: false });
const keys = {};
window.addEventListener('keydown', (ev) => {
  const k = (ev.key || '').toLowerCase();
  keys[k] = true;
  if (k === 'escape' || k === 'p') { if (app === 'play') pause(); else if (app === 'paused') resume(); }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); }
});
window.addEventListener('keyup', (ev) => { keys[(ev.key || '').toLowerCase()] = false; });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
function updatePointerPC() {
  camera.updateMatrixWorld();
  const ray = mouseRay();
  if (panel.visible) {
    const hit = raycaster.intersectObject(panel.mesh)[0];
    panel.setHover(hit ? panel.pick(hit.uv) : -1);
    hover.edge = hover.star = -1; hover.point = null;
    return;
  }
  if (mouse.down?.mode === 'look' && mouse.down.dragged) { hover.edge = hover.star = -1; hover.point = null; return; }
  pickAt(ray.origin, ray.direction);
}

// ---------- Controles do VR ----------
const ctrls = [];
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.7 }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0x6a4a10, roughness: 0.3, metalness: 0.5 }));
  grip.add(mark);
  const entry = { ctrl, grip, laser, mark, source: null, side: null, prev: [], snapReady: true };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data?.handedness; if (!activeCtrl || entry.side === 'right') activeCtrl = entry; });
  ctrl.addEventListener('disconnected', () => { entry.source = null; if (drag?.src === entry) { drag = null; hideHover(); } if (activeCtrl === entry) activeCtrl = ctrls.find(c => c.source) || null; });
  ctrl.addEventListener('selectstart', () => onSelectStart(entry));
  ctrl.addEventListener('selectend', () => onSelectEnd(entry));
}
let activeCtrl = null;
function pulse(side, v, ms) {
  try { ctrls.find(e => e.side === side && e.source)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
function ctrlRay(entry) {
  entry.ctrl.updateMatrixWorld(true);
  entry.ctrl.getWorldPosition(_o);
  _d.set(0, 0, -1).transformDirection(entry.ctrl.matrixWorld);
  return { o: _o.clone(), d: _d.clone() };
}
const panelRay = new THREE.Raycaster();
function panelHitFor(entry) {
  const { o, d } = ctrlRay(entry);
  panelRay.set(o, d);
  return panelRay.intersectObject(panel.mesh)[0] || null;
}
function onSelectStart(entry) {
  sfx.unlock();
  activeCtrl = entry;
  if (panel.visible) {
    const hit = panelHitFor(entry);
    if (hit) panelClick(panel.pick(hit.uv));
    return;
  }
  const { o, d } = ctrlRay(entry);
  pickAt(o, d);
  if (hover.star >= 0) { startDrag(entry); return; }
  if (hover.edge >= 0) tryPlayerMove(hover.edge);
}
function onSelectEnd(entry) {
  if (drag && drag.src === entry) {
    const { o, d } = ctrlRay(entry);
    pickAt(o, d);
    endDrag();
  }
}
function updateVR(dt) {
  for (const e of ctrls) {
    const on = !!e.source;
    e.laser.visible = on;
    e.mark.visible = on && !e.source?.hand;
    if (!on) continue;
    e.laser.material.opacity = e === activeCtrl ? 0.75 : 0.25;
    let len = R;
    if (panel.visible) { const h = panelHitFor(e); if (h) len = h.distance; }
    e.laser.scale.z = len;
    // botões: B/Y pausa; manche vira 30°
    const gp = e.source.gamepad;
    if (gp && !e.source.hand) {
      const pressed = (i) => !!gp.buttons?.[i]?.pressed;
      if (pressed(5) && !e.prev[5]) { if (app === 'play') pause(); else if (app === 'paused') resume(); }
      e.prev = (gp.buttons || []).map(b => b.pressed);
      const ax = gp.axes?.[2] ?? 0;
      if (Math.abs(ax) > 0.7 && e.snapReady) { rig.rotation.y -= Math.sign(ax) * Math.PI / 6; e.snapReady = false; }
      if (Math.abs(ax) < 0.3) e.snapReady = true;
    }
  }
  const act = activeCtrl?.source ? activeCtrl : ctrls.find(c => c.source);
  if (panel.visible) {
    const hit = act ? panelHitFor(act) : null;
    panel.setHover(hit ? panel.pick(hit.uv) : -1);
    hover.edge = hover.star = -1; hover.point = null;
  } else if (act) {
    const { o, d } = drag?.src && drag.src !== 'mouse' ? ctrlRay(drag.src) : ctrlRay(act);
    pickAt(o, d);
  }
}

// ---------- Seta e placar ----------
const _q = new THREE.Quaternion(), _cp = new THREE.Vector3();
function updateArrow(dt) {
  arrow.visible = false;
  if (!attention.pos || app !== 'play') return;
  camera.getWorldPosition(_cp);
  camera.getWorldQuaternion(_q);
  const v = attention.pos.clone().sub(_cp).applyQuaternion(_q.clone().invert());
  const ang = v.angleTo(new THREE.Vector3(0, 0, -1));
  const limit = renderer.xr.isPresenting ? 0.5 : Math.min(view.fov * Math.PI / 180 * 0.42, 0.6);
  if (ang < limit) {
    attention.seen += dt;
    if (attention.seen > 0.8 && cur?.phase !== 'comet') attention.pos = null;
    return;
  }
  let dx = v.x, dy = v.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-4) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
  const rx = renderer.xr.isPresenting ? 0.3 : 0.8 * camera.aspect * Math.tan(view.fov * Math.PI / 360);
  const ry = renderer.xr.isPresenting ? 0.22 : 0.78 * Math.tan(view.fov * Math.PI / 360);
  arrow.position.set(dx * rx, dy * ry, -1);
  arrow.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
  arrow.material.color.setHex(attention.color);
  arrow.material.opacity = 0.65 + 0.35 * Math.sin(time * 7);
  arrow.scale.setScalar(renderer.xr.isPresenting ? 1 : 1.3);
  arrow.visible = true;
}

const hud = document.getElementById('hud');
const hint = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
let hudKey = '';
function updateHud() {
  const vr = renderer.xr.isPresenting;
  let lines = [];
  if (cur && (app === 'play' || app === 'paused' || app === 'over')) {
    const g = cur.game, o = OPPONENTS[cur.opp];
    const turn = g.over ? 'Fim do céu' : g.turn === PLAYER ? (dev.autoplay ? 'Robô jogando por você' : 'Sua vez') : `Vez de ${o.name}`;
    lines = [
      { html: `<b style="color:${PLAYER_CSS}">Você ${g.scores[0]}</b> × <b style="color:${o.css}">${g.scores[1]} ${o.name}</b> · ${LEVELS[cur.level].name}`,
        text: `Você ${g.scores[0]}  ×  ${g.scores[1]} ${o.name}`, color: '#ffffff', size: 0.42 },
      { html: msg.t > 0 ? `<em>${msg.text}</em>` : turn, text: msg.t > 0 ? msg.text : `${turn} · faltam ${g.left} traços`, color: g.turn === PLAYER ? PLAYER_CSS : o.css, size: 0.32, bold: false },
    ];
  }
  statusLabel.mesh.visible = vr && lines.length > 0 && app === 'play';
  if (statusLabel.mesh.visible) statusLabel.set(lines.map(l => ({ text: l.text, color: l.color, size: l.size, bold: l.bold })));
  const key = vr ? 'vr' : lines.map(l => l.html).join('|') + (cur ? cur.game.left : '');
  if (key !== hudKey) {
    hudKey = key;
    hud.style.display = !vr && lines.length ? 'block' : 'none';
    hud.innerHTML = lines.length ? `${lines[0].html}<br>${lines[1].html}${cur ? ` <span class="dim">· faltam ${cur.game.left} traços</span>` : ''}` : '';
    hint.innerHTML = vr ? '' : app === 'play'
      ? '<span>Arraste para olhar · clique entre duas estrelas (ou arraste de uma estrela à vizinha) · roda: zoom · Esc: pausa</span>'
      : '<span>Clique nos botões · arraste para olhar o céu em volta</span>';
  }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();
renderer.xr.addEventListener('sessionstart', () => {
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  if (panel.visible) setTimeout(placePanel, 300);
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.copy(CENTER);
  drag = null;
  if (panel.visible) placePanel();
});

// ---------- Laço principal ----------
function tick(dt) {
  time += dt;
  if (msg.t > 0) msg.t -= dt;
  const vr = renderer.xr.isPresenting;
  if (!vr) {
    const kspd = 1.6 * dt;
    if (keys.arrowleft || keys.a) view.tyaw += kspd;
    if (keys.arrowright || keys.d) view.tyaw -= kspd;
    if (keys.arrowup || keys.w) view.tpitch = clamp(view.tpitch + kspd, -1.4, 1.45);
    if (keys.arrowdown || keys.s) view.tpitch = clamp(view.tpitch - kspd, -1.4, 1.45);
    view.yaw += (view.tyaw - view.yaw) * damp(6, dt);
    view.pitch += (view.tpitch - view.pitch) * damp(6, dt);
    camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
    if (Math.abs(camera.fov - view.fov) > 0.01) { camera.fov += (view.fov - camera.fov) * damp(10, dt); camera.updateProjectionMatrix(); }
  }
  camera.updateMatrixWorld(true);
  stepGame(dt);
  if (vr) updateVR(dt); else if (mouse.inside || mouse.down) updatePointerPC();
  updateHoverVisual();
  if (bv) {
    for (let i = 0; i < bv.pulses.length; i++) bv.pulses[i] = Math.max(0, bv.pulses[i] - dt * 2.2);
    bv.anims = bv.anims.filter(a => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k); return k < 1; });
  }
  updateArrow(dt);
  updateHud();
}

let lastT = performance.now(), fpsFrames = 0, fpsTime = 0;
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  tick(dt);
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !renderer.xr.isPresenting ? 'block' : 'none';
    fpsEl.textContent = `${fps} FPS`;
    fpsLabel.mesh.visible = save.fps && renderer.xr.isPresenting;
    if (fpsLabel.mesh.visible) fpsLabel.set(`${fps} FPS`);
  }
  renderer.render(scene, camera);
}

// ---------- Ferramentas de teste (console) ----------
const dev = {
  autoplay: false,
  advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) tick(1 / 60); return dev.state(); },
  state() {
    const g = cur?.game;
    return {
      app, screen, panel: panel.visible, level: cur ? cur.level + 1 : null, opp: cur ? cur.opp + 1 : null,
      phase: cur?.phase ?? null, turn: g ? (g.turn === PLAYER ? 'você' : 'adversário') : null,
      scores: g ? [...g.scores] : null, left: g?.left ?? null, over: g?.over ?? false,
      winner: g?.over ? (g.winner === PLAYER ? 'você' : 'adversário') : null,
      hoverEdge: hover.edge, hoverStar: hover.star, arrow: arrow.visible,
    };
  },
  loadLevel(n, opp = 1) { startLevel(clamp(n - 1, 0, LEVELS.length - 1), clamp(opp - 1, 0, 2)); return dev.state(); },
  play(e) { return tryPlayerMove(e); },
  edgeOf(a, b) { return edgeOf(cur.game.b, a, b); },
  menu() { quitToMenu('main'); return dev.state(); },
  resetSave() { save = resetSave(); storeSave(save); return save; },
};
window.dev = dev;
window.constelacao = {
  get game() { return cur?.game ?? null; }, get cur() { return cur; }, get app() { return app; }, get save() { return save; },
  get view() { return view; }, get bv() { return bv; }, panel, camera, scene, renderer, rig, ctrls, arrow, CENTER, R, mouse,
};

showScreen('main');
renderer.setAnimationLoop(frame);
