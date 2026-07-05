import { buildMxmTokenUrl, buildMxmSubtitleUrl, parseMusixmatchMacro } from './musixmatch'

describe('musixmatch urls', () => {
  it('token url targets the desktop app endpoint', () => {
    const u = new URL(buildMxmTokenUrl())
    expect(u.host).toBe('apic-desktop.musixmatch.com')
    expect(u.pathname).toBe('/ws/1.1/token.get')
    expect(u.searchParams.get('app_id')).toBe('web-desktop-app-v1.0')
  })
  it('subtitle url carries artist, track and token', () => {
    const u = new URL(buildMxmSubtitleUrl('PNL', 'Au DD', 'TOK'))
    expect(u.pathname).toBe('/ws/1.1/macro.subtitles.get')
    expect(u.searchParams.get('q_artist')).toBe('PNL')
    expect(u.searchParams.get('q_track')).toBe('Au DD')
    expect(u.searchParams.get('usertoken')).toBe('TOK')
    expect(u.searchParams.get('subtitle_format')).toBe('lrc')
  })
})

describe('parseMusixmatchMacro', () => {
  const macro = (subtitle: string | null, lyrics: string | null, track?: { name: string; artist: string; length?: number }) => ({
    message: { body: { macro_calls: {
      'track.subtitles.get': { message: { body: { subtitle_list: subtitle ? [{ subtitle: { subtitle_body: subtitle } }] : [] } } },
      'track.lyrics.get': { message: { body: { lyrics: lyrics ? { lyrics_body: lyrics } : {} } } },
      'matcher.track.get': { message: { body: { track: track ? { track_name: track.name, artist_name: track.artist, track_length: track.length } : {} } } },
    } } },
  })
  it('parses a synced LRC subtitle', () => {
    const r = parseMusixmatchMacro(macro('[00:01.00]hi\n[00:03.50]yo', null))
    expect(r.synced).toEqual([{ timeMs: 1000, text: 'hi' }, { timeMs: 3500, text: 'yo' }])
  })
  it('falls back to plain lyrics_body', () => {
    const r = parseMusixmatchMacro(macro(null, 'plain words'))
    expect(r.synced).toBeNull()
    expect(r.plain).toBe('plain words')
  })
  it('exposes the matched track name, artist and length (for collision + duration checks)', () => {
    const r = parseMusixmatchMacro(macro('[00:01.00]x', null, { name: 'Au DD', artist: 'PNL', length: 247 }))
    expect(r.matchedTitle).toBe('Au DD')
    expect(r.matchedArtist).toBe('PNL')
    expect(r.matchedLength).toBe(247)
  })
  it('returns nulls on empty', () => {
    expect(parseMusixmatchMacro({})).toEqual({ synced: null, plain: null, matchedTitle: null, matchedArtist: null, matchedLength: null })
  })
})
