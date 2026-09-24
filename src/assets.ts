/**
 * The offline build bakes every asset into the page as `window.__ASSETS` (file name -> base64, or
 * text for JSON), because a page opened from disk (file://) may not load other files. Online
 * builds load the files normally.
 */
const EMBED = (globalThis as { __ASSETS?: Record<string, string> }).__ASSETS;

/** Text content of an asset (JSON, or base64 text files). */
export async function assetText(base: string, name: string): Promise<string> {
  const e = EMBED?.[name];
  if (e !== undefined) return e;
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

/** URL for an image or font: a data URL when embedded, else the file next to the page. */
export function assetUrl(base: string, name: string, mime: string): string {
  const e = EMBED?.[name];
  return e !== undefined ? `data:${mime};base64,${e}` : base + name;
}

/** Raw bytes of an embedded binary asset, if the page carries it. */
export function embeddedBytes(name: string): Uint8Array | undefined {
  const e = EMBED?.[name];
  if (e === undefined) return undefined;
  const bin = atob(e);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
