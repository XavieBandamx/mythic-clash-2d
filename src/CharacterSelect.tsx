import React, { useEffect, useRef, useState } from 'react';
import { DEITIES } from './game/deities';
import type { DeityData } from './game/deities';
import type { GameMode } from './App';
import { getSpriteSheetConfig, loadSpriteSheet } from './game/sprites';
import { profileFor } from './game/combat';
import { readMastery, masteryTitle } from './game/progression';
import { ROSTER_COLUMNS, ROSTER_PAGE_SIZE } from './game/roster';
import { sounds } from './game/sound';

function FighterPreview({ deity }: { deity: DeityData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cfg = getSpriteSheetConfig(deity);
    const sheet = loadSpriteSheet(cfg.src);
    let handle = 0;
    const render = (now: number) => {
      ctx.clearRect(0, 0, 400, 320);
      if (sheet.status === 'ready') {
        const idle = cfg.animations.idle;
        const frame = Math.floor(now / (idle.frameDuration * 1000 / 60)) % idle.frames;
        // Las hojas tienen mucho margen horizontal para armas; escalar por alto.
        const scale = 280 / cfg.frameHeight;
        const w = cfg.frameWidth * scale, h = cfg.frameHeight * scale;
        ctx.drawImage(sheet.image, frame * cfg.frameWidth, idle.row * cfg.frameHeight, cfg.frameWidth, cfg.frameHeight, 200 - w / 2, 310 - h, w, h);
      }
      handle = requestAnimationFrame(render);
    };
    handle = requestAnimationFrame(render);
    return () => cancelAnimationFrame(handle);
  }, [deity.id]);
  return <canvas aria-label={deity.name} ref={ref} width={400} height={320} />;
}

// Retratos extraídos de la propia hoja: un dios nuevo no necesita otra imagen.
function FighterPortrait({ deity }: { deity: DeityData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cfg = getSpriteSheetConfig(deity), sheet = loadSpriteSheet(cfg.src);
    const draw = () => {
      const crop = cfg.frameHeight * 0.86;
      ctx.clearRect(0, 0, 160, 160);
      if (sheet.status === 'ready') ctx.drawImage(sheet.image, (cfg.frameWidth - crop) / 2, cfg.animations.idle.row * cfg.frameHeight, crop, crop, 0, 0, 160, 160);
    };
    draw(); sheet.image.addEventListener('load', draw);
    return () => sheet.image.removeEventListener('load', draw);
  }, [deity.id]);
  return <canvas ref={ref} width={160} height={160} aria-hidden="true" />;
}

interface Props {
  mode: GameMode; difficulty: string; p1: number; p2: number; ready1: boolean; ready2: boolean;
  select: (index: number, player: 1 | 2) => void;
  confirm: () => void; back: () => void;
}
export default function CharacterSelect({ mode, difficulty, p1, p2, ready1, ready2, select, confirm, back }: Props) {
  const duo = mode === 'PVP' || mode === 'ARCADE_COOP';
  const [player, setPlayer] = useState<1 | 2>(1);
  const active = player === 1 ? p1 : p2;
  const [page, setPage] = useState(Math.floor(active / ROSTER_PAGE_SIZE));
  useEffect(() => setPage(Math.floor(active / ROSTER_PAGE_SIZE)), [active, player]);
  useEffect(() => { if (duo && ready1 && !ready2) setPlayer(2); }, [duo, ready1, ready2]);
  const deity = DEITIES[active], rival = DEITIES[p2];
  const mastery = readMastery(deity.id);
  const pages = Math.max(1, Math.ceil(DEITIES.length / ROSTER_PAGE_SIZE));
  const modeName = { PVE: 'Versus · Primero en ganar 2 rondas', PVP: 'Versus local · Primero en ganar 2 rondas', ARCADE: 'Camino de los Dioses', ARCADE_COOP: 'Arcade cooperativo', TOWER: 'Torre de los Dioses' }[mode];
  const preview = (d: DeityData, side: 'left' | 'right') => <div className={`select-contender select-${side}`} style={{ '--contender-color': d.accentColor } as React.CSSProperties}>
    <div className="select-figure"><FighterPreview deity={d} /></div>
    <div className="select-identity"><span>{side === 'left' ? `JUGADOR ${player}` : duo ? `JUGADOR ${player === 1 ? 2 : 1}` : 'RIVAL IA'} / {d.pantheon}</span><h3>{d.name}</h3><p>{d.style} · {d.passive.name}</p></div>
  </div>;
  return <section className="fighter-select" aria-label="Selección de personaje" style={{ '--fighter-accent': deity.accentColor } as React.CSSProperties}>
    <header className="select-heading"><div><span>MYTHIC CLASH / {modeName}</span><h2>ELIGE TU LUCHADOR</h2></div><small>{difficulty}</small></header>
    <div className="select-stage">
      {preview(deity, 'left')}
      <div className="select-center"><b>{mode === 'ARCADE' || mode === 'ARCADE_COOP' ? 'ARCADE' : mode === 'TOWER' ? 'TORRE' : 'VS'}</b><span>{masteryTitle(mastery)} · {mastery.wins} victorias</span><p>{profileFor(deity.id).plan}</p></div>
      {(duo || mode === 'PVE') && preview(player === 2 ? DEITIES[p1] : rival, 'right')}
    </div>
    <div className="select-roster">
      <div className="select-roster-bar"><span>{DEITIES.length} LUCHADORES</span>
        {duo && <div className="select-player-tabs">{([1, 2] as const).map(n => <button key={n} aria-pressed={player === n} onClick={() => setPlayer(n)}>P{n} · {DEITIES[n === 1 ? p1 : p2].name}{(n === 1 ? ready1 : ready2) ? ' ✓' : ''}</button>)}</div>}
        <nav aria-label="Páginas de luchadores"><button aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button><span>{page + 1} / {pages}</span><button aria-label="Página siguiente" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>›</button></nav>
      </div>
      <div className="select-cells" style={{ gridTemplateColumns: `repeat(${ROSTER_COLUMNS}, minmax(0, 1fr))` }}>
        {Array.from({ length: ROSTER_PAGE_SIZE }, (_, slot) => {
          const index = page * ROSTER_PAGE_SIZE + slot, d = DEITIES[index];
          if (!d) return <div className="select-cell select-empty" key={`empty-${slot}`} aria-hidden="true"><span>＋</span></div>;
          return <button key={d.id} className="select-cell" aria-label={d.name} aria-pressed={active === index} data-p1={p1 === index} data-p2={duo && p2 === index} onClick={() => { select(index, player); sounds.playNav(); }}>
            <FighterPortrait deity={d} /><strong>{d.name}</strong><div className="select-cursors">{p1 === index && <span>P1</span>}{duo && p2 === index && <span>P2</span>}</div>
          </button>;
        })}
      </div>
    </div>
    <footer className="select-footer"><button onClick={back}>← Volver</button><span>{deity.name} / {deity.style}</span><button className="select-confirm" onClick={confirm}>CONFIRMAR <b>→</b></button></footer>
  </section>;
}
