import './styles/app.css'
import { state, startTicker } from './state'
import { setBackground } from './ui/background'
import { applyPalette } from './ui/palette'
import { initProgress } from './ui/progress'
import { initLyrics, loadLyricsFor } from './ui/lyrics'
import { initClip } from './ui/clip'
import { initChrome } from './ui/chrome'
import type { NowPlaying } from '../shared/types'

const $ = (id: string) => document.getElementById(id)!

window.np.onUpdate((np: NowPlaying) => {
  state.np = np
  const idle = np.status === 'none' && !np.title
  document.body.classList.toggle('idle', idle)
  $('title').textContent = np.title || 'En attente de lecture'
  $('artist').textContent = np.artist

  if ($('title').dataset.track !== np.trackId) {
    const tid = np.trackId
    $('title').dataset.track = tid
    $('art').style.backgroundImage = np.artDataUrl ? `url(${np.artDataUrl})` : 'none'
    applyPalette(np.artDataUrl)
    setBackground(np.artDataUrl, tid)
    loadLyricsFor(np)
    if (np.artist && np.title) {
      window.np.resolveCover({ trackId: tid, artist: np.artist, title: np.title }).then((hi) => {
        if (hi && $('title').dataset.track === tid) {
          $('art').style.backgroundImage = `url(${hi})`
          applyPalette(hi)
          setBackground(hi, tid + ':hi')
        }
      })
    }
  }
})

initChrome()
initProgress()
initLyrics()
initClip(() => state.np)
startTicker()
