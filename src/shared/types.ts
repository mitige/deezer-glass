export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'none'

export interface NowPlaying {
  trackId: string
  title: string
  artist: string
  album: string
  artDataUrl: string | null
  positionMs: number
  durationMs: number
  lastUpdatedMs: number
  rate: number
  status: PlaybackStatus
}

export interface LyricLine { timeMs: number; text: string }
export interface Lyrics { synced: LyricLine[] | null; plain: string | null; source: 'lrclib' | 'genius' | 'musixmatch' | 'lyricsovh' | 'none' }
export interface ClipResult { embedUrl: string | null; videoId: string | null }

export interface Palette { dominant: string; vibrant: string; dark: string; ink: string }
