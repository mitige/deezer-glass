import { quantize } from '../../shared/palette'

const SAMPLE = 48

export async function applyPalette(artDataUrl: string | null): Promise<void> {
  const root = document.documentElement.style
  if (!artDataUrl) {
    root.setProperty('--art-1', '#2a2f3a'); root.setProperty('--art-2', '#12151d')
    root.setProperty('--art-accent', '#8aa0c8'); root.setProperty('--art-ink', '#ffffff')
    return
  }
  const img = await load(artDataUrl)
  const c = document.createElement('canvas'); c.width = SAMPLE; c.height = SAMPLE
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  const p = quantize(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data)
  root.setProperty('--art-1', p.dominant)
  root.setProperty('--art-2', p.dark)
  root.setProperty('--art-accent', p.vibrant)
  root.setProperty('--art-ink', p.ink)
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src
  })
}
