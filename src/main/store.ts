import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
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

export interface AppConfig { deezerArl?: string }
export const loadConfig = (): AppConfig => readJson('config.json', {})
export function ensureConfig(): void {
  try { if (!existsSync(file('config.json'))) writeJson('config.json', { deezerArl: '' }) } catch { /* ignore */ }
}
