import { create } from 'zustand'

export type Theme = 'dark' | 'light'

function initial(): Theme {
  try {
    const t = localStorage.getItem('theme')
    if (t === 'light' || t === 'dark') return t
  } catch { /* ignore */ }
  // Dark is the product's primary theme; the OS preference is not consulted (the toolbar toggle persists a choice).
  return 'dark'
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem('theme', t) } catch { /* ignore */ }
}

export const useTheme = create<{ theme: Theme; toggle: () => void; set: (t: Theme) => void }>((set, get) => {
  const t = initial()
  apply(t)
  return {
    theme: t,
    set: (theme) => { apply(theme); set({ theme }) },
    toggle: () => { const next: Theme = get().theme === 'dark' ? 'light' : 'dark'; apply(next); set({ theme: next }) },
  }
})
