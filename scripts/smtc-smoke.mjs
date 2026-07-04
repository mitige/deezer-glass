import { start } from '../native/smtc/index.js'

console.log('Listening to SMTC for 25s — play/pause/skip in Deezer…')
start((np) => {
  const pos = (np.positionMs / 1000).toFixed(1)
  const dur = (np.durationMs / 1000).toFixed(1)
  console.log(`[${np.status}] ${np.artist} — ${np.title}  ${pos}/${dur}s  art:${np.artDataUrl ? 'yes' : 'no'}`)
})
setTimeout(() => process.exit(0), 25_000)
