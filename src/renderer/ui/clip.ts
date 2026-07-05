import type { NowPlaying } from '../../shared/types'
import { interpolatePosition } from '../../shared/playback'
import { onTick } from '../state'

let showing = false
let track = ''
let lastPos = -1

export function initClip(getNp: () => NowPlaying | null): void {
  document.getElementById('art')?.addEventListener('click', () => { void toggle(getNp()) })
  onTick((pos) => {
    // Re-sync the clip to the music ONLY when the Deezer position JUMPS (a seek/skip). During
    // normal playback both run at 1×, so no seeking is needed and the player's title/controls
    // chrome is never woken. A jump (> 1.5 s beyond a normal tick) means you seeked → snap the video.
    if (!showing) { lastPos = pos; return }
    if (lastPos >= 0 && Math.abs(pos - lastPos) > 1500) post('seekTo', [pos / 1000, true])
    lastPos = pos
  })
}

async function toggle(np: NowPlaying | null): Promise<void> {
  if (showing) { teardown(); return }
  if (!np) return
  showing = true
  track = np.trackId

  const { embedUrl } = await window.np.resolveClip({ artist: np.artist, title: np.title })
  if (!embedUrl || track !== np.trackId || !showing) { teardown(); return }

  const panel = document.getElementById('panel')!
  const wrap = document.createElement('div')
  wrap.id = 'clip-wrap'

  const frame = document.createElement('iframe')
  frame.id = 'clip-frame'
  // Sync ONCE at open via the URL's start= param, then leave the player untouched.
  // (A periodic seekTo kept waking YouTube's title/controls chrome and re-buffering.)
  const startSec = Math.max(0, Math.floor(interpolatePosition(np, Date.now()) / 1000))
  frame.src = `${embedUrl}&start=${startSec}`
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
  frame.setAttribute('frameborder', '0')
  wrap.appendChild(frame)

  wrap.appendChild(button('clip-fs', '⤢', 'Plein écran', (e) => { e.stopPropagation(); void toggleFullscreen(wrap) }))
  wrap.appendChild(button('clip-close', '×', 'Fermer le clip', (e) => { e.stopPropagation(); teardown() }))

  panel.appendChild(wrap)
  requestAnimationFrame(() => wrap.classList.add('visible'))
}

function button(id: string, label: string, aria: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.id = id
  b.textContent = label
  b.setAttribute('aria-label', aria)
  b.addEventListener('click', onClick)
  return b
}

async function toggleFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await el.requestFullscreen()
  } catch { /* fullscreen may be denied — ignore */ }
}

function teardown(): void {
  showing = false
  lastPos = -1
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  const wrap = document.getElementById('clip-wrap')
  if (wrap) { wrap.classList.remove('visible'); setTimeout(() => wrap.remove(), 350) }
}

function post(func: string, args: unknown[]): void {
  const frame = document.getElementById('clip-frame') as HTMLIFrameElement | null
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
}
