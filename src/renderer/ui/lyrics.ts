import type { NowPlaying, Lyrics, LyricLine } from '../../shared/types'
import { onTick } from '../state'

let lines: LyricLine[] = []
let activeIdx = -1
let currentTrack = ''

export function initLyrics(): void {
  onTick((pos) => {
    if (!lines.length) return
    let idx = -1
    for (let i = 0; i < lines.length; i++) { const ln = lines[i]; if (ln && ln.timeMs <= pos) idx = i; else break }
    if (idx !== activeIdx) { activeIdx = idx; paintActive() }
  })
}

export async function loadLyricsFor(np: NowPlaying): Promise<void> {
  if (np.trackId === currentTrack) return
  currentTrack = np.trackId
  lines = []; activeIdx = -1
  render(['…'])
  const res: Lyrics = await window.np.getLyrics({
    trackId: np.trackId, artist: np.artist, title: np.title, album: np.album, durationMs: np.durationMs,
  })
  if (np.trackId !== currentTrack) return
  if (res.synced && res.synced.length) { lines = res.synced; render(lines.map((l) => l.text || '♪')) }
  else if (res.plain) { lines = []; render(res.plain.split(/\r?\n/)) }
  else { lines = []; render(['Paroles indisponibles']) }
}

function render(texts: string[]): void {
  const box = document.getElementById('lyrics')!
  box.classList.toggle('plain', !lines.length)
  box.innerHTML = ''
  for (const t of texts) {
    const div = document.createElement('div'); div.className = 'lyric'; div.textContent = t
    box.appendChild(div)
  }
}

function paintActive(): void {
  const box = document.getElementById('lyrics')!
  const els = box.querySelectorAll('.lyric')
  els.forEach((el, i) => el.classList.toggle('active', i === activeIdx))
  const el = els[activeIdx] as HTMLElement | undefined
  if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
}
