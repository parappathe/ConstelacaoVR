// Gera o tabuleiro de cada constelação: estrelas espalhadas numa calota da esfera em volta do
// jogador, ligadas numa malha de triângulos (Delaunay na projeção estereográfica, que na esfera
// dá a triangulação certa). Sem Three.js: vetores são [x, y, z] com y para cima e -z para a frente.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
export const dirAzEl = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG)];
export const elevation = (d) => Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG;

function basis(c) {
  const ref = Math.abs(c[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0];
  const u = norm(cross(ref, c));
  const v = cross(c, u);
  return { u, v };
}

// Triangulação de Delaunay 2D (Bowyer-Watson). Devolve trios de índices.
function delaunay(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const dm = Math.max(maxX - minX, maxY - minY) * 30, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = [...pts, [mx - dm, my - dm], [mx + dm, my - dm], [mx, my + dm]];
  const n = pts.length;
  const circ = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { v: [a, b, c], x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = P[i];
    const bad = [], keep = [];
    for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edgeCount = new Map();
    for (const t of bad) for (let k = 0; k < 3; k++) {
      const a = t.v[k], b = t.v[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const e = edgeCount.get(key);
      if (e) e.n++; else edgeCount.set(key, { a, b, n: 1 });
    }
    for (const e of edgeCount.values()) if (e.n === 1) keep.push(circ(e.a, e.b, i));
    tris = keep;
  }
  return tris.filter(t => t.v.every(v => v < n)).map(t => t.v);
}

// Ângulo mínimo (graus) do triângulo de cordas entre três direções.
function minAngle(a, b, c) {
  const ang = (p, q, r) => { const u = norm(sub(q, p)), w = norm(sub(r, p)); return angle(u, w) / DEG; };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

// Monta a estrutura de jogo a partir das estrelas e triângulos.
export function assemble(stars, triVerts) {
  const edges = [], edgeIndex = new Map(), edgeTris = [];
  const tris = triVerts.map((v) => {
    const e = [];
    for (let k = 0; k < 3; k++) {
      const a = Math.min(v[k], v[(k + 1) % 3]), b = Math.max(v[k], v[(k + 1) % 3]);
      const key = a * 4096 + b;
      let idx = edgeIndex.get(key);
      if (idx === undefined) { idx = edges.length; edgeIndex.set(key, idx); edges.push([a, b]); edgeTris.push([]); }
      e.push(idx);
    }
    return { v: [...v], e };
  });
  tris.forEach((t, i) => t.e.forEach(e => edgeTris[e].push(i)));
  for (const t of tris) t.value = 1 + t.v.filter(v => stars[v].giant).length;
  const starEdges = stars.map(() => []);
  edges.forEach(([a, b], i) => { starEdges[a].push(i); starEdges[b].push(i); });
  return { stars, edges, tris, edgeTris, starEdges, edgeIndex, pre: [] };
}

export const edgeOf = (b, s1, s2) => b.edgeIndex.get(Math.min(s1, s2) * 4096 + Math.max(s1, s2)) ?? -1;

// def: { n, az, el, R (graus), giants, pre (fração de traços já desenhados), seed, wobble }
export function makeBoard(def) {
  const r = rng(def.seed);
  const c = dirAzEl(def.az, def.el);
  const { u, v } = basis(c);
  const Rr = def.R * DEG;
  const area = 2 * Math.PI * (1 - Math.cos(Rr));
  let d = Math.sqrt(2 * area / (Math.sqrt(3) * def.n)) * 0.97;
  // contorno irregular: o raio da calota varia com o ângulo em volta do centro
  const wob = def.wobble ?? 0.16;
  const h1 = r() * 6.28, h2 = r() * 6.28, k1 = 2 + Math.floor(r() * 2), k2 = 4 + Math.floor(r() * 2);
  const radiusAt = (phi) => Math.min(Rr * (1 + wob * (0.65 * Math.sin(k1 * phi + h1) + 0.35 * Math.sin(k2 * phi + h2))), 130 * DEG);
  const pointAt = (th, phi) => norm([
    c[0] * Math.cos(th) + (u[0] * Math.cos(phi) + v[0] * Math.sin(phi)) * Math.sin(th),
    c[1] * Math.cos(th) + (u[1] * Math.cos(phi) + v[1] * Math.sin(phi)) * Math.sin(th),
    c[2] * Math.cos(th) + (u[2] * Math.cos(phi) + v[2] * Math.sin(phi)) * Math.sin(th),
  ]);
  const okDir = (p) => elevation(p) >= (def.minEl ?? -18);
  let pts = [];
  const far = (p, sep) => pts.every(q => angle(p, q) >= sep);
  // contorno primeiro (deixa a borda arrumada), depois o miolo por "dardos" com distância mínima
  const ringN = Math.max(5, Math.round(2 * Math.PI * Math.sin(Math.min(Rr, Math.PI / 2)) / d * 0.95));
  for (let i = 0; i < ringN; i++) {
    const phi = (i + r() * 0.3) / ringN * 2 * Math.PI;
    const p = pointAt(radiusAt(phi) * 0.96, phi);
    if (okDir(p) && far(p, d * 0.8)) pts.push(p);
  }
  let tries = 0;
  while (pts.length < def.n && tries < 30000) {
    tries++;
    if (tries % 3000 === 0) d *= 0.96;
    const phi = r() * 2 * Math.PI;
    const th = Math.acos(1 - r() * (1 - Math.cos(radiusAt(phi))));
    if (th > radiusAt(phi) * 0.93) continue;
    const p = pointAt(th, phi);
    if (okDir(p) && far(p, d * 0.86)) pts.push(p);
  }
  // projeção estereográfica a partir do ponto oposto ao centro da calota
  const flat = pts.map(p => { const k = 1 + dot(p, c); return [dot(p, u) / k, dot(p, v) / k]; });
  let tv = delaunay(flat);
  // limpa a borda: tira triângulo comprido demais e triângulo fino na beirada
  const len = (a, b) => angle(pts[a], pts[b]);
  let changed = true;
  while (changed) {
    changed = false;
    const cnt = new Map();
    const key = (a, b) => a < b ? a * 4096 + b : b * 4096 + a;
    for (const t of tv) for (let k = 0; k < 3; k++) { const kk = key(t[k], t[(k + 1) % 3]); cnt.set(kk, (cnt.get(kk) || 0) + 1); }
    const next = tv.filter(t => {
      const longest = Math.max(len(t[0], t[1]), len(t[1], t[2]), len(t[2], t[0]));
      if (longest > 2.0 * d) return false;
      const border = [0, 1, 2].some(k => cnt.get(key(t[k], t[(k + 1) % 3])) === 1);
      if (border && minAngle(pts[t[0]], pts[t[1]], pts[t[2]]) < 19) return false;
      return true;
    });
    if (next.length !== tv.length) { tv = next; changed = true; }
  }
  // fica só o maior pedaço ligado por lados
  const adj = tv.map(() => []);
  {
    const owner = new Map();
    tv.forEach((t, i) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; const kk = a < b ? a * 4096 + b : b * 4096 + a; if (owner.has(kk)) { adj[i].push(owner.get(kk)); adj[owner.get(kk)].push(i); } else owner.set(kk, i); } });
  }
  const comp = new Int32Array(tv.length).fill(-1);
  let best = -1, bestSize = 0;
  for (let i = 0; i < tv.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i]; comp[i] = i; let size = 0;
    while (stack.length) { const x = stack.pop(); size++; for (const y of adj[x]) if (comp[y] < 0) { comp[y] = i; stack.push(y); } }
    if (size > bestSize) { bestSize = size; best = i; }
  }
  tv = tv.filter((_, i) => comp[i] === best);
  // reindexa as estrelas usadas
  const map = new Map();
  const stars = [];
  for (const t of tv) for (const s of t) if (!map.has(s)) { map.set(s, stars.length); stars.push({ dir: pts[s], giant: false }); }
  tv = tv.map(t => t.map(s => map.get(s)));
  // estrelas gigantes: miolo (grau alto), nunca vizinhas uma da outra
  const pre = assemble(stars, tv);
  const deg = stars.map((_, i) => pre.starEdges[i].length);
  const nb = stars.map(() => new Set());
  pre.edges.forEach(([a, b]) => { nb[a].add(b); nb[b].add(a); });
  const cand = stars.map((_, i) => i).filter(i => deg[i] >= 4);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const giants = [];
  for (const i of cand) {
    if (giants.length >= (def.giants || 0)) break;
    if (giants.some(g => nb[g].has(i))) continue; // nunca vizinhas
    giants.push(i);
  }
  for (const g of giants) stars[g].giant = true;
  const board = assemble(stars, tv);
  board.d = d;
  board.center = c;
  // traços antigos já desenhados (a figura da constelação): caminho contínuo, no máximo um por triângulo
  const want = Math.round((def.pre || 0) * board.edges.length);
  if (want > 0) {
    const triPre = new Uint8Array(board.tris.length);
    const used = new Uint8Array(board.edges.length);
    const allowed = (e) => !used[e] && board.edgeTris[e].every(t => !triPre[t]);
    let at = Math.floor(r() * stars.length), guard = 0;
    const visited = [at];
    while (board.pre.length < want && guard++ < 2000) {
      const opts = board.starEdges[at].filter(allowed);
      if (!opts.length) { at = visited[Math.floor(r() * visited.length)]; continue; }
      const e = opts[Math.floor(r() * opts.length)];
      used[e] = 1; board.pre.push(e);
      for (const t of board.edgeTris[e]) triPre[t] = 1;
      const [a, b] = board.edges[e];
      at = a === at ? b : a;
      visited.push(at);
    }
  }
  return board;
}

