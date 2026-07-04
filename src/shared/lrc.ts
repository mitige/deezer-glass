import type { LyricLine } from './types'

const STAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g

export function parseLrc(text: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    STAMP.lastIndex = 0
    const stamps: number[] = []
    let m: RegExpExecArray | null
    while ((m = STAMP.exec(raw)) !== null) {
      const min = Number(m[1]), sec = Number(m[2])
      const frac = m[3] ? Number((m[3] + '00').slice(0, 3)) : 0
      stamps.push(min * 60_000 + sec * 1000 + frac)
    }
    if (stamps.length === 0) continue
    const content = raw.replace(STAMP, '').trim()
    for (const t of stamps) out.push({ timeMs: t, text: content })
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}
