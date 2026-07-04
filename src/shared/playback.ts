import type { NowPlaying } from './types'

export function interpolatePosition(np: NowPlaying, nowMs: number): number {
  if (np.status !== 'playing') return clamp(np.positionMs, 0, np.durationMs)
  const elapsed = (nowMs - np.lastUpdatedMs) * (np.rate || 1)
  return clamp(np.positionMs + elapsed, 0, np.durationMs)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
