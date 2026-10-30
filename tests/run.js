// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem abrem navegador.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeBoard, validateBoard, assemble, edgeOf, elevation, dirAzEl, rng } from '../js/board.js';
import { LEVELS, boardOf } from '../js/levels.js';
import { Game, PLAYER, CPU, PRE } from '../js/game.js';
import { OPPONENTS, ROBOT, chooseMove, classify, giveaway, solveEnd, playOut } from '../js/ai.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}

console.log('Malhas das 10 constelações');
{
  ok(LEVELS.length === 10, '10 constelações');
  let prev = null;
  LEVELS.forEach((L, i) => {
    const b = boardOf(i);
    const bad = validateBoard(b);
    ok(bad.length === 0, `${i + 1}. ${L.name}: malha válida (${bad.slice(0, 3).join('; ')})`);
    const V = b.stars.length, E = b.edges.length, F = b.tris.length;
    ok(V - E + F <= 1 && V - E + F >= 1 - 3, `${i + 1}: Euler de um pedaço de esfera (V-E+F = ${V - E + F})`);
    ok(b.stars.filter(s => s.giant).length === L.giants, `${i + 1}: ${L.giants} estrela(s) gigante(s)`);
    ok(b.pre.length === Math.round(L.pre * E), `${i + 1}: traços prontos (${b.pre.length})`);
    const g = b.stars.map((s, k) => s.giant ? k : -1).filter(k => k >= 0);
    ok(g.every(x => g.every(y => x === y || edgeOf(b, x, y) < 0)), `${i + 1}: gigantes nunca são vizinhas`);
    if (prev) ok(V > prev.V && F > prev.F, `${i + 1}: céu maior que o anterior (${V} estrelas, ${F} triângulos)`);
    prev = { V, F };
    const again = makeBoard(L);
    ok(JSON.stringify(again.edges) === JSON.stringify(b.edges) && again.pre.join() === b.pre.join(), `${i + 1}: gerado sempre igual`);
    console.log(`  ${String(i + 1).padStart(2)}. ${L.name.padEnd(14)} ${String(V).padStart(2)} estrelas  ${String(E).padStart(3)} traços  ${String(F).padStart(2)} triângulos  ${b.pre.length} prontos  ${b.stars.filter(s => s.giant).length} gigantes  ${new Game(b).totalPoints()} pontos`);
  });
  const car = boardOf(7).stars, behind = car.filter(s => s.dir[2] > 0).length, front = car.filter(s => s.dir[2] < -0.5).length;
  ok(behind > car.length * 0.6 && front <= 3, `O Caracol fica atrás do jogador (${behind} de ${car.length} atrás, ${front} bem na frente)`);
  for (const i of [8, 9]) {
    const b = boardOf(i);
    const quad = new Set(b.stars.map(s => (Math.atan2(s.dir[0], -s.dir[2]) / (Math.PI / 2) + 4.5 | 0) % 4));
    ok(quad.size === 4 && b.stars.some(s => elevation(s.dir) > 60), `${LEVELS[i].name}: estrelas em volta (360°) e em cima da cabeça`);
  }
  ok(boardOf(9).stars.every(s => elevation(s.dir) > -40), 'nenhuma estrela embaixo do chão');
}

// Tabuleiro feito à mão: losango de 2 triângulos (0-1-2 e 1-3-2), estrela 3 gigante.
function diamond() {
  const st = [dirAzEl(-10, 10), dirAzEl(0, 18), dirAzEl(0, 2), dirAzEl(10, 10)].map((dir, i) => ({ dir, giant: i === 3 }));
  return assemble(st, [[0, 1, 2], [1, 3, 2]]);
}

