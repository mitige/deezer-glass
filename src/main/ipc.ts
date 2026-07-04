import { ipcMain, BrowserWindow } from 'electron'
import { getLyrics } from './lyrics'
import { resolveClip } from './clip'
import { resolveCover } from './cover'

export function registerIpc(): void {
  ipcMain.handle('lyrics:get', (_e, track) => getLyrics(track))
  ipcMain.handle('clip:resolve', (_e, track) => resolveClip(track))
  ipcMain.handle('cover:resolve', (_e, track) => resolveCover(track))
  ipcMain.handle('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.handle('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('win:toggleFullscreen', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) w.setFullScreen(!w.isFullScreen())
  })
}
