import './styles/app.css'
import { state, startTicker, onTick } from './state'
import type { NowPlaying } from '../shared/types'

const $ = (id: string) => document.getElementById(id)!

window.np.onUpdate((np: NowPlaying) => {
  state.np = np
  $('title').textContent = np.title || 'En attente de lecture'
  $('artist').textContent = np.artist
  $('art').style.backgroundImage = np.artDataUrl ? `url(${np.artDataUrl})` : 'none'
})

onTick((pos, np) => {
  const pct = np.durationMs ? (pos / np.durationMs) * 100 : 0
  $('bar').style.width = `${pct}%`
  $('tcur').textContent = fmt(pos)
  $('trem').textContent = '-' + fmt(Math.max(0, np.durationMs - pos))
})

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

startTicker()