console.log('Regras');
{
  const b = diamond();
  ok(b.edges.length === 5 && b.tris.length === 2, 'losango: 5 traços, 2 triângulos');
  ok(b.tris[0].value === 1 && b.tris[1].value === 2, 'triângulo com gigante vale 2');
  const e = (x, y) => edgeOf(b, x, y);
  const g = new Game(b, PLAYER);
  let r = g.play(e(0, 1));
  ok(!r.closed.length && g.turn === CPU, 'traço sem fechar: passa a vez');
  r = g.play(e(0, 2));
  ok(!r.closed.length && g.turn === PLAYER, 'segundo lado: ainda não fecha');
  let threw = false; try { g.play(e(0, 1)); } catch { threw = true; }
  ok(threw && !g.legal(e(0, 1)), 'traço repetido não vale');
  r = g.play(e(1, 3));
  ok(g.turn === CPU, 'vez do adversário');
  r = g.play(e(1, 2));
  ok(r.closed.length === 1 && r.points === 1 && g.turn === CPU && r.again, 'fecha um triângulo: 1 ponto e joga de novo');
  r = g.play(e(3, 2));
  ok(r.points === 2 && g.scores[CPU] === 3, 'triângulo da gigante vale 2');
  ok(g.over && g.left === 0 && !r.again, 'sem traço: acabou');
  ok(g.winner === CPU && g.triCount[CPU] === 2, 'quem tem mais pontos ganha');
  // um traço que fecha dois triângulos de uma vez
  const g5 = new Game(b, PLAYER);
  for (const [x, y] of [[0, 1], [0, 2], [1, 3], [3, 2]]) g5.play(e(x, y));
  r = g5.play(e(1, 2));
  ok(r.closed.length === 2 && r.points === 3 && g5.over, 'traço do meio fecha os dois de uma vez (1 + 2)');
  // empate em pontos: ganha quem fechou o último
  const st = [dirAzEl(-10, 10), dirAzEl(0, 18), dirAzEl(0, 2), dirAzEl(10, 10)].map(dir => ({ dir, giant: false }));
  const b2 = assemble(st, [[0, 1, 2], [1, 3, 2]]);
  const e2 = (x, y) => edgeOf(b2, x, y);
  const t = new Game(b2, PLAYER);
  t.play(e2(1, 2)); t.play(e2(0, 1)); t.play(e2(1, 3));            // você, ele, você
  ok(t.turn === CPU, 'ninguém fechou ainda');
  t.play(e2(0, 2));                                              // ele fecha 0-1-2 e joga de novo
  ok(t.scores[CPU] === 1 && t.turn === CPU, 'fechou e continua');
  t.play(e2(3, 2));                                              // ele fecha 1-3-2 também
  ok(t.over && t.scores[CPU] === 2 && t.winner === CPU, 'fechou os dois');
  const t2 = new Game(b2, PLAYER);
  t2.play(e2(0, 1)); t2.play(e2(1, 3)); t2.play(e2(0, 2)); t2.play(e2(1, 2));
  ok(t2.scores[CPU] === 1 && t2.turn === CPU, 'adversário fechou um');
  t2.play(e2(3, 2));
  ok(t2.over && t2.scores[CPU] === 2, 'fechou o segundo (2 x 0)');
  const t3 = new Game(b2, PLAYER);
  t3.play(e2(0, 1)); t3.play(e2(0, 2)); t3.play(e2(1, 2)); // você fecha 0-1-2 e joga de novo
  ok(t3.scores[PLAYER] === 1 && t3.turn === PLAYER, 'você fechou e continua');
  t3.play(e2(1, 3));   // passa
  t3.play(e2(3, 2));   // ele fecha o último
  ok(t3.over && t3.scores[0] === 1 && t3.scores[1] === 1 && t3.winner === CPU, 'empate 1 a 1: ganha quem fechou o último triângulo');
  // traços prontos
  const lv = boardOf(3);
  const g4 = new Game(lv, LEVELS[3].first);
  ok(g4.left === lv.edges.length - lv.pre.length && lv.pre.every(x => g4.edge[x] === PRE), 'traços prontos já contam como desenhados');
  ok(g4.turn === LEVELS[3].first && LEVELS.every((L, i) => L.first === i % 2), 'quem começa alterna de céu para céu');
}

console.log('Contagem em partidas aleatórias');
{
  const r = rng(42);
  let okAll = true, okTri = true, okWin = true;
  for (let i = 0; i < 10; i++) for (let k = 0; k < 3; k++) {
    const g = new Game(boardOf(i), k % 2);
    while (!g.over) { const m = g.moves(); g.play(m[Math.floor(r() * m.length)]); }
    if (g.scores[0] + g.scores[1] !== g.totalPoints()) okAll = false;
    if (g.triCount[0] + g.triCount[1] !== g.b.tris.length || [...g.tri].some(x => x < 0)) okTri = false;
    const w = g.winner;
    if (g.scores[0] !== g.scores[1] ? g.scores[w] < g.scores[1 - w] : w !== g.lastCloser) okWin = false;
  }
  ok(okAll, 'no fim, os pontos somam o valor do céu inteiro');
  ok(okTri, 'todo triângulo tem dono no fim');
  ok(okWin, 'vencedor certo (pontos; empate: último a fechar)');
}

