import { onTick } from '../state'

export function initProgress(): void {
  const bar = document.getElementById('bar')!
  const tcur = document.getElementById('tcur')!
  const trem = document.getElementById('trem')!
  onTick((pos, np) => {
    bar.style.width = `${np.durationMs ? (pos / np.durationMs) * 100 : 0}%`
    tcur.textContent = fmt(pos)
    trem.textContent = '-' + fmt(Math.max(0, np.durationMs - pos))
  })
}
function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
