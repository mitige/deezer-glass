import type { Palette } from './types'

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

function sat(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

export function quantize(px: Uint8ClampedArray): Palette {
  let bestVib = { s: -1, r: 0, g: 0, b: 0 }
  let sr = 0, sg = 0, sb = 0, n = 0
  let dark = { l: 2, r: 0, g: 0, b: 0 }
  for (let i = 0; i + 3 < px.length; i += 4) {
    const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!
    sr += r; sg += g; sb += b; n++
    // vibrancy = saturation, biased toward mid-luminance (avoids picking near-black or near-white)
    const s = sat(r, g, b) * (0.4 + 0.6 * (1 - Math.abs(lum(r, g, b) - 0.5) * 2))
    if (s > bestVib.s) bestVib = { s, r, g, b }
    const l = lum(r, g, b)
    if (l < dark.l) dark = { l, r, g, b }
  }
  n = Math.max(1, n)
  const dr = sr / n, dg = sg / n, db = sb / n
  const ink = lum(dr, dg, db) < 0.5 ? '#ffffff' : '#0b0b0b'
  return {
    dominant: hex(dr, dg, db),
    vibrant: hex(bestVib.r, bestVib.g, bestVib.b),
    dark: hex(dark.r, dark.g, dark.b),
    ink,
  }
}
