import { normalizeForMatch, makeTrackId } from './normalize'

describe('normalizeForMatch', () => {
  it('lowercases and strips feat/parentheses/punctuation', () => {
    expect(normalizeForMatch('Red Flags (feat. X) [Remastered]')).toBe('red flags')
    expect(normalizeForMatch('Brittany  Howard  ')).toBe('brittany howard')
    expect(normalizeForMatch('Café — Déjà')).toBe('cafe deja')
  })
  it('does not strip a leading "with"', () => {
    expect(normalizeForMatch('With Or Without You')).toBe('with or without you')
  })
  it('strips an un-parenthesized trailing feat/ft section', () => {
    expect(normalizeForMatch('Some Song feat. Another Artist')).toBe('some song')
    expect(normalizeForMatch('Some Song ft. X')).toBe('some song')
  })
})

describe('makeTrackId', () => {
  it('is stable and duration-bucketed to the second', () => {
    const a = makeTrackId('Brittany Howard', 'Red Flags', 208400)
    const b = makeTrackId('brittany howard', 'RED FLAGS', 208900)
    expect(a).toBe(b)
    expect(a).toBe('brittany howard|red flags|208')
  })
})
