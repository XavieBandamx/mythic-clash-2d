// Paso fijo de simulación: toda la lógica de juego avanza a 60 Hz sin importar los Hz del monitor
export const SIM_STEP_MS = 1000 / 60;

export type Difficulty = 'FACIL' | 'NORMAL' | 'DIFICIL';

// --- SISTEMA DE PARTÍCULAS VISUALES DE ALTO IMPACTO ---
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  type: 'spark' | 'smoke' | 'block' | 'lightning' | 'solar' | 'text' | 'dust' | 'wind' | 'ring' | 'blood';
  text?: string;
  size?: number;
  gravity?: number; // Gravedad propia (sangre)
  floorY?: number;  // Altura del suelo donde se detiene (sangre)
  landed?: boolean;
}

// Salpicadura de sangre: 15-25 gotas disparadas desde el punto de impacto en la dirección del golpe
export function spawnBloodBurst(particles: Particle[], x: number, y: number, dirX: 1 | -1, floorY: number) {
  const count = 15 + Math.floor(Math.random() * 11);
  for (let i = 0; i < count; i++) {
    // Ángulo entre -30° (hacia abajo) y 75° (hacia arriba) respecto a la horizontal del golpe
    const angle = (-30 + Math.random() * 105) * (Math.PI / 180);
    const speed = 3 + Math.random() * 8;
    particles.push({
      x,
      y,
      vx: dirX * Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
      vy: -Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 2.5,
      color: '#dc2626',
      alpha: 1,
      decay: 0.008 + Math.random() * 0.006,
      type: 'blood',
      gravity: 0.3 + Math.random() * 0.25,
      floorY
    });
  }
}

// Cajas de colisión AABB
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function checkAABB(b1: Box, b2: Box): boolean {
  return (
    b1.x < b2.x + b2.w &&
    b1.x + b1.w > b2.x &&
    b1.y < b2.y + b2.h &&
    b1.y + b1.h > b2.y
  );
}

// Avanza un paso de simulación de todas las partículas y elimina las que ya se desvanecieron
export function updateParticles(list: Particle[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;

    if (p.type === 'ring') {
      p.radius += 3.5;
    } else if (p.type === 'wind') {
      p.radius += 1.2;
    } else if (p.type === 'spark' || p.type === 'dust') {
      p.vy += 0.2;
    } else if (p.type === 'blood' && !p.landed) {
      p.vy += p.gravity ?? 0.4;
      if (p.floorY !== undefined && p.y >= p.floorY) {
        // Al tocar el suelo la gota se aplasta, resbala un poco y se seca más rápido
        p.y = p.floorY;
        p.vy = 0;
        p.vx *= 0.25;
        p.landed = true;
        p.decay = 0.02;
      }
    } else if (p.type === 'blood') {
      p.vx *= 0.8;
    }

    if (p.alpha <= 0) {
      list.splice(i, 1);
    }
  }
}

// Dibuja las partículas (chispas, anillos, viento, rayos, sangre y textos flotantes)
export function renderParticles(ctx: CanvasRenderingContext2D, list: Particle[]) {
  list.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);

    if (p.type === 'text' && p.text) {
      ctx.font = 'bold 22px "Cinzel", sans-serif';
      ctx.fillStyle = p.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText(p.text, p.x, p.y);
    } else if (p.type === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.type === 'wind') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.radius, p.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'lightning') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.radius;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (Math.random() - 0.5) * 20, p.y + p.vy * 3);
      ctx.stroke();
    } else if (p.type === 'block') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const angle = (a * Math.PI) / 3;
        const hx = p.x + Math.cos(angle) * (p.radius * 2);
        const hy = p.y + Math.sin(angle) * (p.radius * 2);
        if (a === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (p.type === 'blood') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.landed) {
        ctx.ellipse(p.x, p.y, p.radius * 1.8, p.radius * 0.5, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}
