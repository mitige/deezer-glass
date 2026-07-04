import { quantize } from './palette'

const pixels = new Uint8ClampedArray([230, 120, 40, 255, 8, 8, 10, 255])

describe('quantize', () => {
  it('returns hex strings for all roles', () => {
    const p = quantize(pixels)
    expect(p.dominant).toMatch(/^#[0-9a-f]{6}$/)
    expect(p.vibrant).toMatch(/^#[0-9a-f]{6}$/)
    expect(p.dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(p.ink).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('vibrant favors the saturated orange over near-black', () => {
    expect(quantize(pixels).vibrant).toBe('#e67828')
  })
  it('ink is readable (light) on a dark-dominant image', () => {
    expect(quantize(pixels).ink).toBe('#ffffff')
  })
})
