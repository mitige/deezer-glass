import type { NowPlaying, Lyrics, LyricLine } from '../../shared/types'
import { onTick } from '../state'

let synced: LyricLine[] | null = null
let lineCount = 0
let durationMs = 0
let live = false
let activeIdx = -1
let currentTrack = ''
let weightStarts: number[] = []
let weightTotal = 1

export function initLyrics(): void {
  onTick((pos) => {
    if (!live || !lineCount) return
    let idx = -1
    if (synced && synced.length) {
      // exact: last line whose timestamp has passed
      for (let i = 0; i < synced.length; i++) { const ln = synced[i]; if (ln && ln.timeMs <= pos) idx = i; else break }
    } else if (durationMs > 0) {
      // approximate (no timestamps): distribute the song's singing time across the lyrics by TEXT
      // WEIGHT — long lines dwell longer, section markers / blank lines pass instantly — so the
      // scroll tracks the Deezer duration far more naturally than a uniform per-line mapping.
      const INTRO = 5000, OUTRO = 5000
      const span = Math.max(1, durationMs - INTRO - OUTRO)
      const frac = Math.max(0, Math.min(1, (pos - INTRO) / span))
      const target = frac * weightTotal
      let i = 0
      while (i + 1 < lineCount && (weightStarts[i + 1] ?? Infinity) <= target) i++
      idx = i
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

function lineWeight(text: string): number {
  const t = text.trim()
  if (!t) return 0                                // blank / instrumental gap — no dwell
  if (/^[\[(][^\])]*[\])]$/.test(t)) return 8     // [Refrain], [Intro], (chorus)… — brief
  return Math.max(12, t.length)                   // dwell ~ proportional to line length
}

function render(texts: string[]): void {
  const box = document.getElementById('lyrics')!
  activeIdx = -1
  lineCount = texts.length
  weightStarts = []
  let acc = 0
  for (const t of texts) { weightStarts.push(acc); acc += lineWeight(t) }
  weightTotal = Math.max(1, acc)
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
