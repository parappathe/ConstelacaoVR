// Teste de fumaça do js/main.js no Node: navegador de mentira (DOM, canvas 2D, localStorage),
// Three.js de verdade com renderizador que não desenha. Usa o menu com o mouse, joga com mouse
// (clique e arrasto), confere a seta do adversário, pausa, simula controle e mão do Quest e deixa o
// robô completar as 10 constelações. Rodado pelo tests/run.js; sozinho: node tests/smoke/run.js
import { register } from 'node:module';
register('./hooks.js', import.meta.url);

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }

// ---------- navegador de mentira ----------
function listeners() {
  const map = {};
  return {
    addEventListener(t, fn) { (map[t] ||= []).push(fn); },
    removeEventListener(t, fn) { map[t] = (map[t] || []).filter(f => f !== fn); },
    fire(t, ev = {}) { for (const fn of map[t] || []) fn({ preventDefault() {}, ...ev }); },
  };
}
const ctx2d = new Proxy({}, {
  get(_, k) {
    if (k === 'measureText') return (t) => ({ width: String(t).length * 14 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set() { return true; },
});
function element(tag) {
  return {
    tagName: tag, style: {}, textContent: '', innerHTML: '', disabled: false, width: 300, height: 150,
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild() {}, setPointerCapture() {}, getContext: () => ctx2d,
    ...listeners(),
  };
}
const elements = {};
globalThis.document = { getElementById: (id) => (elements[id] ||= element('div')), createElement: (t) => element(t) };
const win = listeners();
globalThis.window = Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: true }, win);
globalThis.addEventListener = win.addEventListener;
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-smoke' }, configurable: true });
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };

const THREE = await import('../../vendor/three/three.module.js?real');
await import('../../js/main.js');
const { LEVELS } = await import('../../js/levels.js');
const K = window.constelacao, dev = window.dev, R = globalThis.__renderer;
const dom = R.domElement;
const frames = (n) => { for (let i = 0; i < n; i++) R.loop(); };

function screenOf(v) {
  K.camera.updateMatrixWorld();
  const p = v.clone().project(K.camera);
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, front: p.z < 1 };
}
const mouseTo = (pt) => dom.fire('pointermove', { clientX: pt.x, clientY: pt.y });
function clickAt(pt) {
  mouseTo(pt);
  dom.fire('pointerdown', { button: 0, clientX: pt.x, clientY: pt.y, pointerId: 1 });
  dom.fire('pointerup', { button: 0, clientX: pt.x, clientY: pt.y });
}
function buttonPoint(label) {
  const b = K.panel.buttons.find(x => x.label === label);
  if (!b) return null;
  const u = (b.x + b.w / 2) / 1024, v = 1 - (b.y + b.h / 2) / 720;
  K.panel.mesh.updateMatrixWorld();
  return K.panel.mesh.localToWorld(new THREE.Vector3((u - 0.5) * 1.0, (v - 0.5) * 720 / 1024, 0));
}
function clickButton(label) {
  const p = buttonPoint(label);
  if (!p) return false;
  clickAt(screenOf(p));
  return true;
}
const mid = (e) => { const [a, b] = K.bv.board.edges[e]; return K.bv.dirs[a].clone().add(K.bv.dirs[b]).normalize().multiplyScalar(K.R).add(K.CENTER); };
const starPos = (i) => K.bv.pos[i].clone();
function waitPlayer(max = 30) { for (let i = 0; i < max * 10 && K.cur.phase !== 'player' && K.app === 'play'; i++) dev.advance(0.1); return K.cur.phase === 'player'; }
function faceTo(p) { const d = p.clone().sub(K.CENTER).normalize(); K.view.yaw = K.view.tyaw = Math.atan2(-d.x, -d.z); K.view.pitch = K.view.tpitch = Math.asin(d.y); dev.advance(0.05); }

