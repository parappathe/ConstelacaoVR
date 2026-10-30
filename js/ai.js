// Os adversários. Todos olham o mesmo tabuleiro; muda o quanto pensam.
// Lua: pega triângulo quando vê, mas entrega muito. Cometa: guloso, nunca entrega de graça, mas
// não planeja o fim. Mestre Órion: conta quem vai ficar sem jogada segura, entrega sempre a menor
// cadeia e, quando sobra pouco céu, calcula o fim exato (inclusive recusar os dois últimos
// triângulos de uma cadeia para continuar no controle).
import { rng } from './board.js';
export { rng };

export const OPPONENTS = [
  { name: 'Lua', title: 'a aprendiz', color: 0xc7a6ff, css: '#c7a6ff',
    about: 'Pega triângulo quando vê, mas entrega muito.', take: 0.9, safe: 0.8, cheap: 0.35 },
  { name: 'Cometa', title: 'o guloso', color: 0xffa25a, css: '#ffa25a',
    about: 'Pega tudo e não entrega de graça, mas não planeja o fim.', take: 1, safe: 1, cheap: 0.7 },
  { name: 'Mestre Órion', title: 'o mestre', color: 0xff6a8a, css: '#ff6a8a',
    about: 'Nunca dá triângulo de graça, conta as cadeias e calcula o fim.', take: 1, safe: 1, cheap: 1, parity: 14, exact: 16, deal: true },
];
export const ROBOT = OPPONENTS[2]; // o robô de testes joga como o mestre

// ---------- operações rápidas sobre o tabuleiro (drawn/cnt), com desfazer ----------
function apply(b, drawn, cnt, e) {
  drawn[e] = 1;
  let pts = 0;
  for (const t of b.edgeTris[e]) if (++cnt[t] === 3) pts += b.tris[t].value;
  return pts;
}
function undo(b, drawn, cnt, e) {
  drawn[e] = 0;
  for (const t of b.edgeTris[e]) cnt[t]--;
}
const isCapture = (b, cnt, e) => b.edgeTris[e].some(t => cnt[t] === 2);
const isSafe = (b, cnt, e) => b.edgeTris[e].every(t => cnt[t] === 0);

export function classify(game) {
  const b = game.b, cnt = game.cnt;
  const caps = [], safe = [], rest = [];
  for (let e = 0; e < game.edge.length; e++) {
    if (game.edge[e] !== -1) continue;
    if (isCapture(b, cnt, e)) caps.push(e);
    else if (isSafe(b, cnt, e)) safe.push(e);
    else rest.push(e);
  }
  return { caps, safe, rest };
}

// Corre a cadeia: enquanto algum triângulo tiver 2 lados, desenha o terceiro. Aplica e anota em done.
function runChain(b, drawn, cnt, seeds, done) {
  let total = 0;
  const q = seeds;
  while (q.length) {
    const t = q.pop();
    if (cnt[t] !== 2) continue;
    const e = b.tris[t].e.find(x => !drawn[x]);
    total += apply(b, drawn, cnt, e);
    done.push(e);
    for (const u of b.edgeTris[e]) q.push(u);
  }
  return total;
}
const undoAll = (b, drawn, cnt, done) => { for (let i = done.length - 1; i >= 0; i--) undo(b, drawn, cnt, done[i]); };
const twoSided = (b, cnt) => { const q = []; for (let t = 0; t < cnt.length; t++) if (cnt[t] === 2) q.push(t); return q; };

// Quanto o outro leva se eu desenhar e (ele pega tudo o que der em sequência).
export function giveaway(b, drawn, cnt, e) {
  const done = [e];
  apply(b, drawn, cnt, e);
  const total = runChain(b, drawn, cnt, [...b.edgeTris[e], ...twoSided(b, cnt)], done);
  undoAll(b, drawn, cnt, done);
  return total;
}
function cheapestEdge(b, drawn, cnt) {
  let best = -1, min = Infinity;
  for (let x = 0; x < drawn.length; x++) {
    if (drawn[x]) continue;
    const c = giveaway(b, drawn, cnt, x);
    if (c < min) { min = c; best = x; if (c === 0) break; }
  }
  return best;
}
// Joga até o fim com a política simples (pega tudo, depois entrega a menor cadeia).
// Devolve o saldo de quem joga agora.
function rollout(b, drawn, cnt) {
  const done = [];
  let net = 0, side = 1;
  for (;;) {
    const caps = twoSided(b, cnt);
    let e = caps.length ? b.tris[caps[0]].e.find(x => !drawn[x]) : cheapestEdge(b, drawn, cnt);
    if (e === undefined || e < 0) break;
    const pts = apply(b, drawn, cnt, e);
    done.push(e);
    if (pts) net += side * pts; else side = -side;
  }
  undoAll(b, drawn, cnt, done);
  return net;
}
// Fase de entregar cadeias: experimenta cada traço e simula o resto. Assim o mestre aprende a
// recusar o fim de uma cadeia quando vale a pena ficar no controle.
function bestByRollout(b, drawn, cnt, moves) {
  let best = -1, bestV = -Infinity;
  for (const e of moves) {
    const pts = apply(b, drawn, cnt, e);
    const v = pts > 0 ? pts + rollout(b, drawn, cnt) : -rollout(b, drawn, cnt);
    undo(b, drawn, cnt, e);
    if (v > bestV || (v === bestV && pts > 0)) { bestV = v; best = e; }
  }
  return best;
}

