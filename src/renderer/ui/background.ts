export function setBackground(artDataUrl: string | null, trackId: string): void {
  const bg = document.getElementById('bg')!
  if (bg.dataset.track === trackId) return
  bg.dataset.track = trackId

  const layer = document.createElement('div')
  layer.className = 'bg-layer'
  layer.style.backgroundImage = artDataUrl ? `url(${artDataUrl})` : 'none'
  layer.style.opacity = '0'
  bg.appendChild(layer)
  requestAnimationFrame(() => { layer.style.opacity = '1' })

  for (const prev of Array.from(bg.querySelectorAll('.bg-layer'))) {
    if (prev !== layer) {
      ;(prev as HTMLElement).style.opacity = '0'
      setTimeout(() => prev.remove(), 800)
    }
  }
}