console.log('Menu (mouse)');
frames(3);
ok(K.app === 'menu' && K.panel.visible, 'abre no menu');
ok(clickButton('Jogar') && dev.state().screen === 'levels', 'clicar em "Jogar" abre a escolha do céu');
ok(K.bv && K.bv.sprites.length === K.bv.board.stars.length, 'mostra a prévia do céu escolhido');
ok(clickButton('tile2') === true && K.bv.board.edges.length > 0, 'céu 2 trancado não muda nada (clique ignorado)');
ok(clickButton('Começar') && K.app === 'play' && K.cur.level === 0 && K.cur.opp === 0, 'Começar abre o céu 1 contra a Lua');

console.log('Jogar com o mouse');
{
  ok(waitPlayer(), 'chega a sua vez');
  const g = K.game;
  const e = g.moves()[0];
  faceTo(mid(e));
  mouseTo(screenOf(mid(e)));
  frames(2);
  ok(dev.state().hoverEdge === e, `apontar entre duas estrelas acende o traço (${dev.state().hoverEdge} / ${e})`);
  clickAt(screenOf(mid(e)));
  ok(g.edge[e] === 0, 'clique desenha o traço');
  ok(waitPlayer(), 'adversário joga e volta para você');
  // arrastar de uma estrela até a vizinha
  const e2 = g.moves()[0];
  const [a, b] = g.b.edges[e2];
  faceTo(mid(e2));
  const pa = screenOf(starPos(a)), pb = screenOf(starPos(b));
  mouseTo(pa); frames(1);
  ok(dev.state().hoverStar === a, 'apontar na estrela acende a estrela');
  dom.fire('pointerdown', { button: 0, clientX: pa.x, clientY: pa.y, pointerId: 1 });
  mouseTo({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }); frames(1);
  mouseTo(pb); frames(1);
  dom.fire('pointerup', { button: 0, clientX: pb.x, clientY: pb.y });
  ok(g.edge[e2] === 0, 'arrastar de uma estrela à vizinha desenha o traço');
  // arrastar no vazio gira a vista e não joga
  waitPlayer();
  const yaw0 = K.view.tyaw, left0 = g.left;
  dom.fire('pointerdown', { button: 0, clientX: 10, clientY: 700, pointerId: 1 });
  for (let i = 1; i <= 10; i++) dom.fire('pointermove', { clientX: 10 + i * 20, clientY: 700 });
  dom.fire('pointerup', { button: 0, clientX: 210, clientY: 700 });
  ok(Math.abs(K.view.tyaw - yaw0) > 0.3 && g.left === left0, 'arrastar o mouse gira a vista sem jogar');
  // seta: olhando para trás, o adversário joga e a seta aparece
  K.view.yaw = K.view.tyaw = Math.PI; K.view.pitch = K.view.tpitch = -0.3;
  ok(waitPlayer(), 'sua vez');
  const free = g.moves().find(x => g.b.edgeTris[x].every(t => g.cnt[t] === 0)) ?? g.moves()[0];
  dev.play(free);
  let seen = false;
  for (let i = 0; i < 40 && K.cur.phase !== 'player' && K.app === 'play'; i++) { dev.advance(0.05); if (dev.state().arrow) seen = true; }
  ok(seen, 'olhando para longe, a seta mostra onde o adversário jogou');
  // pausa
  win.fire('keydown', { key: 'Escape' });
  ok(K.app === 'paused' && K.panel.visible && dev.state().screen === 'pause', 'Esc pausa');
  ok(clickButton('Continuar') && K.app === 'play' && !K.panel.visible, 'Continuar volta ao jogo');
}

