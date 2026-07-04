# Deezer Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows Electron app that mirrors Deezer's current track via Windows SMTC and renders an Apple-Music-style liquid-glass "now playing" view (chameleon background, synced lyrics, optional in-screen YouTube clip).

**Architecture:** A Rust napi-rs addon subscribes to `GlobalSystemMediaTransportControlsSessionManager` and pushes normalized snapshots to the Electron main process, which forwards them to a Vite/TS renderer over IPC and serves lyrics (LRCLIB) + clip resolution (YouTube, keyless). The renderer owns all visuals and interpolates playback position locally each frame.

**Tech Stack:** Electron + electron-vite + TypeScript (renderer/main), Rust + napi-rs + `windows` crate (SMTC addon), Vitest (unit tests), electron-builder (NSIS installer). Windows-only.

**Spec:** `docs/specs/2026-07-04-deezer-glass-design.md`

---

## File structure (locked decomposition)

Pure, IO-free logic lives in `src/shared/*` so it is unit-testable without Electron. IO wrappers (net, fs, canvas, DOM) import those cores.

```
package.json                     scripts, deps, file: dep on the addon
tsconfig.json  vitest.config.ts  electron.vite.config.ts  electron-builder.yml
src/
  shared/                        PURE, no electron/DOM imports — all unit-tested
    types.ts                     NowPlaying, LyricLine, Lyrics, ClipResult
    normalize.ts                 normalizeForMatch, makeTrackId
    playback.ts                  interpolatePosition
    lrc.ts                       parseLrc
    lrclib.ts                    buildLrclibGetUrl, mapLrclibResponse
    clip.ts                      buildSearchEmbedUrl, extractVideoId
    palette.ts                   quantize (dominant/vibrant/dark from pixels)
  main/
    index.ts                     app lifecycle + BrowserWindow (frameless)
    smtc.ts                      load addon, attach trackId, forward via IPC
    ipc.ts                       invoke handlers: lyrics:get, clip:resolve, win:*
    lyrics.ts                    fetch LRCLIB + disk cache (wraps shared/lrc+lrclib)
    clip.ts                      resolve YouTube (wraps shared/clip) + fallback
    store.ts                     userData JSON: window bounds + lyrics cache
  preload/
    index.ts                     contextBridge -> window.np
  renderer/
    index.html                   CSP + root markup
    main.ts                      bootstrap, IPC subscription, wire modules
    state.ts                     in-memory state + rAF tick
    ui/
      background.ts              blurred drifting art + palette veil + crossfade
      glass.ts                   liquid-glass panel wiring
      lyrics.ts                  synced lyric column: highlight + scroll + states
      clip.ts                    pochette <-> muted YouTube iframe swap + sync
      palette.ts                 canvas sampling -> shared/quantize -> CSS vars
      progress.ts               progress bar + times
      chrome.ts                 frameless controls + drag region
      refraction.ts             OPTIONAL WebGL hero refraction (Phase 10)
    styles/
      app.css                   dark scene, layout grid, glass CSS
      glass.svg                 feTurbulence + feDisplacementMap filter
native/smtc/                     Rust napi-rs addon (own package @deezer-glass/smtc)
  Cargo.toml  build.rs  package.json
  src/lib.rs                     SMTC bridge
build/                           icons + electron-builder resources
scripts/smtc-smoke.mjs           manual SMTC smoke test
```

---

## Phase 0 — Scaffolding

### Task 0.1: Project init

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `electron.vite.config.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "deezer-glass",
  "version": "0.1.0",
  "description": "Liquid-glass now-playing visualizer for Deezer (Windows/SMTC)",
  "author": "mitige",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:native": "napi build --release --cargo-cwd native/smtc --js false native/smtc",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke:smtc": "node scripts/smtc-smoke.mjs",
    "dist": "npm run build:native && electron-vite build && electron-builder --win nsis"
  },
  "dependencies": {
    "@deezer-glass/smtc": "file:native/smtc"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2.18.4",
    "electron": "^34.0.0",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Note: pin to current stable at implementation time if these have advanced; keep the majors compatible (electron-vite 2 + vite 5 + vitest 2).

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "scripts", "*.config.ts"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['src/shared/**/*.test.ts'] }
})
```

- [ ] **Step 4: Write `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {}
})
```

`externalizeDepsPlugin` keeps `@deezer-glass/smtc` (a `.node` addon) out of the bundle so it is `require`d at runtime.

- [ ] **Step 5: Create the native package stub so the `file:` dep resolves at install time**

`npm install` needs `native/smtc/package.json` to exist to link `@deezer-glass/smtc` (the `.node` binary is not required until runtime in Phase 3). Create `native/smtc/package.json`:

```json
{
  "name": "@deezer-glass/smtc",
  "version": "0.1.0",
  "main": "index.js",
  "types": "index.d.ts",
  "napi": { "name": "smtc", "triples": { "defaults": false, "additional": ["x86_64-pc-windows-msvc"] } },
  "files": ["index.js", "index.d.ts", "*.node"]
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: succeeds; `@deezer-glass/smtc` links to `native/smtc/` (a warning about the missing `main`/`.node` is fine — it is built in Phase 2). `node_modules` now has vitest/electron/electron-vite available.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts electron.vite.config.ts native/smtc/package.json
git commit -m "chore: project scaffolding (electron-vite + vitest + ts config)"
```

---

## Phase 1 — Pure logic (TDD)

All modules here are pure and import nothing from electron/DOM. Run each test file to see it fail, implement, see it pass, commit.

### Task 1.1: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'none'

export interface NowPlaying {
  trackId: string
  title: string
  artist: string
  album: string
  artDataUrl: string | null
  positionMs: number
  durationMs: number
  lastUpdatedMs: number
  rate: number
  status: PlaybackStatus
}

export interface LyricLine { timeMs: number; text: string }
export interface Lyrics { synced: LyricLine[] | null; plain: string | null; source: 'lrclib' }
export interface ClipResult { embedUrl: string | null; videoId: string | null }

export interface Palette { dominant: string; vibrant: string; dark: string; ink: string }
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): core data types"
```

### Task 1.2: normalize + trackId

**Files:**
- Create: `src/shared/normalize.ts`, `src/shared/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { normalizeForMatch, makeTrackId } from './normalize'

