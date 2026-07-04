import { buildGeniusSearchUrl, pickGeniusUrl, extractGeniusLyrics } from './genius'

describe('buildGeniusSearchUrl', () => {
  it('encodes artist + title into the search endpoint', () => {
    const u = new URL(buildGeniusSearchUrl('Brittany Howard', 'Red Flags'))
    expect(u.host).toBe('genius.com')
    expect(u.pathname).toBe('/api/search')
    expect(u.searchParams.get('q')).toBe('Brittany Howard Red Flags')
  })
})

describe('pickGeniusUrl', () => {
  const json = { response: { hits: [
    { result: { url: 'https://genius.com/x-other-lyrics', title: 'Other', primary_artist: { name: 'X' } } },
    { result: { url: 'https://genius.com/brittany-howard-red-flags-lyrics', title: 'Red Flags', primary_artist: { name: 'Brittany Howard' } } },
  ] } }
  it('prefers the hit matching artist + title', () => {
    expect(pickGeniusUrl(json, 'Brittany Howard', 'Red Flags')).toBe('https://genius.com/brittany-howard-red-flags-lyrics')
  })
  it('falls back to the first hit when nothing matches', () => {
    expect(pickGeniusUrl(json, 'Nobody', 'Nothing')).toBe('https://genius.com/x-other-lyrics')
  })
  it('returns null on empty/invalid', () => {
    expect(pickGeniusUrl({ response: { hits: [] } }, 'a', 'b')).toBeNull()
    expect(pickGeniusUrl(null, 'a', 'b')).toBeNull()
  })
})

describe('extractGeniusLyrics', () => {
  it('extracts containers, converts <br> to newlines, strips tags, decodes entities', () => {
    const html = '<div data-lyrics-container="true" class="x">Line one<br/>Don&#x27;t stop<br/><a href="#">Line</a> three</div>'
    expect(extractGeniusLyrics(html)).toBe("Line one\nDon't stop\nLine three")
  })
  it('decodes numeric entities', () => {
    expect(extractGeniusLyrics('<div data-lyrics-container>I&#8217;m</div>')).toBe('I’m')
  })
  it('returns null when no lyrics container present', () => {
    expect(extractGeniusLyrics('<div>nope</div>')).toBeNull()
  })
})