console.log('IA');
{
  // fim exato confere com uma busca simples sem memória
  const brute = (g) => {
    if (g.over) return 0;
    let best = -Infinity;
    for (const e of g.moves()) {
      const c = cloneGame(g); const me = c.turn; const res = c.play(e);
      const v = res.points + (c.over ? 0 : c.turn === me ? brute(c) : -brute(c));
      best = Math.max(best, v);
    }
    return best;
  };
  const r = rng(7);
  let agree = 0;
  for (let k = 0; k < 6; k++) {
    const g = new Game(boardOf(1), 0);
    while (g.left > 9) { const m = g.moves(); g.play(m[Math.floor(r() * m.length)]); }
    const drawn = Uint8Array.from(g.edge, x => x !== -1 ? 1 : 0);
    const sc = solveEnd(g.b, drawn, Uint8Array.from(g.cnt));
    if (Math.max(...sc.map(s => s.v)) === brute(g)) agree++;
  }
  ok(agree === 6, `fim exato confere com a busca completa (${agree} de 6)`);
  // pega triângulo quando dá
  const b = diamond(), e = (x, y) => edgeOf(b, x, y);
  const g = new Game(b, PLAYER);
  g.play(e(0, 1)); g.play(e(0, 2));
  ok(classify(g).caps.includes(e(1, 2)), 'acha o traço que fecha');
  ok(chooseMove(g, OPPONENTS[1], rng(1)) === e(1, 2), 'Cometa fecha o triângulo');
  // não entrega se tem jogada segura
  const big = new Game(boardOf(5), 0);
  const c0 = classify(big);
  ok(c0.safe.length > 0 && c0.caps.length === 0, 'começo de jogo: só jogadas seguras');
  let safeOk = true;
  for (let k = 0; k < 15; k++) {
    const m = chooseMove(big, OPPONENTS[2], rng(k));
    if (!classify(big).safe.includes(m)) safeOk = false;
    big.play(m);
    if (!classify(big).safe.length) break;
  }
  ok(safeOk, 'mestre só faz jogada segura enquanto existe');
  // giveaway: entregar perto de um triângulo com 1 lado dá pelo menos 1
  const g2 = new Game(b, PLAYER); g2.play(e(0, 1));
  const dr = Uint8Array.from(g2.edge, x => x !== -1 ? 1 : 0);
  ok(giveaway(b, dr, Uint8Array.from(g2.cnt), e(0, 2)) >= 1, 'conta o que entrega');
  // todas as jogadas da IA são válidas e o mestre pensa rápido
  let legalOk = true, worst = 0;
  for (const i of [6, 9]) {
    const gg = new Game(boardOf(i), 0), rr = rng(i);
    while (!gg.over) {
      const t0 = performance.now();
      const m = chooseMove(gg, OPPONENTS[gg.turn === 0 ? 2 : 1], rr);
      worst = Math.max(worst, performance.now() - t0);
      if (!gg.legal(m)) { legalOk = false; break; }
      gg.play(m);
    }
  }
  ok(legalOk, 'IA sempre escolhe traço válido');
  ok(worst < 250, `mestre pensa rápido (pior jogada ${worst.toFixed(0)} ms)`);
  console.log(`  pior tempo de pensar do mestre: ${worst.toFixed(0)} ms`);
}

function cloneGame(g) {
  const c = Object.create(Object.getPrototypeOf(g));
  Object.assign(c, g, { edge: Int8Array.from(g.edge), tri: Int8Array.from(g.tri), cnt: Uint8Array.from(g.cnt), scores: [...g.scores], triCount: [...g.triCount], history: [] });
  return c;
}

console.log('Mestre contra os outros');
{
  const match = (a, bOpp, label, need) => {
    const r = rng(1234);
    let w = 0, n = 0;
    const res = [];
    for (let i = 0; i < 10; i++) for (const first of [0, 1]) {
      const g = playOut(new Game(boardOf(i), first), [OPPONENTS[a], OPPONENTS[bOpp]], r);
      n++; if (g.winner === 0) w++;
      res.push(g.scores.join('x'));
    }
    console.log(`  ${label}: ${w} de ${n} (${res.join(' ')})`);
    if (need) ok(w >= need, `${label}: ganha a maioria (${w} de ${n})`);
    return w;
  };
  match(2, 0, 'Mestre Órion x Lua', 16);
  match(2, 1, 'Mestre Órion x Cometa', 12);
  match(1, 0, 'Cometa x Lua', 12);
}

console.log('Robô completa as 10 constelações (contra a Lua, quem começa é o do céu)');
{
  for (let i = 0; i < 10; i++) {
    let won = false, tries = 0, last = null;
    while (!won && tries < 3) {
      const g = playOut(new Game(boardOf(i), LEVELS[i].first), [ROBOT, OPPONENTS[0]], rng(500 + i * 10 + tries));
      tries++; last = g; won = g.winner === PLAYER;
    }
    ok(won, `${i + 1}. ${LEVELS[i].name}: robô vence (${last.scores.join(' x ')})`);
    console.log(`  ${String(i + 1).padStart(2)}. ${LEVELS[i].name.padEnd(14)} ${last.scores.join(' x ')}${tries > 1 ? ` (tentativa ${tries})` : ''}`);
  }
}

console.log('Jogo no navegador simulado (tests/smoke/run.js)');
{
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./smoke/run.js', import.meta.url))], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  for (const line of out.trim().split('\n')) if (/FALHOU|Error|erro|^\s{2}\S/.test(line)) console.log('  ' + line.trim());
  ok(r.status === 0, `main.js no navegador simulado (saída ${r.status})`);
}

console.log(fails ? `\n${fails} de ${count} verificações falharam` : `\nTudo certo (${count} verificações)`);
process.exit(fails ? 1 : 0);
