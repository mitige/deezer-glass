import { contextBridge, ipcRenderer } from 'electron'
import type { NowPlaying, Lyrics, ClipResult } from '../shared/types'

type Track = { trackId: string; artist: string; title: string; album: string; durationMs: number }

contextBridge.exposeInMainWorld('np', {
  onUpdate: (cb: (np: NowPlaying) => void) =>
    ipcRenderer.on('nowplaying:update', (_e, np: NowPlaying) => cb(np)),
  getLyrics: (t: Track): Promise<Lyrics> => ipcRenderer.invoke('lyrics:get', t),
  resolveClip: (t: { artist: string; title: string }): Promise<ClipResult> =>
    ipcRenderer.invoke('clip:resolve', t),
  resolveCover: (t: { trackId?: string; artist: string; title: string }): Promise<string | null> =>
    ipcRenderer.invoke('cover:resolve', t),
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    close: () => ipcRenderer.invoke('win:close'),
    toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
  },
})
