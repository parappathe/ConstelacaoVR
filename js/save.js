// Progresso e opções, salvos no navegador.
const KEY = 'constelacaovr.v1';
const N = 10;
const fresh = () => ({
  beaten: Array.from({ length: N }, () => [false, false, false]), // céu x adversário vencido
  best: Array(N).fill(null),   // melhor placar em cada céu: [você, ele]
  played: 0,
  sound: true,
  fps: false,
  assist: true,         // cor no traço apontado (verde fecha, amarelo entrega)
});

export function loadSave() {
  const d = fresh();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(s.beaten) && s.beaten.length === N) d.beaten = s.beaten.map(x => Array.isArray(x) && x.length === 3 ? x.map(Boolean) : [false, false, false]);
    if (Array.isArray(s.best) && s.best.length === N) d.best = s.best;
    if (Number.isFinite(s.played)) d.played = s.played;
    if (typeof s.sound === 'boolean') d.sound = s.sound;
    if (typeof s.fps === 'boolean') d.fps = s.fps;
    if (typeof s.assist === 'boolean') d.assist = s.assist;
  } catch { /* save estragado: começa do zero */ }
  return d;
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}

export const unlocked = (s, i) => i === 0 || s.beaten[i - 1].some(Boolean);
export const resetSave = () => fresh();
