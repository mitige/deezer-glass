import { interpolatePosition } from './playback'
import type { NowPlaying } from './types'

const base: NowPlaying = {
  trackId: 'x', title: '', artist: '', album: '', artDataUrl: null,
  positionMs: 10_000, durationMs: 60_000, lastUpdatedMs: 1_000_000, rate: 1, status: 'playing'
}

describe('interpolatePosition', () => {
  it('advances while playing', () => {
    expect(interpolatePosition(base, 1_003_000)).toBe(13_000)
  })
  it('does not advance while paused', () => {
    expect(interpolatePosition({ ...base, status: 'paused' }, 1_003_000)).toBe(10_000)
  })
  it('clamps to [0, duration]', () => {
    expect(interpolatePosition(base, 9_999_999_999)).toBe(60_000)
    expect(interpolatePosition({ ...base, positionMs: 0, lastUpdatedMs: 2_000_000 }, 1_000_000)).toBe(0)
  })
  it('honors rate', () => {
    expect(interpolatePosition({ ...base, rate: 2 }, 1_002_000)).toBe(14_000)
  })
})
