import React, { useEffect, useRef } from 'react';
import { ArrowUpRight, Swords, Flame, Users, Mountain, SlidersHorizontal, Gamepad2, Wifi } from 'lucide-react';
import type { GameMode, GameState } from './App';
import { DEITIES } from './game/deities';
import { ARENAS } from './game/arenas';
import { GRID_4X4_ANIMATIONS, spriteAssetSrc, getSpriteSheetConfig, loadSpriteSheet } from './game/sprites';
import { MONSTER_SPRITES } from './arcade/levels';
import type { SpriteSheetConfig } from './game/sprites';
import { getControls, keyLabel } from './game/controls';

export interface MainMenuItem { label: string; mode?: GameMode; screen?: GameState }

const MODES = {
  PVP: { title: 'Versus local', tag: '2 JUGADORES', icon: Swords, description: 'Frente a frente. Dos rondas ganadas deciden quién se queda con la arena.', pair: ['zeus', 'ra'] },
  PVE: { title: 'Duelo contra IA', tag: '1 JUGADOR', icon: Swords, description: 'Elige a tu dios y mide tu técnica contra un rival de otro reino.', pair: ['amaterasu', 'anubis'] },
  ARCADE: { title: 'Camino de los Dioses', tag: 'ARCADE', icon: Flame, description: 'Cruza cuatro reinos, domina sus bestias y alcanza el encuentro con Origen.', pair: ['quetzalcoatl', 'raijin'] },
  ARCADE_COOP: { title: 'Arcade cooperativo', tag: '2 JUGADORES', icon: Users, description: 'Dos dioses, un mismo camino. Conquista los cuatro reinos en compañía.', pair: ['poseidon', 'huitzilopochtli'] },
  SURVIVAL: { title: 'Supervivencia', tag: 'SIN LÍMITES', icon: Flame, description: 'Resiste oleadas cada vez más difíciles. Sin continuaciones: supera tu récord.', pair: ['minotauro', 'guardian-chacal'] },
  SURVIVAL_COOP: { title: 'Supervivencia cooperativa', tag: '2 JUGADORES', icon: Users, description: 'Resistan juntos. Jefes cada cinco oleadas y récords por pareja.', pair: ['escorpion', 'oni-gigante', 'guerrero-aguila'] },
  TOWER: { title: 'Torre de los Dioses', tag: 'DESAFÍO', icon: Mountain, description: 'Ocho rivales y un creador. Asciende hasta la cima y descubre tu final.', pair: ['hades', 'susanoo', 'mictlantecuhtli'] }
} as const;

// Composición de portada: cada pareja necesita espacio según sus armas y siluetas.
const TITLE_POSES: Record<GameMode, readonly { x: number; y: number; height: number }[]> = {
  PVP: [{ x: 245, y: 620, height: 415 }, { x: 590, y: 610, height: 405 }],
  PVE: [{ x: 205, y: 615, height: 355 }, { x: 595, y: 610, height: 420 }],
  ARCADE: [{ x: 270, y: 627, height: 430 }, { x: 565, y: 581, height: 375 }],
  ARCADE_COOP: [{ x: 220, y: 615, height: 365 }, { x: 590, y: 610, height: 425 }],
  SURVIVAL: [{ x: 230, y: 620, height: 390 }, { x: 600, y: 615, height: 365 }],
  SURVIVAL_COOP: [{ x: 175, y: 625, height: 300 }, { x: 415, y: 605, height: 405 }, { x: 665, y: 625, height: 305 }],
  TOWER: [{ x: 175, y: 625, height: 315 }, { x: 415, y: 600, height: 415 }, { x: 665, y: 625, height: 315 }]
};

