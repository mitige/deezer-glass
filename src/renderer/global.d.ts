import type { NowPlaying, Lyrics, ClipResult } from '../shared/types'
type Track = { trackId: string; artist: string; title: string; album: string; durationMs: number }
declare global {
  interface Window {
    np: {
      onUpdate: (cb: (np: NowPlaying) => void) => void
      getLyrics: (t: Track) => Promise<Lyrics>
      resolveClip: (t: { artist: string; title: string }) => Promise<ClipResult>
      win: { minimize: () => void; close: () => void; toggleFullscreen: () => void }
    }
  }
}
export {}
