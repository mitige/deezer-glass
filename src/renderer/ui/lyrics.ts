import type { NowPlaying, Lyrics, LyricLine } from '../../shared/types'
import { onTick } from '../state'

let synced: LyricLine[] | null = null
let lineCount = 0
let durationMs = 0
let live = false
let activeIdx = -1
let currentTrack = ''

export function initLyrics(): void {
  onTick((pos) => {
    if (!live || !lineCount) return
    let idx = -1
    if (synced && synced.length) {
      // exact: last line whose timestamp has passed
      for (let i = 0; i < synced.length; i++) { const ln = synced[i]; if (ln && ln.timeMs <= pos) idx = i; else break }
    } else if (durationMs > 0) {
      // approximate: map progress to a line, allowing for a typical intro/outro (no timestamps exist)
      const INTRO = 8000, OUTRO = 8000
      const span = Math.max(1, durationMs - INTRO - OUTRO)
      const frac = Math.max(0, Math.min(0.999, (pos - INTRO) / span))
      idx = Math.floor(frac * lineCount)
    }
    if (idx !== activeIdx) { activeIdx = idx; paintActive() }
  })
}

export async function loadLyricsFor(np: NowPlaying): Promise<void> {
  if (np.trackId === currentTrack) return
  currentTrack = np.trackId
  synced = null; activeIdx = -1; lineCount = 0; live = false; durationMs = np.durationMs
  render(['…'])
  const res: Lyrics = await window.np.getLyrics({
    trackId: np.trackId, artist: np.artist, title: np.title, album: np.album, durationMs: np.durationMs,
  })
  if (np.trackId !== currentTrack) return
  if (res.synced && res.synced.length) {
    synced = res.synced; live = true
    render(res.synced.map((l) => l.text || '♪'))
  } else if (res.plain) {
    live = true
    render(res.plain.split(/\r?\n/))
  } else {
    render(['Paroles indisponibles'])
  }
}

function render(texts: string[]): void {
  const box = document.getElementById('lyrics')!
  activeIdx = -1
  lineCount = texts.length
  box.innerHTML = ''
  for (const t of texts) {
    const div = document.createElement('div'); div.className = 'lyric'; div.textContent = t
    box.appendChild(div)
  }
  // half-height spacers top and bottom so any line (first/last included) can center
  const pad = Math.round(box.clientHeight / 2)
  box.style.paddingTop = `${pad}px`
  box.style.paddingBottom = `${pad}px`
  box.scrollTop = 0
}

function paintActive(): void {
  const box = document.getElementById('lyrics')!
  const els = box.querySelectorAll('.lyric')
  els.forEach((el, i) => el.classList.toggle('active', i === activeIdx))
  const el = els[activeIdx] as HTMLElement | undefined
  if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
}
