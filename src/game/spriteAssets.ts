// Originales y recortes viven juntos. Solo los recortes entran al juego publicado.
export const SPRITE_ASSETS = import.meta.glob<string>([
  '../../assets/sprites/*.webp',
  '!../../assets/sprites/*-original.webp'
], { eager: true, query: '?url', import: 'default' });
