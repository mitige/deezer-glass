import { parseLrc } from './lrc'

describe('parseLrc', () => {
  it('parses timestamped lines and sorts them', () => {
    const lrc = '[00:12.50]line b\n[00:03.20]line a\n[ar:Someone]\n'
    expect(parseLrc(lrc)).toEqual([
      { timeMs: 3200, text: 'line a' },
      { timeMs: 12500, text: 'line b' },
    ])
  })
  it('expands multiple timestamps on one line', () => {
    expect(parseLrc('[00:01.00][00:05.00]hey')).toEqual([
      { timeMs: 1000, text: 'hey' },
      { timeMs: 5000, text: 'hey' },
    ])
  })
  it('keeps empty lines as instrumental gaps and drops metadata tags', () => {
    expect(parseLrc('[al:Album]\n[00:02.00]')).toEqual([{ timeMs: 2000, text: '' }])
  })
})
