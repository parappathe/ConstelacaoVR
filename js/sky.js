// Cenário: céu de fundo (degradê, via láctea e milhares de estrelinhas que não são do jogo),
// o mirante redondo onde o jogador fica e as texturas de brilho das estrelas.
import * as THREE from '../vendor/three/three.module.js';
import { rng } from './board.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

export function glowTexture(core = '#ffffff', halo = 'rgba(150,180,255,0.5)', spikes = false) {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, core); gr.addColorStop(0.12, core); gr.addColorStop(0.3, halo); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  if (spikes) {
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[128, 5], [5, 128]]) {
      const lg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      lg.addColorStop(0, core); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(64 - w / 2, 64 - h / 2, w, h);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ringTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

function skyTexture() {
  const [c, g] = canvas(2048, 1024);
  const gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, '#04030c'); gr.addColorStop(0.42, '#0b0a24'); gr.addColorStop(0.5, '#1d1638');
  gr.addColorStop(0.53, '#120e26'); gr.addColorStop(1, '#020208');
  g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
  // via láctea: faixa inclinada de nuvens
  const r = rng(77);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 900; i++) {
    const x = r() * 2048;
    const y = 300 + Math.sin(x / 2048 * Math.PI * 2) * 220 + (r() - 0.5) * 160;
    const rad = 20 + r() * 70;
    const cg = g.createRadialGradient(x, y, 0, x, y, rad);
    const hue = r() < 0.5 ? '120,110,200' : '200,120,170';
    cg.addColorStop(0, `rgba(${hue},${0.025 + r() * 0.03})`); cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 3500; i++) {
    const x = r() * 2048, y = r() * 1024, a = r() * r() * 0.8;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(x, y, 1.2, 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function compassTexture() {
  const [c, g] = canvas(1024, 1024);
  const gr = g.createRadialGradient(512, 512, 0, 512, 512, 512);
  gr.addColorStop(0, '#2a2440'); gr.addColorStop(0.8, '#17132a'); gr.addColorStop(1, '#0d0b18');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(255,217,138,0.55)'; g.lineWidth = 4;
  for (const rad of [470, 430, 250]) { g.beginPath(); g.arc(512, 512, rad, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = 'rgba(255,217,138,0.35)';
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, L = k % 2 ? 260 : 420;
    g.beginPath();
    g.moveTo(512 + Math.sin(a) * L, 512 - Math.cos(a) * L);
    g.lineTo(512 + Math.sin(a + 0.18) * 70, 512 - Math.cos(a + 0.18) * 70);
    g.lineTo(512, 512);
    g.lineTo(512 + Math.sin(a - 0.18) * 70, 512 - Math.cos(a - 0.18) * 70);
    g.closePath(); g.fill();
  }
  g.lineWidth = 2;
  for (let k = 0; k < 72; k++) {
    const a = k * Math.PI / 36, r1 = 430, r2 = k % 2 ? 446 : 462;
    g.beginPath(); g.moveTo(512 + Math.sin(a) * r1, 512 - Math.cos(a) * r1); g.lineTo(512 + Math.sin(a) * r2, 512 - Math.cos(a) * r2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03030a);
  const bg = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false }));
  bg.rotation.y = 0.6;
  scene.add(bg);
  // estrelinhas de fundo (pontos fixos na tela, não fazem parte do jogo)
  const r = rng(9);
  const N = 2400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([Math.cos(a) * s * 70, z * 70, Math.sin(a) * s * 70], i * 3);
    const b = 0.25 + r() * r() * 0.6, warm = r();
    col.set([b * (0.8 + warm * 0.3), b * 0.9, b * (1.1 - warm * 0.3)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));

  // mirante: disco com rosa dos ventos e aro de latão
  const deck = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CircleGeometry(1.1, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: compassTexture(), roughness: 0.8, metalness: 0.1 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.035, 10, 80).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.35, metalness: 0.9 }));
  const side = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 0.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1528, roughness: 0.9, side: THREE.DoubleSide }));
  side.position.y = -0.25;
  deck.add(top, rim, side);
  // corrimão baixo, com uma abertura para não parecer gaiola
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.02, 8, 80, Math.PI * 1.7).rotateX(Math.PI / 2), rim.material);
  rail.position.y = 0.95; rail.rotation.y = Math.PI * 0.5 + Math.PI * 0.15;
  deck.add(rail);
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * 0.65 + k / 8 * Math.PI * 1.7;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 6), rim.material);
    post.position.set(Math.cos(a) * 1.05, 0.475, Math.sin(a) * 1.05);
    deck.add(post);
  }
  scene.add(deck);
  scene.add(new THREE.HemisphereLight(0x8a80ff, 0x100c20, 1.2));
  const key = new THREE.PointLight(0xffd9a0, 6, 6, 1.5);
  key.position.set(0, 2.6, 0);
  scene.add(key);
  return { scene, deck, bg };
}
