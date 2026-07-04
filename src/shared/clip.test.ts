import { buildSearchEmbedUrl, buildIdEmbedUrl, extractVideoId } from './clip'

describe('clip urls', () => {
  it('search embed is muted, autoplay, nocookie', () => {
    const u = new URL(buildSearchEmbedUrl('Brittany Howard', 'Red Flags'))
    expect(u.host).toBe('www.youtube-nocookie.com')
    expect(u.searchParams.get('listType')).toBe('search')
    expect(u.searchParams.get('list')).toBe('Brittany Howard Red Flags official video')
    expect(u.searchParams.get('mute')).toBe('1')
    expect(u.searchParams.get('autoplay')).toBe('1')
  })
  it('id embed targets a specific video', () => {
    expect(buildIdEmbedUrl('abc123')).toContain('/embed/abc123')
  })
})

describe('extractVideoId', () => {
  it('pulls the first videoId from results html', () => {
    expect(extractVideoId('...,"videoId":"dQw4w9WgXcQ","foo"...')).toBe('dQw4w9WgXcQ')
  })
  it('returns null when absent', () => {
    expect(extractVideoId('nothing here')).toBeNull()
  })
})
