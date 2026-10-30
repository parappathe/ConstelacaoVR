// Regras do jogo. Na vez, desenha-se um traço entre duas estrelas vizinhas. Quem desenha o
// terceiro lado de um triângulo ganha o triângulo (vale 1, mais 1 por estrela gigante nos cantos)
// e joga de novo. Quando não sobra traço, ganha quem tem mais pontos; empate em pontos fica para
// quem fechou o último triângulo do céu.
export const PLAYER = 0, CPU = 1, PRE = 2;

export class Game {
  constructor(board, first = PLAYER) {
    this.b = board;
    this.edge = new Int8Array(board.edges.length).fill(-1);  // dono do traço (-1 vazio, 2 já vinha pronto)
    this.tri = new Int8Array(board.tris.length).fill(-1);    // dono do triângulo
    this.cnt = new Uint8Array(board.tris.length);            // lados desenhados de cada triângulo
    this.turn = first;
    this.first = first;
    this.scores = [0, 0];
    this.triCount = [0, 0];
    this.lastCloser = -1;
    this.left = board.edges.length;
    this.history = [];
    for (const e of board.pre) {
      this.edge[e] = PRE; this.left--;
      for (const t of board.edgeTris[e]) this.cnt[t]++;
    }
  }

  get over() { return this.left === 0; }
  legal(e) { return e >= 0 && e < this.edge.length && this.edge[e] === -1 && !this.over; }
  moves() { const m = []; for (let e = 0; e < this.edge.length; e++) if (this.edge[e] === -1) m.push(e); return m; }

  // Desenha o traço e. Devolve { by, closed: [triângulos], points, again }.
  play(e) {
    if (!this.legal(e)) throw new Error(`traço inválido: ${e}`);
    const by = this.turn;
    this.edge[e] = by;
    this.left--;
    const closed = [];
    let points = 0;
    for (const t of this.b.edgeTris[e]) {
      if (++this.cnt[t] === 3) {
        this.tri[t] = by;
        closed.push(t);
        points += this.b.tris[t].value;
      }
    }
    if (closed.length) {
      this.scores[by] += points;
      this.triCount[by] += closed.length;
      this.lastCloser = by;
    } else this.turn = 1 - by;
    const res = { e, by, closed, points, again: closed.length > 0 && !this.over };
    this.history.push(res);
    return res;
  }

  // -1 enquanto não acabou
  get winner() {
    if (!this.over) return -1;
    if (this.scores[0] !== this.scores[1]) return this.scores[0] > this.scores[1] ? 0 : 1;
    return this.lastCloser;
  }

  totalPoints() { return this.b.tris.reduce((s, t) => s + t.value, 0); }
}
