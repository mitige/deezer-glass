import type { BrowserWindow } from 'electron'
import { start, type NowPlaying as NativeNowPlaying } from '@deezer-glass/smtc'
import { makeTrackId } from '../shared/normalize'
import type { NowPlaying, PlaybackStatus } from '../shared/types'

export function attachSmtc(win: BrowserWindow): void {
  start((raw: NativeNowPlaying) => {
    const np: NowPlaying = {
      title: raw.title,
      artist: raw.artist,
      album: raw.album,
      artDataUrl: raw.artDataUrl ?? null,
      positionMs: raw.positionMs,
      durationMs: raw.durationMs,
      lastUpdatedMs: raw.lastUpdatedMs,
      rate: raw.rate,
      status: raw.status as PlaybackStatus,
      trackId: makeTrackId(raw.artist, raw.title, raw.durationMs),
    }
    if (!win.isDestroyed()) win.webContents.send('nowplaying:update', np)
  })
}
