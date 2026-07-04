import './styles/app.css'
import { state, startTicker } from './state'
import { setBackground } from './ui/background'
import { applyPalette } from './ui/palette'
import { initProgress } from './ui/progress'
import { initLyrics, loadLyricsFor } from './ui/lyrics'
import type { NowPlaying } from '../shared/types'

const $ = (id: string) => document.getElementById(id)!

window.np.onUpdate((np: NowPlaying) => {
  state.np = np
  $('title').textContent = np.title || 'En attente de lecture'
  $('artist').textContent = np.artist
  $('art').style.backgroundImage = np.artDataUrl ? `url(${np.artDataUrl})` : 'none'

  if ($('title').dataset.track !== np.trackId) {
    $('title').dataset.track = np.trackId
    applyPalette(np.artDataUrl)
    setBackground(np.artDataUrl, np.trackId)
    loadLyricsFor(np)
  }
})

initProgress()
initLyrics()
startTicker()
