import type { NowPlaying } from '../../shared/types'
import { interpolatePosition } from '../../shared/playback'
import { onTick } from '../state'

let showing = false
let track = ''
let lastSync = 0

export function initClip(getNp: () => NowPlaying | null): void {
  const btn = document.getElementById('clip-toggle')
  btn?.addEventListener('click', () => { void toggle(getNp()) })
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
  document.getElementById('clip-toggle')?.classList.add('on')

  const { embedUrl } = await window.np.resolveClip({ artist: np.artist, title: np.title })
  if (!embedUrl || track !== np.trackId || !showing) { teardown(); return }

  const panel = document.getElementById('panel')!
  const wrap = document.createElement('div')
  wrap.id = 'clip-wrap'
  const frame = document.createElement('iframe')
  frame.id = 'clip-frame'
  frame.src = `${embedUrl}&vq=hd1080`
  frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
  frame.setAttribute('frameborder', '0')
  wrap.appendChild(frame)
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

function teardown(): void {
  showing = false
  document.getElementById('clip-toggle')?.classList.remove('on')
  const wrap = document.getElementById('clip-wrap')
  if (wrap) { wrap.classList.remove('visible'); setTimeout(() => wrap.remove(), 350) }
}

function post(func: string, args: unknown[]): void {
  const frame = document.getElementById('clip-frame') as HTMLIFrameElement | null
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
}
