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
  it('returns null when nothing matches (avoids the wrong song)', () => {
    expect(pickGeniusUrl(json, 'Nobody', 'Nothing')).toBeNull()
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
  it('strips genius contributor header, "you might also like", and trailing embed', () => {
    const html = '<div data-lyrics-container="true">7 ContributorsAZERTY Lyrics<br/>First line<br/>You might also likeSecond line<br/>Last line3Embed</div>'
    expect(extractGeniusLyrics(html)).toBe('First line\nSecond line\nLast line')
  })
  it('strips a bare contributor-count header without the word "Lyrics"', () => {
    const html = '<div data-lyrics-container>1 Contributor<br/>[Refrain]<br/>La coke, on la recoupe</div>'
    expect(extractGeniusLyrics(html)).toBe('[Refrain]\nLa coke, on la recoupe')
  })
  it('captures the full container despite a nested header <div> (modern Genius layout)', () => {
    const html = '<div data-lyrics-container="true"><div>7 Contributors</div><br/>[Intro]<br/>Real line one<br/>Real line two</div>'
    expect(extractGeniusLyrics(html)).toBe('[Intro]\nReal line one\nReal line two')
  })
  it('returns null when no lyrics container present', () => {
    expect(extractGeniusLyrics('<div>nope</div>')).toBeNull()
  })
})
