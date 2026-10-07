// Runs before first paint (external file: CSP forbids inline scripts). Keep in sync with src/lib/theme.ts.
try {
  var t = localStorage.getItem('theme')
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch {}
