import { useEffect, useRef } from 'react';
import { DEITIES } from '../game/deities';
import type { DeityData } from '../game/deities';
import { drawDeityPortraitIcon } from '../game/portraits';
import { LEVELS } from './levels';

function BossPortrait({ deityId }: { deityId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 56, 56);
    drawDeityPortraitIcon(ctx, deityId, 28, 28, 50);
  }, [deityId]);
  return <canvas ref={canvasRef} width={56} height={56} className="w-11 h-11 shrink-0" />;
}

// Ruta del modo arcade en la selección: los 4 niveles y el dios que hará de jefe en cada uno
export default function ArcadeRouteCard({ hero }: { hero: DeityData }) {
  return (
    <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 flex flex-col shadow-2xl relative overflow-hidden backdrop-blur-md w-full">
      <div className="text-[11px] font-bold px-2.5 py-1 rounded border bg-red-500/20 text-red-400 border-red-400/40 self-start">
        RUTA DEL TORNEO
      </div>
      <p className="text-[12px] text-slate-400 mt-2 mb-3 leading-snug">
        Avanza a pie por cuatro panteones, derrota a sus monstruos y vence al dios que custodia cada nivel.
      </p>
      <div className="space-y-2">
        {LEVELS.map((level, i) => {
          const bossId = level.bossOrder.find(id => id !== hero.id) ?? level.bossOrder[0];
          const boss = DEITIES.find(d => d.id === bossId);
          return (
            <div key={level.pantheon} className="flex items-center gap-3 bg-black/40 rounded-lg p-2 border border-white/5">
              {boss && <BossPortrait deityId={boss.id} />}
              <div className="text-left min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Nivel {i + 1} · {level.pantheon}
                </div>
                <div className="font-cinzel text-sm font-bold text-slate-100 truncate">{level.title}</div>
                <div className="text-[11px] text-red-300 truncate">Jefe: {boss?.name ?? '???'}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 p-2 bg-amber-500/10 rounded-lg border border-amber-500/25 text-[11px] text-slate-300 leading-snug">
        <b className="text-amber-300">J</b> combo · <b className="text-amber-300">K</b> salto · <b className="text-amber-300">J+K</b> giro ·{' '}
        <b className="text-amber-300">doble ←/→</b> correr · <b className="text-amber-300">L</b> magia
      </div>
    </div>
  );
}
