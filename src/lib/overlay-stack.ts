/**
 * Global overlay stack for back button handling.
 * Components that open overlays (modals, viewers) should push/pop.
 * The back button handler checks this stack before navigating.
 */

type DismissFn = () => void

const stack: DismissFn[] = []

export function pushOverlay(dismiss: DismissFn) {
  stack.push(dismiss)
}

export function popOverlay() {
  stack.pop()
}

export function hasOverlay(): boolean {
  return stack.length > 0
}

export function dismissTopOverlay(): boolean {
  const dismiss = stack.pop()
  if (dismiss) {
    dismiss()
    return true
  }
  return false
}
