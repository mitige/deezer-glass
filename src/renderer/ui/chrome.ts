export function initChrome(): void {
  document.getElementById('win-min')?.addEventListener('click', () => window.np.win.minimize())
  document.getElementById('win-close')?.addEventListener('click', () => window.np.win.close())
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') { e.preventDefault(); window.np.win.toggleFullscreen() }
  })
}
