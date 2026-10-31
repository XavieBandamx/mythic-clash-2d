import { CanvasFighter, OrigenFighter } from '../src/App';
import { Hero, Boss } from '../src/arcade/engine';
import { DEITIES } from '../src/game/deities';
import { ORIGEN } from '../src/arcade/levels';
import { sounds } from '../src/game/sound';
sounds.isMuted = true;
const gods = [...DEITIES, ORIGEN];
const select = document.querySelector<HTMLSelectElement>('#god')!;
const mode = document.querySelector<HTMLSelectElement>('#mode')!;
for (const d of gods) { const option = document.createElement('option'); option.value = d.id; option.textContent = d.name; select.append(option); }
const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
let actors: (CanvasFighter | Hero | Boss)[] = [];
function rebuild() {
  const deity = gods.find(d => d.id === select.value)!;
  actors = Array.from({ length: 8 }, (_, index) => {
    if (mode.value === 'versus') {
      const f = deity.id === 'origen' ? new OrigenFighter(deity, 0, 1) : new CanvasFighter(1, deity, false, 0, 1);
      if (index < 2) { f.state = 'JUMP'; f.isGrounded = false; f.y = f.groundY - (index ? 60 : 5); f.animTimer = index ? 8 : 1; f.vy = index ? -7 : -12; }
      if (index === 2) f.landingPoseTicks = 6;
      if (index === 3) { f.state = 'BLOCK'; f.guardStun = 8; }
      if (index === 4 || index === 5) { f.state = 'ATTACK_HEAVY'; f.animTimer = Math.ceil(f.heavyImpactTick) - (index === 4 ? 1 : 0); }
      if (index === 6) { f.hp = 0; f.state = 'DEFEAT'; for (let i = 0; i < 40; i++) f.advanceFinish(); }
      if (index === 7) { f.state = 'VICTORY'; f.animTimer = 30; }
      return f;
    }
    const a = mode.value === 'arcade' ? new Hero(deity, 0) : new Boss(deity, 0, 100, 500, 1, 0);
    a.x = 0; a.z = 100; a.facing = 1;
    if (index < 2) { a.setState(mode.value === 'boss' ? 'special' : 'jump'); a.stateTimer = index ? 8 : 1; a.y = index ? 60 : 5; a.vy = index ? 7 : 12; if (a instanceof Boss) { (a as any).currentSpecial = 'slam'; a.stateTimer += 20; } }
    if (index === 2) { a.setState(a instanceof Boss ? 'recover' : 'idle'); a.landTimer = 6; }
    if (index === 3) { a.setState(a instanceof Boss ? 'guard' : 'magic'); a.stateTimer = 40; }
    if (index === 4 || index === 5) {
      if (a instanceof Hero) { a.setState('attack'); a.comboStep = 3; a.stateTimer = index === 4 ? 6 : 7; }
      else { (a as any).comboHits = 1; a.setState(index === 4 ? 'windup' : 'strike'); a.stateTimer = 3; }
    }
    if (index === 6) { a.setState('dead'); a.hp = 0; }
    if (index === 7) { if (a instanceof Hero) { a.celebrate(); a.stateTimer = 30; } else { a.setState('special'); (a as any).currentSpecial = 'collapse'; a.stateTimer = 150; } }
    return a;
  });
}
select.onchange = mode.onchange = rebuild; rebuild();
function draw() {
  ctx.fillStyle = '#080d16'; ctx.fillRect(0, 0, 1280, 720);
  const ready = actors.every(actor => !actor.loading);
  document.querySelector('#ready')!.textContent = ready ? '8 poses cargadas' : 'Cargando';
  const labels = ['Despegue', 'Salto', 'Aterrizaje', 'Bloqueo / magia', 'Fuerte: preparación', 'Fuerte: impacto', 'Caída / K.O.', 'Victoria / poder'];
  actors.forEach((actor, index) => {
    const x = 10 + (index % 4) * 317, y = 10 + Math.floor(index / 4) * 350;
    ctx.fillStyle = '#152234'; ctx.fillRect(x, y, 307, 335);
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(labels[index], x + 153, y + 28);
    if (!ready) return;
    ctx.save(); ctx.translate(x + 153, y + 300); ctx.scale(.7, .7);
    ctx.translate(-actor.x, -(actor instanceof CanvasFighter ? actor.groundY : 600));
    if (actor instanceof CanvasFighter) actor.render(ctx, false); else actor.render(ctx);
    ctx.restore();
  });
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
