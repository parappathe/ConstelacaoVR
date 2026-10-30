// Sons sintetizados na hora (sem arquivos): fundo de céu (acorde grave que respira), traço de luz,
// triângulo fechado (sino, mais brilhante nas gigantes), jogada do adversário, vitória e derrota.
// Só liga depois de um clique ou da entrada no VR.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // pentatônica

export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.8 : 0;
      this.master.connect(this.ctx.destination);
      // eco leve para soar "espacial"
      this.delay = this.ctx.createDelay(1);
      this.delay.delayTime.value = 0.32;
      const fb = this.ctx.createGain(); fb.gain.value = 0.32;
      const wet = this.ctx.createGain(); wet.gain.value = 0.35;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.master);
      this.pad();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  pad() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.035;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    f.connect(g); g.connect(this.master);
    for (const [hz, det] of [[55, 0], [82.4, 4], [110, -5], [164.8, 3]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det;
      const og = c.createGain(); og.gain.value = 0.25;
      o.connect(og); og.connect(f); o.start();
    }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 300;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  }

  tone(freq, { type = 'sine', dur = 0.4, vol = 0.2, at = 0, attack = 0.005, echo = true, slide = 0 } = {}) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    if (echo) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }

  note(step, base = 440) { return base * Math.pow(2, SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length] / 12 + Math.floor(step / SCALE.length)); }

  hover() { this.tone(1800, { dur: 0.04, vol: 0.03, echo: false }); }
  click() { this.tone(900, { dur: 0.08, vol: 0.08, echo: false }); }
  grab() { this.tone(660, { dur: 0.12, vol: 0.06, type: 'triangle', echo: false }); }
  deny() { this.tone(180, { dur: 0.18, vol: 0.12, type: 'square', echo: false, slide: 0.7 }); }
  // traço de luz: sobe de tom; mine = do jogador
  line(mine) {
    const b = mine ? 520 : 330;
    this.tone(b, { dur: 0.35, vol: 0.09, type: 'triangle', slide: 1.5 });
  }
  // triângulo fechado: arpejo; value 1..3; combo = quantos seguidos nesta vez
  capture(value, mine, combo = 0) {
    const base = mine ? 523 : 392;
    const n = 2 + value;
    for (let i = 0; i < n; i++) this.tone(this.note(i + combo, base), { dur: 0.6, vol: 0.12 / Math.sqrt(n) * (value > 1 ? 1.3 : 1), at: i * 0.07, type: value > 1 ? 'triangle' : 'sine' });
  }
  win() { [0, 2, 4, 5, 7, 9].forEach((s, i) => this.tone(this.note(s, 392), { dur: 1.2, vol: 0.12, at: i * 0.13, type: 'triangle' })); }
  lose() { [4, 2, 1, 0].forEach((s, i) => this.tone(this.note(s, 220), { dur: 0.9, vol: 0.1, at: i * 0.2, type: 'sine' })); }
}
