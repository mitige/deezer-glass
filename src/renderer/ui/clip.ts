import type { NowPlaying } from '../../shared/types'
import { interpolatePosition } from '../../shared/playback'
import { onTick } from '../state'

let showing = false
let track = ''
let lastSync = 0

export function initClip(getNp: () => NowPlaying | null): void {
  document.getElementById('art')?.addEventListener('click', () => { void toggle(getNp()) })
  onTick((pos) => {
    if (!showing) return
    const now = Date.now()
    if (now - lastSync < 5000) return
    lastSync = now
    post('seekTo', [pos / 1000, true])
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
  frame.src = embedUrl
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
  frame.setAttribute('frameborder', '0')
  wrap.appendChild(frame)

  wrap.appendChild(button('clip-fs', '⤢', 'Plein écran', (e) => { e.stopPropagation(); void toggleFullscreen(wrap) }))
  wrap.appendChild(button('clip-close', '×', 'Fermer le clip', (e) => { e.stopPropagation(); teardown() }))

  panel.appendChild(wrap)
  requestAnimationFrame(() => wrap.classList.add('visible'))

  frame.addEventListener('load', () => {
    const pos = interpolatePosition(np, Date.now())
    setTimeout(() => {
      post('setPlaybackQuality', ['hd1080'])
      post('seekTo', [pos / 1000, true])
      post('playVideo', [])
    }, 400)
  })
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
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  const wrap = document.getElementById('clip-wrap')
  if (wrap) { wrap.classList.remove('visible'); setTimeout(() => wrap.remove(), 350) }
}

function post(func: string, args: unknown[]): void {
  const frame = document.getElementById('clip-frame') as HTMLIFrameElement | null
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
}