function TitleFighters({ mode }: { mode: GameMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sheets = MODES[mode].pair.map(id => {
      const monster = MONSTER_SPRITES[id];
      const cfg: SpriteSheetConfig = monster
        ? { src: spriteAssetSrc(id), frameWidth: monster.frameWidth, frameHeight: monster.frameHeight, scale: 1, footOffset: 0, pixelArt: monster.pixelArt ?? false, animations: GRID_4X4_ANIMATIONS }
        : getSpriteSheetConfig(DEITIES.find(deity => deity.id === id)!);
      return { cfg, entry: loadSpriteSheet(cfg.src) };
    });
    let handle = 0, lastDraw = -Infinity;
    const draw = (now: number) => {
      handle = requestAnimationFrame(draw);
      if (now - lastDraw < 32) return;
      lastDraw = now;
      ctx.clearRect(0, 0, 820, 670);
      // En supervivencia cooperativa el Águila queda delante del Oni.
      const drawOrder = mode === 'SURVIVAL_COOP' ? [1, 0, 2] : sheets.map((_, index) => index).reverse();
      for (const index of drawOrder) {
        const { cfg, entry } = sheets[index];
        if (entry.status !== 'ready') continue;
        const { x, y, height } = TITLE_POSES[mode][index];
        const scale = height / cfg.frameHeight;
        const frame = reducedMotion ? 0 : Math.floor(now / (cfg.animations.idle.frameDuration * 1000 / 60)) % cfg.animations.idle.frames;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.ellipse(0, 0, index ? 75 : 95, 16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.scale(index ? -1 : 1, 1);
        ctx.imageSmoothingEnabled = !cfg.pixelArt;
        ctx.drawImage(entry.image, frame * cfg.frameWidth, cfg.animations.idle.row * cfg.frameHeight, cfg.frameWidth, cfg.frameHeight,
          -cfg.frameWidth * scale / 2, -height + cfg.footOffset * scale, cfg.frameWidth * scale, height);
        ctx.restore();
      }
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [mode]);
  return <canvas ref={ref} width={820} height={670} aria-hidden="true" />;
}

interface Props {
  items: MainMenuItem[];
  selected: number;
  difficulty: string;
  touch: boolean;
  highlight: (index: number) => void;
  choose: (item: MainMenuItem) => void;
}

export default function MainMenu({ items, selected, difficulty, touch, highlight, choose }: Props) {
  const active = items[selected];
  const mode = active?.screen === 'LAN_MENU' ? 'ARCADE_COOP' : active?.mode ?? 'PVE';
  const details = active?.screen === 'LAN_MENU' ? { ...MODES.ARCADE_COOP, title: 'Sala Wi-Fi', tag: '2 DISPOSITIVOS', description: 'Crea una sala privada y juega con otro celular en la misma red, sin internet.' } : MODES[mode];
  const settings = active?.screen === 'LAN_MENU' ? undefined : active?.screen;
  const controls = getControls().keyboard[0];
  const navigate = `${keyLabel(controls.up)} / ${keyLabel(controls.down)}`;
  const confirm = keyLabel(controls.light);

  return <section className="title-screen" aria-label="Menú principal">
    <img className="title-backdrop" src={ARENAS[0].src} alt="" />
    <div className="title-grain" aria-hidden="true" />
    <div className="title-layout">
      <div className="title-copy">
        <span className="title-eyebrow"><i /> EL TORNEO DE LOS DIOSES</span>
        <h1><span>MYTHIC</span><span>CLASH<small>2D</small></span></h1>
        <p>Cuatro reinos. Un solo vencedor.</p>
      </div>

      <nav className="title-menu" aria-label="Modos de juego">
        <div className="title-menu-heading"><span>ELIGE TU CAMINO</span><i /></div>
        {items.map((item, index) => {
          if (!item.mode && item.screen !== 'LAN_MENU') return null;
          const entry = item.screen === 'LAN_MENU' ? { title: 'Sala Wi-Fi', tag: '2 DISPOSITIVOS', icon: Wifi } : MODES[item.mode!], Icon = entry.icon;
          return <button key={item.mode ?? item.screen} type="button" className="title-mode" data-active={selected === index}
            aria-label={`${entry.title} · ${entry.tag}`} onMouseEnter={() => highlight(index)} onFocus={() => highlight(index)} onClick={() => choose(item)}>
            <span className="title-mode-index">{String(index + 1).padStart(2, '0')}</span>
            <Icon className="title-mode-icon" size={18} strokeWidth={1.5} />
            <strong>{entry.title}</strong><span className="title-mode-tag">{entry.tag}</span><ArrowUpRight className="title-mode-arrow" size={18} />
          </button>;
        })}
        <div className="title-settings">
          {items.map((item, index) => {
            if (!item.screen || item.screen === 'LAN_MENU') return null;
            const isDifficulty = item.screen === 'DIFFICULTY_MENU', Icon = isDifficulty ? SlidersHorizontal : Gamepad2;
            return <button key={item.screen} data-active={selected === index} aria-label={isDifficulty ? `Dificultad: ${difficulty}` : 'Configurar controles'}
              onMouseEnter={() => highlight(index)} onFocus={() => highlight(index)} onClick={() => choose(item)}>
              <Icon size={15} strokeWidth={1.5} /><span>{isDifficulty ? 'Dificultad' : 'Controles'}</span>{isDifficulty && <b>{difficulty === 'FACIL' ? 'Fácil' : difficulty === 'DIFICIL' ? 'Difícil' : 'Normal'}</b>}
            </button>;
          })}
        </div>
      </nav>

      <aside className="title-showcase" aria-label={settings ? 'Ajusta tu partida' : details.title}>
        <div className="title-halo" aria-hidden="true" />
        <div className="title-slash title-slash-blue" aria-hidden="true" />
        <div className="title-slash title-slash-red" aria-hidden="true" />
        <div className="title-stage-caption" aria-hidden="true">GRECIA / EGIPTO / MÉXICO / JAPÓN</div>
        {active?.screen === 'LAN_MENU' ? <div className="title-network-art" aria-hidden="true"><Gamepad2 className="title-network-pad" /><Wifi className="title-network-signal" /><Gamepad2 className="title-network-pad" /></div> : settings ? <div className="title-network-art title-options-art" aria-hidden="true">{settings === 'DIFFICULTY_MENU' ? <SlidersHorizontal /> : <Gamepad2 />}</div> : <div className="title-fighters" key={mode}><TitleFighters mode={mode} /></div>}
        <div className="title-stage-floor" aria-hidden="true" />
        <div className="title-feature" aria-live="polite">
          <span>{settings ? 'A TU MANERA' : details.tag}</span>
          <h2>{settings ? active.screen === 'DIFFICULTY_MENU' ? 'Ajusta el desafío' : 'Encuentra tu estilo' : details.title}</h2>
          <p>{settings ? active.screen === 'DIFFICULTY_MENU' ? 'Elige la dificultad para tu siguiente partida.' : 'Personaliza teclado, mando y controles táctiles.' : details.description}</p>
        </div>
      </aside>
    </div>
    <footer className="title-footer">
      <span><b>{DEITIES.length}</b> DIOSES <i /> <b>{new Set(DEITIES.map(d => d.pantheon)).size}</b> REINOS</span>
      <div>{touch ? 'Toca un modo para comenzar' : <><kbd>{navigate}</kbd> elegir <i /> <kbd>{confirm} / Enter</kbd> confirmar</>}</div>
    </footer>
  </section>;
}
