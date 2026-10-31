export const ROSTER_COLUMNS = 6;
export const ROSTER_PAGE_SIZE = 18;

// Navegación por todo el elenco, incluso si la última fila está incompleta.
export function moveRoster(index: number, direction: 'left' | 'right' | 'up' | 'down', count: number) {
  if (count <= 0) return 0;
  if (direction === 'left') return (index + count - 1) % count;
  if (direction === 'right') return (index + 1) % count;
  const rows = Math.ceil(count / ROSTER_COLUMNS);
  const row = Math.floor(index / ROSTER_COLUMNS);
  const column = index % ROSTER_COLUMNS;
  const nextRow = (row + (direction === 'up' ? rows - 1 : 1)) % rows;
  return Math.min(count - 1, nextRow * ROSTER_COLUMNS + column);
}
