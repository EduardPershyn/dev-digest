/** Popover geometry for the PR-list FINDINGS cell. */
export const POPOVER_WIDTH = 380;
export const POPOVER_MAX_HEIGHT = 420;
const GAP = 6;
const EDGE = 8;

export type PopoverPosition = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Place the popover under the trigger, left-aligned and clamped to the viewport.
 * Flips above the trigger when there's more room there than below and the
 * popover would not fit below.
 */
export function popoverPosition(
  rect: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
): PopoverPosition {
  const left = Math.max(EDGE, Math.min(rect.left - EDGE, viewport.width - POPOVER_WIDTH - EDGE));
  const below = viewport.height - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  if (below >= POPOVER_MAX_HEIGHT || below >= above) {
    return { left, top: rect.bottom + GAP, maxHeight: Math.min(POPOVER_MAX_HEIGHT, below) };
  }
  return { left, bottom: viewport.height - rect.top + GAP, maxHeight: Math.min(POPOVER_MAX_HEIGHT, above) };
}
