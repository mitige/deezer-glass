export function setBackground(artDataUrl: string | null, sig: string): void {
  const bg = document.getElementById('bg')!
  if (bg.dataset.sig === sig) return
  bg.dataset.sig = sig

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