console.log('Quest: controle e mão');
{
  dev.loadLevel(3, 2);
  const xr = R.xr;
  xr.isPresenting = true;
  xr.dispatchEvent({ type: 'sessionstart' });
  K.camera.position.set(0, 1.5, 0);
  const pressed = [];
  const gp = { buttons: Array.from({ length: 6 }, (_, i) => ({ get pressed() { return !!pressed[i]; } })), axes: [0, 0, 0, 0], hapticActuators: [] };
  const [c0, c1] = xr.controllers;
  c0.dispatchEvent({ type: 'connected', data: { handedness: 'right', gamepad: gp } });
  const aim = (ctrl, p) => { ctrl.position.set(0.15, 1.3, -0.2); ctrl.lookAt(ctrl.position.clone().multiplyScalar(2).sub(p)); ctrl.updateMatrixWorld(true); };
  ok(waitPlayer(), 'sua vez no VR');
  const g = K.game;
  const e = g.moves()[2];
  aim(c0, mid(e)); dev.advance(0.05);
  ok(dev.state().hoverEdge === e, 'raio do controle acende o traço');
  c0.dispatchEvent({ type: 'selectstart' }); c0.dispatchEvent({ type: 'selectend' });
  ok(g.edge[e] === 0, 'gatilho desenha o traço');
  ok(waitPlayer(), 'volta a sua vez');
  // mão rastreada: pinça na estrela, aponta a vizinha, solta
  c1.dispatchEvent({ type: 'connected', data: { handedness: 'left', hand: {} } });
  const e2 = g.moves()[0];
  const [a, b] = g.b.edges[e2];
  aim(c1, starPos(a));
  c1.dispatchEvent({ type: 'selectstart' });
  aim(c1, starPos(b)); dev.advance(0.05);
  c1.dispatchEvent({ type: 'selectend' });
  ok(g.edge[e2] === 0, 'pinça de uma estrela até a vizinha desenha o traço');
  // B pausa; apontar e gatilho no "Continuar"
  pressed[5] = true; dev.advance(0.05); pressed[5] = false; dev.advance(0.05);
  ok(K.app === 'paused' && K.panel.visible, 'B pausa no VR');
  aim(c0, buttonPoint('Continuar')); dev.advance(0.05);
  c0.dispatchEvent({ type: 'selectstart' }); c0.dispatchEvent({ type: 'selectend' });
  ok(K.app === 'play', 'apontar e gatilho no menu funciona');
  // manche vira 30°
  const ry = K.rig.rotation.y;
  gp.axes[2] = 1; dev.advance(0.05); gp.axes[2] = 0; dev.advance(0.05);
  ok(Math.abs(Math.abs(K.rig.rotation.y - ry) - Math.PI / 6) < 1e-6, 'manche vira 30°');
  xr.isPresenting = false;
  xr.dispatchEvent({ type: 'sessionend' });
}

console.log('Robô completa as 10 constelações (autoplay, contra a Lua)');
{
  dev.resetSave();
  dev.autoplay = true;
  for (let n = 1; n <= LEVELS.length; n++) {
    let won = false, tries = 0, st = null;
    while (!won && tries < 3) {
      tries++;
      dev.loadLevel(n, 1);
      for (let s = 0; s < 1200 && K.app === 'play'; s++) dev.advance(0.5);
      st = dev.state();
      won = st.app === 'over' && st.winner === 'você';
    }
    ok(won && st.panel, `céu ${n}: robô vence e aparece o painel (${st.scores?.join(' x ')})`);
    ok(K.save.beaten[n - 1][0], `céu ${n}: vitória salva`);
  }
  dev.autoplay = false;
  const saved = JSON.parse(store['constelacaovr.v1']);
  ok(saved.beaten.every(x => x[0]), 'progresso no localStorage');
  ok(clickButton('Escolher céu') && dev.state().screen === 'levels' && K.app === 'menu', 'do fim volta para a escolha do céu');
  frames(3);
  ok(R.renders > 10, 'desenhou quadros');
}

console.log(fails ? `${fails} de ${count} verificações falharam` : `fumaça ok (${count} verificações)`);
process.exit(fails ? 1 : 0);
