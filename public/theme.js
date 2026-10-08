// Runs before first paint (external file: CSP forbids inline scripts). Saved light/dark wins, else follow the system. Keep in sync with src/components/theme-toggle.tsx.
try {
  var t = localStorage.getItem('theme')
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch {}
