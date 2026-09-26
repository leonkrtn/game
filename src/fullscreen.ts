/**
 * Fullscreen that Esc cannot throw you out of.
 *
 * Browsers leave fullscreen on Esc. Chrome, Edge and Opera let a fullscreen page lock the Esc key
 * (Keyboard Lock API): then Esc reaches the game and leaving takes a long press. Safari and Firefox
 * don't offer that, so there the game also listens to Q for everything Esc does, and the
 * window-level fullscreen of macOS (green button, ctrl+cmd+F) is not left by Esc at all.
 */

/** Bridge the desktop app (Electron) puts on window: fullscreen belongs to the app window there. */
export interface DesktopBridge {
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  onFullscreen(cb: (on: boolean) => void): void;
  quit(): void;
}
export const desktop = (window as unknown as { desktop?: DesktopBridge }).desktop;
let desktopFull = true;
desktop?.onFullscreen((on) => (desktopFull = on));
desktop?.isFullscreen().then((on) => (desktopFull = on)).catch(() => undefined);

type LockableNavigator = Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void } };
type WebkitDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as WebkitDoc;

export const isFullscreen = () => (desktop ? desktopFull : !!(doc.fullscreenElement ?? doc.webkitFullscreenElement));

/** Whether Esc stays with the game while in fullscreen (Chromium browsers). */
export const canLockEscape = () => !!desktop || typeof (navigator as LockableNavigator).keyboard?.lock === 'function';

let leaving = false;

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as WebkitEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    return false;
  }
  try {
    await (navigator as LockableNavigator).keyboard?.lock?.(['Escape']);
  } catch {
    // Not allowed here (e.g. inside a frame): Q still works as Esc.
  }
  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  leaving = true;
  (navigator as LockableNavigator).keyboard?.unlock?.();
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else await doc.webkitExitFullscreen?.();
  } catch {
    // Already windowed.
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  // In the desktop app the window itself goes fullscreen, and Esc never leaves it.
  if (desktop) return (desktopFull = await desktop.toggleFullscreen());
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen();
}

/**
 * Calls `onEscapedOut` when the browser left fullscreen by itself (Esc in Safari/Firefox, a long
 * Esc press in Chrome), so the game can treat it like Esc and offer the way back in.
 */
export function watchFullscreen(onEscapedOut: () => void, onChange: () => void): void {
  const handler = () => {
    onChange();
    if (!isFullscreen()) {
      if (!leaving) onEscapedOut();
      leaving = false;
    }
  };
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
}