// Fim exato: melhor saldo (meus pontos - dele) daqui até o fim para quem joga agora.
// Memória por máscara dos traços que faltam; serve até uns 18 traços.
export function solveEnd(b, drawn, cnt) {
  const rem = [];
  for (let e = 0; e < drawn.length; e++) if (!drawn[e]) rem.push(e);
  const k = rem.length;
  const memo = new Int16Array(1 << k).fill(-32768);
  const full = (1 << k) - 1;
  function val(mask) {
    if (mask === full) return 0;
    const m = memo[mask];
    if (m !== -32768) return m;
    let best = -32767;
    for (let i = 0; i < k; i++) {
      if (mask & (1 << i)) continue;
      const e = rem[i];
      const g = apply(b, drawn, cnt, e);
      const v = g > 0 ? g + val(mask | (1 << i)) : -val(mask | (1 << i));
      undo(b, drawn, cnt, e);
      if (v > best) best = v;
    }
    memo[mask] = best;
    return best;
  }
  const scored = [];
  for (let i = 0; i < k; i++) {
    const e = rem[i];
    const g = apply(b, drawn, cnt, e);
    const v = g > 0 ? g + val(1 << i) : -val(1 << i);
    undo(b, drawn, cnt, e);
    scored.push({ e, v });
  }
  return scored;
}

// Jogo das jogadas seguras: quem ficar sem jogada segura tem de entregar triângulos.
// Devolve as jogadas seguras que deixam o outro sem saída primeiro (até ~14 jogadas seguras).
function parityWinners(b, drawn, cnt, safe) {
  const k = safe.length;
  const memo = new Int8Array(1 << k);
  function wins(mask) {
    if (memo[mask]) return memo[mask] === 1;
    let w = false;
    for (let i = 0; i < k && !w; i++) {
      if (mask & (1 << i) || !isSafe(b, cnt, safe[i])) continue;
      apply(b, drawn, cnt, safe[i]);
      w = !wins(mask | (1 << i));
      undo(b, drawn, cnt, safe[i]);
    }
    memo[mask] = w ? 1 : 2;
    return w;
  }
  const good = [];
  for (let i = 0; i < k; i++) {
    apply(b, drawn, cnt, safe[i]);
    if (!wins(1 << i)) good.push(safe[i]);
    undo(b, drawn, cnt, safe[i]);
  }
  return good;
}

const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

// Escolhe um traço para quem está na vez. opp: um dos OPPONENTS. r: gerador aleatório.
export function chooseMove(game, opp, r = Math.random) {
  const b = game.b;
  const { caps, safe, rest } = classify(game);
  const left = caps.length + safe.length + rest.length;
  const drawn = new Uint8Array(game.edge.length);
  for (let e = 0; e < drawn.length; e++) drawn[e] = game.edge[e] !== -1 ? 1 : 0;
  const cnt = Uint8Array.from(game.cnt);

  if (opp.exact && left <= opp.exact) {
    const sc = solveEnd(b, drawn, cnt);
    const best = Math.max(...sc.map(s => s.v));
    // entre as melhores, prefere pegar triângulo agora (fica mais natural de ver)
    const top = sc.filter(s => s.v === best);
    const cap = top.filter(s => caps.includes(s.e));
    return (cap.length ? cap : top)[0].e;
  }
  if (opp.deal && !safe.length) return bestByRollout(b, drawn, cnt, [...caps, ...rest]);
  if (caps.length && r() < opp.take) {
    // pega primeiro os que valem mais
    caps.sort((x, y) => capValue(b, game.cnt, y) - capValue(b, game.cnt, x));
    return caps[0];
  }
  if (safe.length && r() < opp.safe) {
    if (opp.parity && safe.length <= opp.parity) {
      const good = parityWinners(b, drawn, cnt, safe);
      if (good.length) return pick(good, r);
    }
    // evita "esquentar" triângulo de estrela gigante à toa
    const cool = safe.filter(e => b.edgeTris[e].every(t => b.tris[t].value === 1));
    return pick(opp.cheap && cool.length ? cool : safe, r);
  }
  const pool = rest.length ? rest : (safe.length ? safe : caps);
  if (opp.cheap && pool === rest) {
    const costs = rest.map(e => ({ e, c: giveaway(b, drawn, cnt, e) }));
    const min = Math.min(...costs.map(x => x.c));
    if (r() < opp.cheap) return pick(costs.filter(x => x.c === min).map(x => x.e), r);
    costs.sort((x, y) => x.c - y.c);
    return pick(costs.slice(0, Math.max(2, Math.ceil(costs.length / 3))).map(x => x.e), r);
  }
  return pick(pool, r);
}

function capValue(b, cnt, e) {
  let v = 0;
  for (const t of b.edgeTris[e]) if (cnt[t] === 2) v += b.tris[t].value;
  return v;
}

// Joga uma partida inteira sem tela. players: [opp do jogador 0, opp do jogador 1].
export function playOut(game, players, r) {
  while (!game.over) game.play(chooseMove(game, players[game.turn], r));
  return game;
}
