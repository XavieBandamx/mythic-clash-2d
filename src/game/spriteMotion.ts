// Cuadros de la hoja extra sincronizados con la simulación, nunca con el reloj del navegador.
export function victoryFrame(ticks: number) { return ticks < 18 ? 2 : 3; }
export function heavyFrame(ticks: number, impactTick: number) { return ticks < impactTick ? 0 : 1; }
export function jumpFrame(ticks: number, upwardVelocity: number, height: number) {
  if (ticks <= 2 && upwardVelocity > 0) return 0;
  if (upwardVelocity < 0 && height < 30) return 3;
  return upwardVelocity > 4 ? 1 : 2;
}
export function castFrame(ticks: number, releaseTick: number, duration: number) {
  if (ticks < releaseTick * 0.5) return 0;
  if (ticks < releaseTick) return 1;
  return ticks < releaseTick + Math.max(6, (duration - releaseTick) * 0.55) ? 2 : 3;
}
export function versusSuperRelease(id: string) {
  return ({ zeus: 14, ra: 14, hades: 12, poseidon: 12, anubis: 12, osiris: 24,
    quetzalcoatl: 12, huitzilopochtli: 12, mictlantecuhtli: 26, amaterasu: 16, susanoo: 14, raijin: 14 } as Record<string, number>)[id] ?? 20;
}
