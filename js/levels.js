// As 10 constelações: céus cada vez maiores, do pedacinho na sua frente até o céu inteiro em volta.
// az/el = centro da calota (graus; az 0 = frente, 180 = atrás), R = raio da calota (graus).
// first = quem começa (0 você, 1 o adversário): alterna, para não ficar sempre com a mesma vantagem.
import { makeBoard } from './board.js';

export const LEVELS = [
  { name: 'A Pipa', n: 8, az: 0, el: 14, R: 26, giants: 0, pre: 0, seed: 10101, first: 0, wobble: 0.1,
    desc: 'Um céu pequeno para aprender: feche triângulos e jogue de novo.' },
  { name: 'O Peixe', n: 11, az: 0, el: 16, R: 34, giants: 0, pre: 0, seed: 20706, first: 1,
    desc: 'Cuidado com o segundo lado: quem desenha ele entrega o triângulo.' },
  { name: 'A Viola', n: 14, az: 0, el: 20, R: 42, giants: 1, pre: 0, seed: 31114, first: 0,
    desc: 'Primeira estrela gigante: cada triângulo com ela vale 2.' },
  { name: 'O Tatu', n: 17, az: 0, el: 24, R: 50, giants: 1, pre: 0.1, seed: 41908, first: 1,
    desc: 'Os traços prateados já vêm desenhados no céu.' },
  { name: 'A Rede', n: 21, az: 0, el: 30, R: 60, giants: 2, pre: 0, seed: 52320, first: 0,
    desc: 'Duas gigantes. Conte as cadeias antes de entregar uma.' },
  { name: 'O Barco', n: 25, az: 0, el: 40, R: 72, giants: 2, pre: 0.12, seed: 63125, first: 1,
    desc: 'O céu começa a passar por cima da sua cabeça.' },
  { name: 'A Coroa', n: 29, az: 0, el: 58, R: 84, giants: 3, pre: 0, seed: 74302, first: 0,
    desc: 'Olhe para cima: a coroa vai de um lado ao outro.' },
  { name: 'O Caracol', n: 33, az: 180, el: 40, R: 92, giants: 3, pre: 0.12, seed: 85301, first: 1,
    desc: 'Este céu fica atrás de você. Vire-se!' },
  { name: 'A Fogueira', n: 38, az: 0, el: 90, R: 100, giants: 4, pre: 0.08, seed: 96727, first: 0, wobble: 0.1,
    desc: 'Estrelas em volta de você inteiro, do horizonte para cima.' },
  { name: 'O Céu Inteiro', n: 44, az: 0, el: 90, R: 116, giants: 5, pre: 0.15, seed: 109303, first: 1, wobble: 0.08,
    desc: 'A grande final: o céu fecha em volta de você.' },
];

const cache = [];
export function boardOf(i) { return cache[i] ||= makeBoard(LEVELS[i]); }