// Confere se a malha serve para jogar. Devolve a lista de problemas (vazia = tudo certo).
export function validateBoard(b) {
  const bad = [];
  if (b.stars.length < 4) bad.push('poucas estrelas');
  if (b.tris.length < 3) bad.push('poucos triângulos');
  b.edgeTris.forEach((ts, e) => { if (ts.length < 1 || ts.length > 2) bad.push(`traço ${e} em ${ts.length} triângulos`); });
  b.tris.forEach((t, i) => {
    if (new Set(t.v).size !== 3 || new Set(t.e).size !== 3) bad.push(`triângulo ${i} degenerado`);
    for (const e of t.e) { const [x, y] = b.edges[e]; if (!t.v.includes(x) || !t.v.includes(y)) bad.push(`triângulo ${i} com lado errado`); }
  });
  const seen = new Set();
  b.edges.forEach(([x, y]) => { const k = `${x},${y}`; if (seen.has(k) || x === y) bad.push('traço repetido'); seen.add(k); });
  b.stars.forEach((s, i) => { if (!b.starEdges[i].length) bad.push(`estrela ${i} solta`); if (elevation(s.dir) < -40) bad.push(`estrela ${i} baixa demais`); });
  for (let i = 0; i < b.stars.length; i++) for (let j = i + 1; j < b.stars.length; j++) {
    if (angle(b.stars[i].dir, b.stars[j].dir) < b.d * 0.6) bad.push(`estrelas ${i} e ${j} grudadas`);
  }
  for (const [x, y] of b.edges) if (angle(b.stars[x].dir, b.stars[y].dir) > b.d * 2.05) bad.push('traço comprido demais');
  // tudo ligado por lados de triângulo
  const seenT = new Uint8Array(b.tris.length), st = [0]; seenT[0] = 1; let n = 0;
  while (st.length) { const t = st.pop(); n++; for (const e of b.tris[t].e) for (const u of b.edgeTris[e]) if (!seenT[u]) { seenT[u] = 1; st.push(u); } }
  if (n !== b.tris.length) bad.push('céu partido em pedaços');
  const triPre = new Uint8Array(b.tris.length);
  for (const e of b.pre) for (const t of b.edgeTris[e]) if (++triPre[t] > 1) bad.push('triângulo com dois traços prontos');
  if (b.stars.filter(s => s.giant).length > 8) bad.push('gigantes demais');
  return bad;
}
