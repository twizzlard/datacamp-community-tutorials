// Celebrations: particle bursts on one full-screen canvas, floating cheers, sticker pops,
// and a big moment when a kid finishes the day. All of it is skipped under reduced motion.

const canvas = document.getElementById('fx');
const ctx = canvas.getContext('2d');
const layer = document.getElementById('fx-layer');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const PALETTE = ['#f4b000', '#ff6b8a', '#4fb3e8', '#7c5cd6', '#2fae6b', '#ff8a3d'];
const GOLD = '#f4b000';
let parts = [];
let running = false;
let last = 0;
let dpr = 1;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

// ---------- drawing ----------

function star(x, y, r, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 ? r * inner : r;
    const a = (Math.PI * i) / points - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function heart(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.25, x - s * 0.45, y - s, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.25, x, y + s * 0.35);
  ctx.closePath();
}

const DRAW = {
  rect(p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.flip));
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  },
  star(p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    star(0, 0, p.size);
    ctx.fill();
  },
  heart(p) {
    ctx.fillStyle = p.color;
    heart(p.x + Math.sin(p.age / 9 + p.phase) * 6, p.y, p.size);
    ctx.fill();
  },
  bubble(p) {
    const x = p.x + Math.sin(p.age / 8 + p.phase) * 4;
    const r = p.size * (p.age > p.life - 8 ? 1 + (p.age - p.life + 8) / 10 : 1);
    ctx.strokeStyle = '#7cc6f0';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.arc(x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, p.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  },
  spark(p) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
    ctx.stroke();
  },
  twinkle(p) {
    const k = Math.max(0, Math.sin((p.age / p.life) * Math.PI));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    star(0, 0, p.size * k, 4, 0.28);
    ctx.fill();
  },
  paw(p) {
    if (p.age < 0) return;
    const s = p.size;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.3, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
    for (const [tx, ty] of [[-0.62, -0.25], [-0.22, -0.62], [0.22, -0.62], [0.62, -0.25]]) {
      ctx.moveTo(tx * s + s * 0.22, ty * s);
      ctx.arc(tx * s, ty * s, s * 0.22, 0, Math.PI * 2);
    }
    ctx.fill();
  },
  rocket(p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(244,176,0,.5)';
    for (let i = 1; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(p.x - p.vx * i * 1.5 + rand(-1, 1), p.y - p.vy * i * 1.5, 2.2 - i * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

function frame(t) {
  const dt = last ? Math.min((t - last) / 16.67, 3) : 1;
  last = t;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const spawned = [];
  parts = parts.filter((p) => {
    p.age += dt;
    p.vy += p.g * dt;
    p.vx *= p.drag ?? 1;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot = (p.rot || 0) + (p.vr || 0) * dt;
    p.flip = (p.flip || 0) + 0.15 * dt;
    if (p.age >= p.life) {
      if (p.onEnd) spawned.push(...p.onEnd(p));
      return false;
    }
    const fade = Math.min(1, (p.life - p.age) / 18);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = fade;
    DRAW[p.type](p);
    return true;
  });
  ctx.globalAlpha = 1;
  parts.push(...spawned);
  if (parts.length) requestAnimationFrame(frame);
  else {
    running = false;
    last = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function add(list) {
  parts.push(...list);
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
}

// ---------- bursts ----------

const EMITTERS = {
  confetti: (x, y, color) => Array.from({ length: 28 }, () => ({
    type: 'rect', x, y, vx: rand(-4.5, 4.5), vy: rand(-9, -4), g: 0.3, drag: 0.985,
    w: rand(5, 9), h: rand(3, 5), rot: rand(0, 6), vr: rand(-0.3, 0.3), flip: rand(0, 6),
    color: pick([color, ...PALETTE]), age: 0, life: rand(60, 90),
  })),
  stars: (x, y, color) => Array.from({ length: 12 }, (_, i) => {
    const a = -Math.PI / 2 + ((i / 11) - 0.5) * 2.4;
    const v = rand(3.5, 7);
    return {
      type: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.16, drag: 0.98,
      size: rand(5, 10), rot: rand(0, 6), vr: rand(-0.2, 0.2), color: pick([GOLD, GOLD, '#ffd84d', color]), age: 0, life: rand(50, 70),
    };
  }),
  hearts: (x, y, color) => Array.from({ length: 10 }, () => ({
    type: 'heart', x: x + rand(-14, 14), y, vx: rand(-0.8, 0.8), vy: rand(-3.4, -1.6), g: 0.01,
    size: rand(7, 13), phase: rand(0, 6), color: pick([color, '#ff6b8a', '#ff8fa3']), age: 0, life: rand(70, 95),
  })),
  bubbles: (x, y) => Array.from({ length: 14 }, () => ({
    type: 'bubble', x: x + rand(-18, 18), y: y + rand(-6, 6), vx: rand(-0.6, 0.6), vy: rand(-2.6, -0.9), g: -0.005,
    size: rand(4, 11), phase: rand(0, 6), age: 0, life: rand(60, 100),
  })),
  fireworks: (x, y, color) => [{
    type: 'rocket', x, y, vx: rand(-0.6, 0.6), vy: -6.5, g: 0.12, color: GOLD, age: 0, life: 26,
    onEnd: (p) => Array.from({ length: 34 }, (_, i) => {
      const a = (i / 34) * Math.PI * 2;
      const v = rand(2, 4.6);
      return {
        type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.06, drag: 0.97,
        color: pick([color, GOLD, '#ff6b8a', '#4fb3e8']), age: 0, life: rand(36, 52),
      };
    }),
  }],
  paws: (x, y, color) => Array.from({ length: 9 }, (_, i) => ({
    type: 'paw', x: x + (i % 2 ? 12 : -12) + rand(-6, 6), y: y - i * 4, vx: rand(-0.3, 0.3), vy: -1.6, g: 0,
    size: rand(8, 11), rot: (i % 2 ? 0.25 : -0.25), color, age: -i * 5, life: 75,
  })),
  sparkles: (x, y, color) => Array.from({ length: 12 }, () => {
    const a = rand(0, Math.PI * 2);
    const r = rand(16, 54);
    return {
      type: 'twinkle', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: 0, vy: -0.25, g: 0,
      size: rand(6, 12), rot: rand(0, 1), color: pick([GOLD, '#fff6c2', color]), age: -rand(0, 14), life: rand(34, 50),
    };
  }),
};

// The random pool for chore check-offs. Paws are saved for the dog.
export const BURSTS = Object.keys(EMITTERS).filter((k) => k !== 'paws');

export function burst(kind, x, y, color = GOLD) {
  if (reduced.matches) return;
  add(EMITTERS[kind](x, y, color));
}

// Confetti falling across the whole screen.
export function rain(colors = PALETTE, count = 140) {
  if (reduced.matches) return;
  add(Array.from({ length: count }, () => ({
    type: Math.random() < 0.18 ? 'star' : 'rect', x: rand(0, innerWidth), y: rand(-innerHeight * 0.6, -10),
    vx: rand(-1, 1), vy: rand(2, 4.5), g: 0.04, drag: 0.995, w: rand(6, 10), h: rand(3, 6), size: rand(5, 9),
    rot: rand(0, 6), vr: rand(-0.15, 0.15), flip: rand(0, 6), color: pick(colors), age: 0, life: rand(150, 210),
  })));
}

// ---------- DOM pops ----------

function pop(className, x, y, html, ms) {
  if (reduced.matches) return;
  const el = document.createElement('div');
  el.className = className;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = html;
  layer.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function cheer(x, y, text, color) {
  pop('cheer', x, y, `<span style="color:${color}">${text}</span>`, 1200);
}

export function stickerPop(x, y, svg) {
  pop('sticker-pop', x, y, svg, 1500);
}

// A card in the middle of the screen with the kid's sticker, plus confetti. Tap anywhere to close it.
export function bigMoment({ art, title, subtitle, colors }) {
  const el = document.createElement('div');
  el.className = 'moment';
  el.innerHTML = `<div class="moment-card"><div class="moment-art">${art}</div>
    <p class="moment-title">${title}</p>${subtitle ? `<p class="moment-sub">${subtitle}</p>` : ''}</div>`;
  layer.appendChild(el);
  rain(colors);
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
    document.removeEventListener('pointerdown', close, true);
  };
  document.addEventListener('pointerdown', close, true);
  setTimeout(close, reduced.matches ? 2200 : 3400);
}
