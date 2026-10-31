export const VERSUS_HEALTH = 180;
export const ROUND_INTRO_TICKS = 100;
export const ROUND_KO_TICKS = 165;
export type RoundWinner = 1 | 2 | null;

// El resultado se registra una sola vez; los empates repiten sin sumar una victoria.
export class MatchFlow {
  phase: 'intro' | 'fight' | 'ko' | 'complete' = 'intro';
  elapsed = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  roundWinner: RoundWinner = null;
  reason: 'ko' | 'time' = 'ko';
  constructor(public readonly targetWins = 2) {}

  finish(winner: RoundWinner, reason: 'ko' | 'time' = 'ko') {
    if (this.phase !== 'fight') return false;
    this.roundWinner = winner;
    this.reason = reason;
    if (winner !== null) this.wins[winner - 1]++;
    this.phase = 'ko'; this.elapsed = 0;
    return true;
  }

  step(): 'fight' | 'nextRound' | 'complete' | null {
    if (this.phase === 'fight' || this.phase === 'complete') return null;
    this.elapsed++;
    if (this.phase === 'intro' && this.elapsed >= ROUND_INTRO_TICKS) {
      this.phase = 'fight'; this.elapsed = 0; return 'fight';
    }
    if (this.phase === 'ko' && this.elapsed >= ROUND_KO_TICKS) {
      if (this.wins.some(wins => wins >= this.targetWins)) { this.phase = 'complete'; return 'complete'; }
      this.round++; this.phase = 'intro'; this.elapsed = 0; return 'nextRound';
    }
    return null;
  }
}

export function drawMatchFlow(ctx: CanvasRenderingContext2D, flow: MatchFlow, names: [string, string], width: number) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (flow.targetWins > 1) {
    ctx.font = '700 13px sans-serif'; ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`RONDA ${flow.round}`, width / 2, 105);
  }
  // Marcadores de rondas siempre visibles, cerca de cada barra de vida.
  flow.wins.forEach((wins, player) => {
    for (let i = 0; i < flow.targetWins; i++) {
      const x = player === 0 ? 70 + i * 30 : width - 70 - i * 30;
      ctx.fillStyle = i < wins ? '#fbbf24' : '#152333';
      ctx.strokeStyle = '#a28d59'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, 140, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  });
  if (flow.phase === 'intro' || flow.phase === 'ko') {
    const ko = flow.phase === 'ko';
    const label = ko ? flow.reason === 'time' ? 'TIEMPO' : flow.roundWinner === null ? 'DOBLE K.O.' : 'K.O.' : flow.elapsed < 65 ? `RONDA ${flow.round}` : '¡A PELEAR!';
    ctx.fillStyle = '#03070b9c'; ctx.fillRect(0, 190, width, 140);
    ctx.font = `900 ${ko ? 100 : 66}px 'Cinzel', serif`;
    ctx.fillStyle = ko ? '#f7c36b' : '#f1f5f9';
    ctx.strokeStyle = '#080b10'; ctx.lineWidth = 6;
    ctx.strokeText(label, width / 2, 265); ctx.fillText(label, width / 2, 265);
    if (ko && flow.elapsed > 45) {
      ctx.fillStyle = '#05090edb'; ctx.fillRect(0, 590, width, 105);
      ctx.fillStyle = '#e2e8f0'; ctx.font = "700 27px sans-serif";
      const winner = flow.roundWinner;
      const matchWon = flow.wins.some(w => w >= flow.targetWins);
      ctx.fillText(winner === null ? 'EMPATE · SE REPITE LA RONDA' : `${names[winner - 1].toUpperCase()} GANA ${matchWon ? 'EL COMBATE' : 'LA RONDA'}`, width / 2, 624);
      ctx.font = '700 24px sans-serif'; ctx.fillStyle = '#fbbf24';
      ctx.fillText(`${flow.wins[0]}  —  ${flow.wins[1]}`, width / 2, 665);
    }
  }
  ctx.restore();
}