describe('normalizeForMatch', () => {
  it('lowercases and strips feat/parentheses/punctuation', () => {
    expect(normalizeForMatch('Red Flags (feat. X) [Remastered]')).toBe('red flags')
    expect(normalizeForMatch('Brittany  Howard  ')).toBe('brittany howard')
    expect(normalizeForMatch('Café — Déjà')).toBe('cafe deja')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/normalize.test.ts`
Expected: FAIL ("Cannot find module './normalize'").

- [ ] **Step 3: Implement**

```ts
export function normalizeForMatch(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(feat|ft|featuring|with)\b.*$/g, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function makeTrackId(artist: string, title: string, durationMs: number): string {
  const sec = Math.floor((durationMs || 0) / 1000)
  return `${normalizeForMatch(artist)}|${normalizeForMatch(title)}|${sec}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/normalize.ts src/shared/normalize.test.ts
git commit -m "feat(shared): normalizeForMatch + makeTrackId (TDD)"
```

### Task 1.3: interpolatePosition

**Files:**
- Create: `src/shared/playback.ts`, `src/shared/playback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { interpolatePosition } from './playback'
import type { NowPlaying } from './types'

const base: NowPlaying = {
  trackId: 'x', title: '', artist: '', album: '', artDataUrl: null,
  positionMs: 10_000, durationMs: 60_000, lastUpdatedMs: 1_000_000, rate: 1, status: 'playing'
}

describe('interpolatePosition', () => {
  it('advances while playing', () => {
    expect(interpolatePosition(base, 1_003_000)).toBe(13_000)
  })
  it('does not advance while paused', () => {
    expect(interpolatePosition({ ...base, status: 'paused' }, 1_003_000)).toBe(10_000)
  })
  it('clamps to [0, duration]', () => {
    expect(interpolatePosition(base, 9_999_999_999)).toBe(60_000)
    expect(interpolatePosition({ ...base, positionMs: 0, lastUpdatedMs: 2_000_000 }, 1_000_000)).toBe(0)
  })
  it('honors rate', () => {
    expect(interpolatePosition({ ...base, rate: 2 }, 1_002_000)).toBe(14_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/playback.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { NowPlaying } from './types'

export function interpolatePosition(np: NowPlaying, nowMs: number): number {
  if (np.status !== 'playing') return clamp(np.positionMs, 0, np.durationMs)
  const elapsed = (nowMs - np.lastUpdatedMs) * (np.rate || 1)
  return clamp(np.positionMs + elapsed, 0, np.durationMs)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/playback.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/playback.ts src/shared/playback.test.ts
git commit -m "feat(shared): interpolatePosition (TDD)"
```

### Task 1.4: parseLrc

**Files:**
- Create: `src/shared/lrc.ts`, `src/shared/lrc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lrc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
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
    if (stamps.length === 0) continue // metadata tag or blank -> skip
    const content = raw.replace(STAMP, '').trim()
    for (const t of stamps) out.push({ timeMs: t, text: content })
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lrc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lrc.ts src/shared/lrc.test.ts
git commit -m "feat(shared): LRC parser (TDD)"
```

### Task 1.5: LRCLIB url + response mapping

**Files:**
- Create: `src/shared/lrclib.ts`, `src/shared/lrclib.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildLrclibGetUrl, mapLrclibResponse } from './lrclib'

describe('buildLrclibGetUrl', () => {
  it('builds a get query with seconds duration', () => {
    const u = new URL(buildLrclibGetUrl({ artist: 'A B', title: 'T (live)', album: 'Al', durationMs: 208_400 }))
    expect(u.origin + u.pathname).toBe('https://lrclib.net/api/get')
    expect(u.searchParams.get('artist_name')).toBe('A B')
    expect(u.searchParams.get('track_name')).toBe('T (live)')
    expect(u.searchParams.get('duration')).toBe('208')
  })
})

describe('mapLrclibResponse', () => {
  it('prefers synced lyrics', () => {
    const r = mapLrclibResponse({ syncedLyrics: '[00:01.00]hi', plainLyrics: 'hi' })
    expect(r.synced).toEqual([{ timeMs: 1000, text: 'hi' }])
    expect(r.source).toBe('lrclib')
  })
  it('falls back to plain', () => {
    expect(mapLrclibResponse({ syncedLyrics: null, plainLyrics: 'hi' }).synced).toBeNull()
    expect(mapLrclibResponse({ syncedLyrics: null, plainLyrics: 'hi' }).plain).toBe('hi')
  })
  it('handles empty/none', () => {
    expect(mapLrclibResponse(null)).toEqual({ synced: null, plain: null, source: 'lrclib' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lrclib.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { parseLrc } from './lrc'
import type { Lyrics } from './types'

export interface LrclibQuery { artist: string; title: string; album: string; durationMs: number }

export function buildLrclibGetUrl(q: LrclibQuery): string {
  const p = new URLSearchParams({
    artist_name: q.artist,
    track_name: q.title,
    album_name: q.album,
    duration: String(Math.floor((q.durationMs || 0) / 1000)),
  })
  return `https://lrclib.net/api/get?${p.toString()}`
}

export function mapLrclibResponse(r: { syncedLyrics?: string | null; plainLyrics?: string | null } | null): Lyrics {
  const synced = r?.syncedLyrics ? parseLrc(r.syncedLyrics) : null
  return {
    synced: synced && synced.length ? synced : null,
    plain: r?.plainLyrics ?? null,
    source: 'lrclib',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lrclib.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lrclib.ts src/shared/lrclib.test.ts
git commit -m "feat(shared): LRCLIB url + response mapping (TDD)"
```

### Task 1.6: clip url + videoId extraction

**Files:**
- Create: `src/shared/clip.ts`, `src/shared/clip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/clip.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
const BASE = 'https://www.youtube-nocookie.com'
const COMMON = 'autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1'

export function buildSearchEmbedUrl(artist: string, title: string): string {
  const q = `${artist} ${title} official video`.trim()
  return `${BASE}/embed?listType=search&list=${encodeURIComponent(q)}&${COMMON}`
}

export function buildIdEmbedUrl(videoId: string): string {
  return `${BASE}/embed/${encodeURIComponent(videoId)}?${COMMON}`
}

export function extractVideoId(html: string): string | null {
  const m = html.match(/"videoId":"([\w-]{11})"/)
  return m ? m[1] : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/clip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/clip.ts src/shared/clip.test.ts
git commit -m "feat(shared): youtube clip urls + videoId extraction (TDD)"
```

### Task 1.7: palette quantize (chameleon math)

**Files:**
- Create: `src/shared/palette.ts`, `src/shared/palette.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { quantize } from './palette'

// 2x1 image: one strong orange pixel, one near-black pixel (RGBA)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/palette.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
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
    const r = px[i], g = px[i + 1], b = px[i + 2]
    sr += r; sg += g; sb += b; n++
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/palette.test.ts`
Expected: PASS. (If `vibrant` differs, adjust the weighting constant and update the test to the produced value — the exact hex is implementation-defined; keep the assertion pinned to whatever the code yields.)

- [ ] **Step 5: Run the whole suite + commit**

Run: `npm test`
Expected: all shared tests PASS.

```bash
git add src/shared/palette.ts src/shared/palette.test.ts
git commit -m "feat(shared): palette quantize for chameleon coloring (TDD)"
```

---

## Phase 2 — Rust SMTC addon

This phase has no unit tests (WinRT integration); it is verified with a manual smoke script against a running Deezer.

### Task 2.1: Addon crate scaffold + build

**Files:**
- Create: `native/smtc/Cargo.toml`, `native/smtc/build.rs`, `native/smtc/package.json`, `native/smtc/src/lib.rs`

- [ ] **Step 1: Write `native/smtc/Cargo.toml`**

```toml
[package]
name = "smtc"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", default-features = false, features = ["napi6"] }
napi-derive = "2"
base64 = "0.22"

[dependencies.windows]
version = "0.58"
features = [
  "Media_Control",
  "Foundation",
  "Foundation_Collections",
  "Storage_Streams",
  "Win32_System_Com",
]

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
strip = true
```

- [ ] **Step 2: Write `native/smtc/build.rs`**

```rust
fn main() {
  napi_build::setup();
}
```

- [ ] **Step 3: Verify `native/smtc/package.json`**

This file was already created in Task 0.1 Step 5 (so `npm install` could link the `file:` dep). Confirm it exists and matches:

```json
{
  "name": "@deezer-glass/smtc",
  "version": "0.1.0",
  "main": "index.js",
  "types": "index.d.ts",
  "napi": { "name": "smtc", "triples": { "defaults": false, "additional": ["x86_64-pc-windows-msvc"] } },
  "files": ["index.js", "index.d.ts", "*.node"]
}
```

- [ ] **Step 4: Write a minimal `native/smtc/src/lib.rs` (compiles, exports start/stop stubs)**

```rust
#![deny(clippy::all)]
use napi_derive::napi;

#[napi(object)]
pub struct NowPlaying {
  pub title: String,
  pub artist: String,
  pub album: String,
  pub art_data_url: Option<String>,
  pub position_ms: f64,
  pub duration_ms: f64,
  pub last_updated_ms: f64,
  pub rate: f64,
  pub status: String,
}

#[napi]
pub fn start(_callback: napi::JsFunction) -> napi::Result<()> {
  Ok(())
}

#[napi]
pub fn stop() {}
```

- [ ] **Step 5: Build the addon and install deps**

Run:
```bash
npx napi build --release --cargo-cwd native/smtc --js false native/smtc
npm install
```
Expected: `native/smtc/smtc.win32-x64-msvc.node` + `index.js` + `index.d.ts` are generated; `npm install` links the `file:` dep. `index.d.ts` should declare `start`, `stop`, and `NowPlaying` with camelCase fields (`artDataUrl`, `positionMs`, …).

- [ ] **Step 6: Commit**

```bash
git add native/smtc/Cargo.toml native/smtc/build.rs native/smtc/package.json native/smtc/src/lib.rs native/smtc/index.js native/smtc/index.d.ts package-lock.json
git commit -m "feat(native): smtc addon scaffold (napi-rs + windows crate)"
```

### Task 2.2: Implement the SMTC subscription

The addon spawns a dedicated MTA-COM thread that requests the session manager, hooks session/timeline/playback/media change events, and pushes a `NowPlaying` snapshot to JS via a threadsafe function on every change.

**Files:**
- Modify: `native/smtc/src/lib.rs`
- Create: `scripts/smtc-smoke.mjs`

- [ ] **Step 1: Replace `native/smtc/src/lib.rs` with the full implementation**

```rust
#![deny(clippy::all)]
use base64::Engine;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::JsFunction;
use napi_derive::napi;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use windows::core::TypedEventHandler;
use windows::Foundation::EventRegistrationToken;
use windows::Media::Control::{
  GlobalSystemMediaTransportControlsSession as Session,
  GlobalSystemMediaTransportControlsSessionManager as SessionManager,
  GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{DataReader, InputStreamOptions};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

type Tsfn = ThreadsafeFunction<NowPlaying, ErrorStrategy::Fatal>;

#[napi(object)]
pub struct NowPlaying {
  pub title: String,
  pub artist: String,
  pub album: String,
  pub art_data_url: Option<String>,
  pub position_ms: f64,
  pub duration_ms: f64,
  pub last_updated_ms: f64,
  pub rate: f64,
  pub status: String,
}

static RUNNING: AtomicBool = AtomicBool::new(false);

#[napi]
pub fn start(callback: JsFunction) -> napi::Result<()> {
  let tsfn: Tsfn = callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
  RUNNING.store(true, Ordering::SeqCst);
  std::thread::spawn(move || {
    unsafe {
      let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    if let Err(e) = run(tsfn) {
      eprintln!("[smtc] fatal: {e:?}");
    }
  });
  Ok(())
}

#[napi]
pub fn stop() {
  RUNNING.store(false, Ordering::SeqCst);
}

fn run(tsfn: Tsfn) -> windows::core::Result<()> {
  let manager = SessionManager::RequestAsync()?.get()?;
  let hooked: Arc<Mutex<Option<(Session, Vec<EventRegistrationToken>)>>> = Arc::new(Mutex::new(None));

  let rehook = {
    let hooked = hooked.clone();
    let tsfn = tsfn.clone();
    move |mgr: &SessionManager| -> windows::core::Result<()> {
      let mut guard = hooked.lock().unwrap();
      if let Some((old, tokens)) = guard.take() {
        let _ = old.RemoveMediaPropertiesChanged(tokens[0]);
        let _ = old.RemovePlaybackInfoChanged(tokens[1]);
        let _ = old.RemoveTimelinePropertiesChanged(tokens[2]);
      }
      match mgr.GetCurrentSession() {
        Ok(session) => {
          let emit = {
            let tsfn = tsfn.clone();
            move |s: &Session| {
              if let Ok(np) = snapshot(s) {
                if RUNNING.load(Ordering::SeqCst) {
                  tsfn.call(np, ThreadsafeFunctionCallMode::NonBlocking);
                }
              }
            }
          };
          let t0 = session.MediaPropertiesChanged(&TypedEventHandler::new({
            let emit = emit.clone();
            move |s: &Option<Session>, _| { if let Some(s) = s { emit(s) } Ok(()) }
          }))?;
          let t1 = session.PlaybackInfoChanged(&TypedEventHandler::new({
            let emit = emit.clone();
            move |s: &Option<Session>, _| { if let Some(s) = s { emit(s) } Ok(()) }
          }))?;
          let t2 = session.TimelinePropertiesChanged(&TypedEventHandler::new({
            let emit = emit.clone();
            move |s: &Option<Session>, _| { if let Some(s) = s { emit(s) } Ok(()) }
          }))?;
          emit(&session); // initial snapshot
          *guard = Some((session, vec![t0, t1, t2]));
        }
        Err(_) => {
          tsfn.call(none_snapshot(), ThreadsafeFunctionCallMode::NonBlocking);
        }
      }
      Ok(())
    }
  };

  rehook(&manager)?;
  let rehook = Arc::new(rehook);
  {
    let rehook = rehook.clone();
    manager.CurrentSessionChanged(&TypedEventHandler::new(move |m: &Option<SessionManager>, _| {
      if let Some(m) = m { let _ = rehook(m); }
      Ok(())
    }))?;
  }

  // Keep the thread (and thus event subscriptions) alive for the process lifetime.
  loop {
    if !RUNNING.load(Ordering::SeqCst) {
      std::thread::sleep(std::time::Duration::from_millis(250));
      continue;
    }
    std::thread::sleep(std::time::Duration::from_millis(500));
  }
}

fn none_snapshot() -> NowPlaying {
  NowPlaying {
    title: String::new(), artist: String::new(), album: String::new(), art_data_url: None,
    position_ms: 0.0, duration_ms: 0.0, last_updated_ms: 0.0, rate: 1.0, status: "none".into(),
  }
}

fn snapshot(session: &Session) -> windows::core::Result<NowPlaying> {
  let media = session.TryGetMediaPropertiesAsync()?.get()?;
  let title = media.Title().unwrap_or_default().to_string();
  let artist = media.Artist().unwrap_or_default().to_string();
  let album = media.AlbumTitle().unwrap_or_default().to_string();
  let art_data_url = read_thumbnail(session).ok().flatten();

  let info = session.GetPlaybackInfo()?;
  let status = match info.PlaybackStatus()? {
    PlaybackStatus::Playing => "playing",
    PlaybackStatus::Paused => "paused",
    PlaybackStatus::Stopped | PlaybackStatus::Closed => "stopped",
    _ => "none",
  };
  let rate = info.PlaybackRate().ok().and_then(|r| r.Value().ok()).unwrap_or(1.0);

  let tl = session.GetTimelineProperties()?;
  let position_ms = (tl.Position()?.Duration as f64) / 10_000.0;
  let duration_ms = (tl.EndTime()?.Duration as f64) / 10_000.0;
  // DateTime.UniversalTime = 100ns ticks since 1601-01-01; convert to unix ms.
  let last_updated_ms = (tl.LastUpdatedTime()?.UniversalTime as f64 - 116_444_736_000_000_000.0) / 10_000.0;

  Ok(NowPlaying {
    title, artist, album, art_data_url,
    position_ms, duration_ms, last_updated_ms, rate,
    status: status.into(),
  })
}

fn read_thumbnail(session: &Session) -> windows::core::Result<Option<String>> {
  let media = session.TryGetMediaPropertiesAsync()?.get()?;
  let Ok(reference) = media.Thumbnail() else { return Ok(None) };
  let stream = reference.OpenReadAsync()?.get()?;
  let size = stream.Size()? as u32;
  if size == 0 { return Ok(None) }
  let content_type = stream.ContentType().unwrap_or_default().to_string();
  let mime = if content_type.is_empty() { "image/jpeg".to_string() } else { content_type };
  let input = stream.GetInputStreamAt(0)?;
  let reader = DataReader::CreateDataReader(&input)?;
  reader.SetInputStreamOptions(InputStreamOptions::None)?;
  reader.LoadAsync(size)?.get()?;
  let mut buf = vec![0u8; size as usize];
  reader.ReadBytes(&mut buf)?;
  let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
  Ok(Some(format!("data:{mime};base64,{b64}")))
}
```

Note: the `windows` crate evolves; if a method name or the `EventRegistrationToken`/`TypedEventHandler` import path differs on the pinned version, adjust to the compiler's suggestion — the shape (request manager → hook 4 events → snapshot) stays identical.

- [ ] **Step 2: Write the smoke script `scripts/smtc-smoke.mjs`**

```js
import { start } from '../native/smtc/index.js'

console.log('Listening to SMTC for 25s — play/pause/skip in Deezer…')
start((np) => {
  const pos = (np.positionMs / 1000).toFixed(1)
  const dur = (np.durationMs / 1000).toFixed(1)
  console.log(`[${np.status}] ${np.artist} — ${np.title}  ${pos}/${dur}s  art:${np.artDataUrl ? 'yes' : 'no'}`)
})
setTimeout(() => process.exit(0), 25_000)
```

- [ ] **Step 3: Rebuild and run the smoke test with Deezer playing**

Run:
```bash
npm run build:native
node scripts/smtc-smoke.mjs
```
Expected: lines print as Deezer plays; status flips on pause; a new title prints on skip; `art:yes` when a cover is present. If nothing prints, confirm Deezer (desktop app or browser tab) is the active media session (it must show in the Windows volume/media overlay).

- [ ] **Step 4: Commit**

```bash
git add native/smtc/src/lib.rs scripts/smtc-smoke.mjs
git commit -m "feat(native): live SMTC subscription -> NowPlaying snapshots"
```

---

## Phase 3 — Main ↔ renderer wiring

### Task 3.1: main/smtc.ts — load addon, attach trackId, forward

**Files:**
- Create: `src/main/smtc.ts`

- [ ] **Step 1: Implement**

```ts
import type { BrowserWindow } from 'electron'
import { start } from '@deezer-glass/smtc'
import { makeTrackId } from '../shared/normalize'
import type { NowPlaying, PlaybackStatus } from '../shared/types'

export function attachSmtc(win: BrowserWindow): void {
  start((raw: Omit<NowPlaying, 'trackId'>) => {
    const np: NowPlaying = {
      ...raw,
      status: raw.status as PlaybackStatus,
      trackId: makeTrackId(raw.artist, raw.title, raw.durationMs),
    }
    if (!win.isDestroyed()) win.webContents.send('nowplaying:update', np)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/smtc.ts
git commit -m "feat(main): forward SMTC snapshots to renderer with trackId"
```

### Task 3.2: main/lyrics.ts, main/clip.ts, main/store.ts

**Files:**
- Create: `src/main/store.ts`, `src/main/lyrics.ts`, `src/main/clip.ts`

- [ ] **Step 1: Implement `src/main/store.ts`**

```ts
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = () => app.getPath('userData')
const file = (name: string) => join(dir(), name)

function readJson<T>(name: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file(name), 'utf8')) as T } catch { return fallback }
}
function writeJson(name: string, value: unknown): void {
  try { mkdirSync(dir(), { recursive: true }); writeFileSync(file(name), JSON.stringify(value)) } catch {}
}

export interface Bounds { x?: number; y?: number; width: number; height: number }
export const loadBounds = (): Bounds => readJson('bounds.json', { width: 1120, height: 680 })
export const saveBounds = (b: Bounds) => writeJson('bounds.json', b)

type LyricsCache = Record<string, unknown>
export const loadLyricsCache = (): LyricsCache => readJson('lyrics-cache.json', {})
export const saveLyricsCache = (c: LyricsCache) => writeJson('lyrics-cache.json', c)
```

- [ ] **Step 2: Implement `src/main/lyrics.ts`**

```ts
import { buildLrclibGetUrl, mapLrclibResponse } from '../shared/lrclib'
import type { Lyrics } from '../shared/types'
import { loadLyricsCache, saveLyricsCache } from './store'

const mem = new Map<string, Lyrics>()
const cache = loadLyricsCache() as Record<string, Lyrics>

export async function getLyrics(track: {
  trackId: string; artist: string; title: string; album: string; durationMs: number
}): Promise<Lyrics> {
  if (mem.has(track.trackId)) return mem.get(track.trackId)!
  if (cache[track.trackId]) { mem.set(track.trackId, cache[track.trackId]); return cache[track.trackId] }

  let result: Lyrics = { synced: null, plain: null, source: 'lrclib' }
  try {
    const res = await fetch(buildLrclibGetUrl(track), { headers: { 'User-Agent': 'deezer-glass/0.1' } })
    if (res.ok) result = mapLrclibResponse(await res.json())
  } catch { /* offline -> empty result */ }

  mem.set(track.trackId, result)
  cache[track.trackId] = result
  saveLyricsCache(cache)
  return result
}
```

- [ ] **Step 3: Implement `src/main/clip.ts`**

```ts
import { buildSearchEmbedUrl, buildIdEmbedUrl, extractVideoId } from '../shared/clip'
import type { ClipResult } from '../shared/types'

export async function resolveClip(track: { artist: string; title: string }): Promise<ClipResult> {
  // Fallback resolver first (robust to listType=search deprecation); on failure, use search embed.
  try {
    const q = encodeURIComponent(`${track.artist} ${track.title} official video`)
    const res = await fetch(`https://www.youtube.com/results?search_query=${q}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
    })
    if (res.ok) {
      const id = extractVideoId(await res.text())
      if (id) return { embedUrl: buildIdEmbedUrl(id), videoId: id }
    }
  } catch { /* fall through */ }
  return { embedUrl: buildSearchEmbedUrl(track.artist, track.title), videoId: null }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/store.ts src/main/lyrics.ts src/main/clip.ts
git commit -m "feat(main): lyrics (LRCLIB+cache), clip resolver, userData store"
```

### Task 3.3: main/ipc.ts + preload

**Files:**
- Create: `src/main/ipc.ts`, `src/preload/index.ts`

- [ ] **Step 1: Implement `src/main/ipc.ts`**

```ts
import { ipcMain, BrowserWindow } from 'electron'
import { getLyrics } from './lyrics'
import { resolveClip } from './clip'

export function registerIpc(): void {
  ipcMain.handle('lyrics:get', (_e, track) => getLyrics(track))
  ipcMain.handle('clip:resolve', (_e, track) => resolveClip(track))
  ipcMain.handle('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.handle('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('win:toggleFullscreen', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) w.setFullScreen(!w.isFullScreen())
  })
}
```

- [ ] **Step 2: Implement `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { NowPlaying, Lyrics, ClipResult } from '../shared/types'

type Track = { trackId: string; artist: string; title: string; album: string; durationMs: number }

contextBridge.exposeInMainWorld('np', {
  onUpdate: (cb: (np: NowPlaying) => void) =>
    ipcRenderer.on('nowplaying:update', (_e, np: NowPlaying) => cb(np)),
  getLyrics: (t: Track): Promise<Lyrics> => ipcRenderer.invoke('lyrics:get', t),
  resolveClip: (t: { artist: string; title: string }): Promise<ClipResult> =>
    ipcRenderer.invoke('clip:resolve', t),
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    close: () => ipcRenderer.invoke('win:close'),
    toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
  },
})
```

- [ ] **Step 3: Create `src/renderer/global.d.ts` for the exposed API**

```ts
import type { NowPlaying, Lyrics, ClipResult } from '../shared/types'
type Track = { trackId: string; artist: string; title: string; album: string; durationMs: number }
declare global {
  interface Window {
    np: {
      onUpdate: (cb: (np: NowPlaying) => void) => void
      getLyrics: (t: Track) => Promise<Lyrics>
      resolveClip: (t: { artist: string; title: string }) => Promise<ClipResult>
      win: { minimize: () => void; close: () => void; toggleFullscreen: () => void }
    }
  }
}
export {}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat: IPC handlers + preload contextBridge API"
```

### Task 3.4: main/index.ts (frameless window) + minimal renderer

**Files:**
- Create: `src/main/index.ts`, `src/renderer/index.html`, `src/renderer/main.ts`, `src/renderer/state.ts`

- [ ] **Step 1: Implement `src/main/index.ts`**

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { attachSmtc } from './smtc'
import { registerIpc } from './ipc'
import { loadBounds, saveBounds } from './store'

function createWindow(): void {
  const b = loadBounds()
  const win = new BrowserWindow({
    ...b,
    minWidth: 720, minHeight: 460,
    frame: false,
    backgroundColor: '#0b0f17',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  const persist = () => saveBounds(win.getBounds())
  win.on('resized', persist); win.on('moved', persist)

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  attachSmtc(win)
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

- [ ] **Step 2: Implement `src/renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; script-src 'self'" />
    <link rel="stylesheet" href="./styles/app.css" />
    <title>Deezer Glass</title>
  </head>
  <body>
    <div id="drag"></div>
    <main id="app">
      <section id="bg"></section>
      <div id="panel" class="glass">
        <div id="left">
          <div id="art"></div>
          <h1 id="title"></h1>
          <p id="artist"></p>
          <div id="progress"><div id="bar"></div></div>
          <div id="times"><span id="tcur">0:00</span><span id="trem">-0:00</span></div>
        </div>
        <div id="lyrics"></div>
      </div>
      <div id="controls"></div>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Implement `src/renderer/state.ts`**

```ts
import type { NowPlaying } from '../shared/types'
import { interpolatePosition } from '../shared/playback'

export interface AppState { np: NowPlaying | null }
export const state: AppState = { np: null }

type Tick = (posMs: number, np: NowPlaying) => void
const ticks = new Set<Tick>()
export const onTick = (t: Tick) => ticks.add(t)

export function startTicker(): void {
  const loop = () => {
    if (state.np) {
      const pos = interpolatePosition(state.np, Date.now())
      for (const t of ticks) t(pos, state.np)
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
```

- [ ] **Step 4: Implement a minimal `src/renderer/main.ts` (raw display to prove wiring)**

```ts
import './styles/app.css'
import { state, startTicker, onTick } from './state'
import type { NowPlaying } from '../shared/types'

const $ = (id: string) => document.getElementById(id)!

window.np.onUpdate((np: NowPlaying) => {
  state.np = np
  $('title').textContent = np.title || 'En attente de lecture'
  $('artist').textContent = np.artist
  $('art').style.backgroundImage = np.artDataUrl ? `url(${np.artDataUrl})` : 'none'
})

onTick((pos, np) => {
  const pct = np.durationMs ? (pos / np.durationMs) * 100 : 0
  $('bar').style.width = `${pct}%`
  $('tcur').textContent = fmt(pos)
  $('trem').textContent = '-' + fmt(Math.max(0, np.durationMs - pos))
})

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

startTicker()
```

- [ ] **Step 5: Add a minimal `src/renderer/styles/app.css` placeholder so the page loads**

```css
* { margin: 0; box-sizing: border-box; }
body { height: 100vh; overflow: hidden; background: #0b0f17; color: #fff; font-family: system-ui, sans-serif; }
#drag { position: fixed; top: 0; left: 0; right: 0; height: 40px; -webkit-app-region: drag; }
#app { height: 100vh; display: grid; place-items: center; }
#art { width: 200px; height: 200px; background-size: cover; border-radius: 12px; background-color: #223; }
#progress { width: 240px; height: 3px; background: rgba(255,255,255,.2); margin-top: 12px; }
#bar { height: 100%; width: 0; background: #fff; }
#times { display: flex; justify-content: space-between; width: 240px; font-size: 12px; opacity: .6; }
```

- [ ] **Step 6: Run the app with Deezer playing**

Run: `npm run dev`
Expected: a frameless window shows the current title/artist/cover; the progress bar advances smoothly and matches Deezer; pausing/skipping in Deezer updates the window.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/renderer/index.html src/renderer/main.ts src/renderer/state.ts src/renderer/styles/app.css
git commit -m "feat: frameless window + live now-playing wiring (end-to-end)"
```

---

## Phase 4 — Visual core (background, palette, progress)

### Task 4.1: palette.ts (canvas sampling → CSS vars)

**Files:**
- Create: `src/renderer/ui/palette.ts`

- [ ] **Step 1: Implement**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/palette.ts
git commit -m "feat(renderer): album-art palette extraction -> CSS vars"
```

### Task 4.2: background.ts (blurred drifting art + veil + crossfade)

**Files:**
- Create: `src/renderer/ui/background.ts`
- Modify: `src/renderer/styles/app.css` (append background + drift rules)

- [ ] **Step 1: Implement `src/renderer/ui/background.ts`**

```ts
const HOLD = new Map<string, HTMLElement>()

export function setBackground(artDataUrl: string | null, trackId: string): void {
  const bg = document.getElementById('bg')!
  if (bg.dataset.track === trackId) return
  bg.dataset.track = trackId

  const layer = document.createElement('div')
  layer.className = 'bg-layer'
  layer.style.backgroundImage = artDataUrl ? `url(${artDataUrl})` : 'none'
  layer.style.opacity = '0'
  bg.appendChild(layer)
  requestAnimationFrame(() => { layer.style.opacity = '1' })

  // Fade out and remove previous layers after the crossfade.
  for (const prev of Array.from(bg.querySelectorAll('.bg-layer'))) {
    if (prev !== layer) {
      ;(prev as HTMLElement).style.opacity = '0'
      setTimeout(() => prev.remove(), 800)
    }
  }
  HOLD.clear()
}
```

- [ ] **Step 2: Append to `src/renderer/styles/app.css`**

```css
#bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; background: var(--art-2, #12151d); }
.bg-layer {
  position: absolute; inset: -15%;
  background-size: cover; background-position: center;
  filter: blur(60px) saturate(140%) brightness(.7);
  transition: opacity .8s ease;
  animation: drift 34s ease-in-out infinite alternate;
}
.bg-layer::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(120% 90% at 75% 15%, var(--art-accent, transparent) 0%, transparent 55%);
  opacity: .35;
}
@keyframes drift {
  from { transform: scale(1.25) translate(-2%, -1%); }
  to   { transform: scale(1.4) translate(2%, 2%); }
}
```

- [ ] **Step 3: Wire into `src/renderer/main.ts`** (add near the `onUpdate` handler)

```ts
import { setBackground } from './ui/background'
import { applyPalette } from './ui/palette'

// inside window.np.onUpdate, after setting state.np:
if ($('title').dataset.track !== np.trackId) {
  $('title').dataset.track = np.trackId
  applyPalette(np.artDataUrl)
  setBackground(np.artDataUrl, np.trackId)
}
```

- [ ] **Step 4: Run and verify**

Run: `npm run dev`
Expected: background is the blurred cover, slowly drifting; it recolors and cross-fades when the track changes; the accent veil tints toward the cover's vibrant color.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ui/background.ts src/renderer/styles/app.css src/renderer/main.ts
git commit -m "feat(renderer): chameleon drifting background with crossfade"
```

### Task 4.3: progress.ts (extract progress into its own module)

**Files:**
- Create: `src/renderer/ui/progress.ts`
- Modify: `src/renderer/main.ts` (replace inline progress with the module)

- [ ] **Step 1: Implement `src/renderer/ui/progress.ts`**

```ts
import { onTick } from '../state'

export function initProgress(): void {
  const bar = document.getElementById('bar')!
  const tcur = document.getElementById('tcur')!
  const trem = document.getElementById('trem')!
  onTick((pos, np) => {
    bar.style.width = `${np.durationMs ? (pos / np.durationMs) * 100 : 0}%`
    tcur.textContent = fmt(pos)
    trem.textContent = '-' + fmt(Math.max(0, np.durationMs - pos))
  })
}
function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
```

- [ ] **Step 2: In `src/renderer/main.ts`, delete the inline `onTick(...)`/`fmt` block and call `initProgress()`** (leave the `onUpdate` handler intact)

```ts
import { initProgress } from './ui/progress'
// ...
initProgress()
startTicker()
```

- [ ] **Step 3: Run and verify**

Run: `npm run dev`
Expected: identical progress behavior, now modularized.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/ui/progress.ts src/renderer/main.ts
git commit -m "refactor(renderer): extract progress module"
```

---

## Phase 5 — Liquid glass (the centerpiece)

### Task 5.1: glass SVG filter + panel CSS

**Files:**
- Create: `src/renderer/styles/glass.svg`
- Modify: `src/renderer/index.html` (inline the filter + real layout), `src/renderer/styles/app.css`

- [ ] **Step 1: Add the SVG displacement filter inline at the top of `<body>` in `index.html`** (inline so no extra fetch; `width/height=0` hides it)

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="liquid" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="n" />
    <feGaussianBlur in="n" stdDeviation="1.5" result="ns" />
    <feDisplacementMap in="SourceGraphic" in2="ns" scale="16" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

- [ ] **Step 2: Replace the layout/glass rules in `src/renderer/styles/app.css`** (keep `#bg`/`.bg-layer` rules from Phase 4; replace the placeholder layout block)

```css
:root { --art-ink: #fff; }
#app { position: relative; z-index: 1; height: 100vh; padding: 26px; display: grid; place-items: center; }

.glass {
  position: relative; width: min(1040px, 100%); height: min(560px, 100%);
  display: grid; grid-template-columns: 38% 1fr; gap: 30px; padding: 30px;
  border-radius: 26px; overflow: hidden; color: var(--art-ink);
  background: rgba(255,255,255,0.07);
  backdrop-filter: blur(22px) saturate(185%);
  -webkit-backdrop-filter: blur(22px) saturate(185%);
  border: 1px solid rgba(255,255,255,0.24);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -30px 60px rgba(255,255,255,0.05), 0 24px 60px rgba(0,0,0,0.4);
}
/* Refraction: a displaced, blurred copy of the background shows through the glass. */
.glass::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  background: inherit;
  filter: url(#liquid);
  opacity: .6;
}
/* Specular sheen that slowly drifts for the "liquid" life. */
.glass::after {
  content: ''; position: absolute; top: -60%; left: -30%; width: 70%; height: 200%;
  background: linear-gradient(118deg, rgba(255,255,255,0.32), rgba(255,255,255,0) 58%);
  transform: rotate(9deg); pointer-events: none;
  animation: sheen 12s ease-in-out infinite alternate;
}
@keyframes sheen { from { transform: rotate(9deg) translateX(-6%); } to { transform: rotate(9deg) translateX(10%); } }

#left { display: flex; flex-direction: column; justify-content: center; }
#art { width: 100%; aspect-ratio: 1; height: auto; border-radius: 16px;
  box-shadow: 0 16px 34px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3); }
#title { font-size: 26px; font-weight: 600; margin-top: 18px; letter-spacing: .2px; }
#artist { font-size: 15px; opacity: .66; margin-top: 4px; }
#progress { height: 3px; border-radius: 3px; background: rgba(255,255,255,.22); margin-top: 18px; width: 100%; }
#bar { height: 100%; border-radius: 3px; background: var(--art-ink); }
#times { display: flex; justify-content: space-between; font-size: 12px; opacity: .55; margin-top: 7px; }
```

- [ ] **Step 3: Run and verify the glass**

Run: `npm run dev`
Expected: a large liquid-glass panel floats over the drifting cover; the background is visibly refracted/warped through the glass edge; a soft specular streak drifts across; text uses the cover's ink color. Tune `scale` (filter) and `baseFrequency` for more/less warp.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/styles/app.css src/renderer/styles/glass.svg
git commit -m "feat(renderer): spectacular liquid-glass panel (backdrop + displacement + sheen)"
```

---

## Phase 6 — Synced lyrics UI

### Task 6.1: lyrics.ts (fetch + highlight + scroll + states)

**Files:**
- Create: `src/renderer/ui/lyrics.ts`
- Modify: `src/renderer/main.ts`, `src/renderer/styles/app.css`

- [ ] **Step 1: Implement `src/renderer/ui/lyrics.ts`**

```ts
import type { NowPlaying, Lyrics, LyricLine } from '../../shared/types'
import { onTick } from '../state'

let lines: LyricLine[] = []
let plain: string | null = null
let activeIdx = -1
let currentTrack = ''

export function initLyrics(): void {
  onTick((pos) => {
    if (!lines.length) return
    let idx = -1
    for (let i = 0; i < lines.length; i++) { if (lines[i].timeMs <= pos) idx = i; else break }
    if (idx !== activeIdx) { activeIdx = idx; paintActive() }
  })
}

export async function loadLyricsFor(np: NowPlaying): Promise<void> {
  if (np.trackId === currentTrack) return
  currentTrack = np.trackId
  lines = []; plain = null; activeIdx = -1
  render(['…'])

  const res: Lyrics = await window.np.getLyrics({
    trackId: np.trackId, artist: np.artist, title: np.title, album: np.album, durationMs: np.durationMs,
  })
  if (np.trackId !== currentTrack) return // track changed while fetching

  if (res.synced && res.synced.length) { lines = res.synced; render(lines.map((l) => l.text || '♪')) }
  else if (res.plain) { plain = res.plain; render(res.plain.split(/\r?\n/)) }
  else render(['Paroles indisponibles'])
}

function render(texts: string[]): void {
  const box = document.getElementById('lyrics')!
  box.classList.toggle('plain', !lines.length)
  box.innerHTML = ''
  for (const t of texts) {
    const div = document.createElement('div'); div.className = 'lyric'; div.textContent = t
    box.appendChild(div)
  }
}

function paintActive(): void {
  const box = document.getElementById('lyrics')!
  const els = box.querySelectorAll('.lyric')
  els.forEach((el, i) => el.classList.toggle('active', i === activeIdx))
  const el = els[activeIdx] as HTMLElement | undefined
  if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
}
```

- [ ] **Step 2: Append lyric CSS to `src/renderer/styles/app.css`**

```css
#lyrics { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center;
  gap: 2px; padding: 8px 0; scroll-behavior: smooth;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent); }
.lyric { font-size: 17px; line-height: 1.9; color: color-mix(in srgb, var(--art-ink) 32%, transparent);
  transition: color .3s ease, font-size .3s ease, font-weight .3s ease; }
.lyric.active { color: var(--art-ink); font-size: 20px; font-weight: 600; }
#lyrics.plain { overflow-y: auto; }
#lyrics.plain .lyric { font-size: 16px; }
```

- [ ] **Step 3: Wire into `src/renderer/main.ts`**

```ts
import { initLyrics, loadLyricsFor } from './ui/lyrics'
// inside the trackId-changed block:
loadLyricsFor(np)
// near the bottom with the other init calls:
initLyrics()
```

- [ ] **Step 4: Run and verify with a track that has synced lyrics**

Run: `npm run dev`
Expected: lyrics fetch, the active line brightens/enlarges and auto-scrolls to center in time with the song; a track without synced lyrics shows plain/`Paroles indisponibles` gracefully.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ui/lyrics.ts src/renderer/styles/app.css src/renderer/main.ts
git commit -m "feat(renderer): synced lyrics with highlight, auto-scroll, fallbacks"
```

---

## Phase 7 — In-screen clip swap

### Task 7.1: clip.ts (pochette ↔ muted YouTube iframe + sync)

**Files:**
- Create: `src/renderer/ui/clip.ts`
- Modify: `src/renderer/index.html` (add a clip toggle button in `#controls`), `src/renderer/main.ts`, `src/renderer/styles/app.css`

- [ ] **Step 1: Add the toggle button to `#controls` in `index.html`**

```html
<div id="controls"><button id="clip-toggle" aria-label="Afficher le clip">clip</button></div>
```

- [ ] **Step 2: Implement `src/renderer/ui/clip.ts`**

```ts
import type { NowPlaying } from '../../shared/types'
import { onTick } from '../state'

let showing = false
let track = ''
let lastSync = 0

export function initClip(getNp: () => NowPlaying | null): void {
  const btn = document.getElementById('clip-toggle') as HTMLButtonElement
  btn.addEventListener('click', () => toggle(getNp()))

  onTick((pos) => {
    if (!showing) return
    const now = Date.now()
    if (now - lastSync < 4000) return
    lastSync = now
    post('seekTo', [pos / 1000, true])
  })
}

async function toggle(np: NowPlaying | null): Promise<void> {
  const art = document.getElementById('art')!
  if (showing) { teardown(); art.style.opacity = '1'; showing = false; return }
  if (!np) return
  showing = true; track = np.trackId; art.style.opacity = '0'

  const { embedUrl } = await window.np.resolveClip({ artist: np.artist, title: np.title })
  if (!embedUrl || track !== np.trackId) { showing = false; art.style.opacity = '1'; return }

  const frame = document.createElement('iframe')
  frame.id = 'clip-frame'
  frame.src = embedUrl
  frame.allow = 'autoplay; encrypted-media'
  frame.setAttribute('frameborder', '0')
  document.getElementById('left')!.appendChild(frame)
  requestAnimationFrame(() => { frame.style.opacity = '1' })
}

function teardown(): void {
  document.getElementById('clip-frame')?.remove()
}

function post(func: string, args: unknown[]): void {
  const frame = document.getElementById('clip-frame') as HTMLIFrameElement | null
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
}
```

- [ ] **Step 3: Append clip CSS to `src/renderer/styles/app.css`**

```css
#controls { position: fixed; bottom: 22px; right: 26px; z-index: 3; }
#clip-toggle { -webkit-app-region: no-drag; cursor: pointer;
  background: rgba(255,255,255,.12); color: var(--art-ink); border: 1px solid rgba(255,255,255,.25);
  border-radius: 20px; padding: 8px 16px; font-size: 13px; backdrop-filter: blur(12px); }
#clip-frame { position: absolute; inset: 0; width: 100%; aspect-ratio: 1; height: auto; border: 0;
  border-radius: 16px; opacity: 0; transition: opacity .4s ease; }
#art { transition: opacity .4s ease; }
#left { position: relative; }
```

- [ ] **Step 4: Wire into `src/renderer/main.ts`**

```ts
import { initClip } from './ui/clip'
initClip(() => state.np)
```

- [ ] **Step 5: Run and verify**

Run: `npm run dev`
Expected: clicking `clip` fades the cover out and a muted YouTube clip in; audio stays Deezer; the clip is roughly time-aligned and re-seeks every few seconds; clicking again returns to the cover. If the video is unrelated, it is the first search hit — acceptable for v1.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/ui/clip.ts src/renderer/index.html src/renderer/styles/app.css src/renderer/main.ts
git commit -m "feat(renderer): in-screen pochette <-> muted YouTube clip swap with sync"
```

---

## Phase 8 — Chrome, persistence, calm states

### Task 8.1: chrome.ts (window controls + fullscreen)

**Files:**
- Create: `src/renderer/ui/chrome.ts`
- Modify: `src/renderer/index.html` (add controls), `src/renderer/styles/app.css`, `src/renderer/main.ts`

- [ ] **Step 1: Add window buttons to `#controls` in `index.html`** (before `#clip-toggle`)

```html
<button id="win-min" aria-label="Réduire">–</button>
<button id="win-close" aria-label="Fermer">×</button>
```

- [ ] **Step 2: Implement `src/renderer/ui/chrome.ts`**

```ts
export function initChrome(): void {
  document.getElementById('win-min')?.addEventListener('click', () => window.np.win.minimize())
  document.getElementById('win-close')?.addEventListener('click', () => window.np.win.close())
  window.addEventListener('keydown', (e) => { if (e.key === 'F11') { e.preventDefault(); window.np.win.toggleFullscreen() } })
}
```

- [ ] **Step 3: Append CSS** (buttons hidden until hover for sobriety)

```css
#win-min, #win-close { -webkit-app-region: no-drag; cursor: pointer; width: 30px; height: 30px;
  margin-right: 8px; border-radius: 50%; border: 1px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.1); color: var(--art-ink); font-size: 14px; opacity: 0; transition: opacity .25s; }
#controls:hover #win-min, #controls:hover #win-close { opacity: 1; }
```

- [ ] **Step 4: Wire `initChrome()` into `main.ts` and run**

Run: `npm run dev`
Expected: minimize/close work; hover reveals them; F11 toggles fullscreen; window size/position persist across restarts (from Phase 3 `store.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ui/chrome.ts src/renderer/index.html src/renderer/styles/app.css src/renderer/main.ts
git commit -m "feat(renderer): frameless window controls + fullscreen"
```

### Task 8.2: calm idle / unavailable states

**Files:**
- Modify: `src/renderer/main.ts`, `src/main/smtc.ts`, `src/renderer/styles/app.css`

- [ ] **Step 1: In `src/main/smtc.ts`, guard the addon load so a failure is reported, not crashed**

```ts
export function attachSmtc(win: BrowserWindow): void {
  let start: (cb: (np: any) => void) => void
  try { start = require('@deezer-glass/smtc').start }
  catch (e) {
    win.webContents.once('did-finish-load', () =>
      win.webContents.send('nowplaying:update', unavailable()))
    return
  }
  start((raw) => { /* …existing forward logic… */ })
}

function unavailable() {
  return { trackId: 'unavailable', title: 'SMTC indisponible', artist: '', album: '',
    artDataUrl: null, positionMs: 0, durationMs: 0, lastUpdatedMs: 0, rate: 1, status: 'none' }
}
```

- [ ] **Step 2: In `src/renderer/main.ts`, show a calm idle state when nothing is playing**

```ts
window.np.onUpdate((np) => {
  const idle = np.status === 'none' && !np.title
  document.body.classList.toggle('idle', idle)
  $('title').textContent = np.title || 'En attente de lecture'
  // …rest unchanged…
})
```

- [ ] **Step 3: Append CSS**

```css
body.idle #lyrics, body.idle #progress, body.idle #times, body.idle #artist { opacity: 0; transition: opacity .4s; }
body.idle #art { background: rgba(255,255,255,.06); }
```

- [ ] **Step 4: Verify (close Deezer / stop playback)**

Run: `npm run dev` then stop Deezer.
Expected: panel shows "En attente de lecture" calmly, no crash, no error dialog. Missing cover → soft placeholder. Offline → lyrics show "Paroles indisponibles".

- [ ] **Step 5: Commit**

```bash
git add src/renderer/main.ts src/main/smtc.ts src/renderer/styles/app.css
git commit -m "feat: calm idle + SMTC-unavailable states"
```

---

## Phase 9 — Packaging

### Task 9.1: electron-builder NSIS installer

**Files:**
- Create: `electron-builder.yml`, `build/icon.ico` (placeholder acceptable for first build)

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: com.mitige.deezerglass
productName: Deezer Glass
directories:
  output: release
files:
  - out/**
  - package.json
extraResources:
  - from: native/smtc
    to: smtc
    filter: ["*.node", "index.js", "index.d.ts", "package.json"]
win:
  target: nsis
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 2: Ensure the addon resolves in the packaged app** — the `.node` is unpacked via `extraResources`. In `src/main/smtc.ts`, resolve the addon from resources when packaged:

```ts
import { app } from 'electron'
import { join } from 'node:path'

function loadAddon() {
  try { return require('@deezer-glass/smtc') }
  catch {
    return require(join(process.resourcesPath, 'smtc', 'index.js'))
  }
}
// use loadAddon().start instead of a bare require
```

- [ ] **Step 3: Build the installer**

Run: `npm run dist`
Expected: `release/Deezer Glass Setup 0.1.0.exe` is produced. Install it, launch, confirm now-playing + lyrics + clip work outside the dev server.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml src/main/smtc.ts build/icon.ico
git commit -m "build: electron-builder NSIS installer + packaged addon resolution"
```

---

## Phase 10 — (Optional) WebGL hero refraction

Bounded enhancement. Ship Phases 0–9 first; only attempt this if the CSS/SVG glass isn't "liquid" enough. If it balloons, stop and keep the Phase 5 baseline.

### Task 10.1: refraction.ts

**Files:**
- Create: `src/renderer/ui/refraction.ts`

- [ ] **Step 1: Implement a WebGL layer that samples a captured background texture with a normal-based offset**

```ts
// Renders a full-panel quad; samples a blurred snapshot of #bg as a texture and
// offsets UVs by a slow procedural normal map to fake refraction + caustics.
// Keep it OPTIONAL: if init throws (no WebGL), silently no-op and keep CSS glass.
export function initRefraction(): void {
  const canvas = document.createElement('canvas')
  canvas.id = 'refract'
  const gl = canvas.getContext('webgl')
  if (!gl) return
  document.getElementById('panel')!.prepend(canvas)
  // …shader setup, render loop… (implementation detail; bounded to this file)
}
```

- [ ] **Step 2: Gate behind a flag and verify no regression**

Only enable via a constant `ENABLE_WEBGL_REFRACTION = true` in `main.ts`. Verify the app still runs with it `false`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/ui/refraction.ts src/renderer/main.ts
git commit -m "feat(renderer): optional WebGL hero refraction (flagged)"
```

---

## Self-review (spec coverage)

- Overlay/SMTC passive (spec §2, §6) → Phases 2–3. ✔
- Rust addon in-process (§2, §6) → Phase 2. ✔
- `NowPlaying`/interpolation/preload contracts (§5) → Tasks 1.1, 1.3, 3.1–3.3. ✔
- Chameleon coloring (§7.1) → Tasks 1.7, 4.1. ✔
- Ambient drifting background (§7.2) → Task 4.2. ✔
- Spectacular liquid glass: backdrop + displacement + sheen, WebGL bounded-optional (§7.3) → Phase 5 + Phase 10. ✔
- Synced lyrics via LRCLIB + fallbacks + cache (§7.4, §8.1) → Tasks 1.4, 1.5, 3.2, 6.1. ✔
- Clip YouTube keyless + fallback resolver + muted sync (§8.2) → Tasks 1.6, 3.2, 7.1. ✔
- Frameless chrome + bounds persistence + fullscreen (§9) → Tasks 3.4, 8.1. ✔
- Calm edge states, no crashes (§10) → Task 8.2 (+ graceful `catch` in lyrics/clip/store). ✔
- Security: contextIsolation/sandbox/CSP (§11) → Tasks 3.3, 3.4. ✔
- Packaging (§13) → Phase 9. ✔
- Acceptance criteria (§15) → covered by the per-phase "Run and verify" steps.

**Type consistency:** `NowPlaying` fields (camelCase) are produced by the addon (napi-rs snake→camel), typed in `shared/types.ts`, and consumed unchanged in main/renderer. `interpolatePosition`, `makeTrackId`, `quantize`, `parseLrc`, `buildLrclibGetUrl`, `mapLrclibResponse`, `buildSearchEmbedUrl`/`buildIdEmbedUrl`/`extractVideoId` keep identical signatures across their definition and call sites. No placeholders remain.

**Known integration risks (verify manually, per spec §14):** (1) `windows`-crate method/type paths may shift by version — adjust to compiler hints, shape is stable. (2) `listType=search` deprecation — mitigated by the main-process id resolver (Task 3.2). (3) WebGL refraction is isolated to Phase 10 and flagged.
