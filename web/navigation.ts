export function nextSlide(index: number, count: number, key: string): number {
  if (count <= 0) return 0;
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === ' ') return Math.min(index + 1, count - 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, index - 1);
  return index;
}
