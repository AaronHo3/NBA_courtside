import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true')
}

type Layer = { id: symbol; modal: boolean; panel: HTMLElement }

/**
 * Open dialog layers, oldest first. Kept on `globalThis` under a registered symbol so this hook and its copy in
 * the other tree (analytics `src/components/ui`, copilot `src/fantasy/components/ui`, which may not import each
 * other under DEC-31) share one stack: a palette opened over a fantasy modal is the top layer for both.
 */
const LAYERS_KEY = Symbol.for('courtside.dialog-layers')
const registry = globalThis as unknown as Record<symbol, Layer[] | undefined>
const layers: Layer[] = (registry[LAYERS_KEY] ??= [])

const isTop = (id: symbol) => layers[layers.length - 1]?.id === id

/** For tests: how many dialog layers are open. */
export const openDialogLayerCount = () => layers.length

/**
 * Where focus goes on open. `'autofocus'` (default): an element with `[data-autofocus]` inside the panel, else
 * the first focusable, else the panel. `'first'`: the first focusable, else the panel. An element: that element.
 * `null`: the panel itself.
 */
export type InitialFocus = 'first' | 'autofocus' | HTMLElement | null

function initialTarget(panel: HTMLElement, initial: InitialFocus): HTMLElement {
  if (initial instanceof HTMLElement) return initial
  if (initial === null) return panel
  const auto = initial === 'autofocus' ? panel.querySelector<HTMLElement>('[data-autofocus]') : null
  return auto ?? focusables(panel)[0] ?? panel
}

/**
 * Focus management for a panel that is mounted while `open`. Each open panel is a layer on a shared stack and
 * only the topmost layer reacts: Escape calls its `onClose`, Tab and Shift+Tab wrap inside it, and (when
 * `modal`) focus that lands outside it is pulled back in. A handler that acts calls `preventDefault` and
 * `stopPropagation`; events already `defaultPrevented` are ignored. Focus returns to the element that had it
 * when the panel opened. When not `modal` the page behind stays usable and Tab only wraps while focus is inside.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  modal = true,
  options: { initialFocus?: InitialFocus } = {},
) {
  const onCloseRef = useRef(onClose)
  const initialRef = useRef<InitialFocus>(options.initialFocus === undefined ? 'autofocus' : options.initialFocus)
  useEffect(() => {
    onCloseRef.current = onClose
    initialRef.current = options.initialFocus === undefined ? 'autofocus' : options.initialFocus
  })

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const id = Symbol('dialog-layer')
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    layers.push({ id, modal, panel })
    initialTarget(panel, initialRef.current).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isTop(id)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      if (!modal && !panel.contains(document.activeElement)) return
      const items = focusables(panel)
      const active = document.activeElement
      const head = items[0]
      const tail = items[items.length - 1]
      let next: HTMLElement | null = null
      if (items.length === 0) next = panel
      else if (!panel.contains(active)) next = e.shiftKey ? tail : head
      else if (e.shiftKey && (active === head || active === panel)) next = tail
      else if (!e.shiftKey && active === tail) next = head
      if (!next) return
      e.preventDefault()
      e.stopPropagation()
      next.focus()
    }
    const onFocusIn = (e: FocusEvent) => {
      if (!modal || !isTop(id)) return
      if (e.target instanceof Node && !panel.contains(e.target)) (focusables(panel)[0] ?? panel).focus()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
      const at = layers.findIndex((l) => l.id === id)
      if (at >= 0) layers.splice(at, 1)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [open, panelRef, modal])
}
