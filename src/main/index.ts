import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { attachSmtc } from './smtc'
import { registerIpc } from './ipc'
import { loadBounds, saveBounds } from './store'

function createWindow(): void {
  const b = loadBounds()
  const win = new BrowserWindow({
    ...b,
    minWidth: 720, minHeight: 460,
    frame: false,
    backgroundColor: '#0b0f17',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  const persist = () => saveBounds(win.getBounds())
  win.on('resized', persist); win.on('moved', persist)

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  attachSmtc(win)
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
