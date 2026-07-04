import type { NowPlaying } from '../shared/types'
import { interpolatePosition } from '../shared/playback'

export interface AppState { np: NowPlaying | null }
export const state: AppState = { np: null }

type Tick = (posMs: number, np: NowPlaying) => void
const ticks = new Set<Tick>()
export const onTick = (t: Tick) => ticks.add(t)

export function startTicker(): void {
  const loop = () => {
    if (state.np) {
      const pos = interpolatePosition(state.np, Date.now())
      for (const t of ticks) t(pos, state.np)
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
