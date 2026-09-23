export const $ = (id: string) => document.getElementById(id)!;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; html?: string; title?: string; onclick?: (e: MouseEvent) => void; style?: string; disabled?: boolean } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.html !== undefined) e.innerHTML = props.html;
  if (props.title) e.title = props.title;
  if (props.style) e.setAttribute('style', props.style);
  if (props.onclick) e.addEventListener('click', props.onclick as EventListener);
  if (props.disabled && e instanceof HTMLButtonElement) e.disabled = true;
  for (const c of children) if (c) e.append(c);
  return e;
}

export const fmt = (n: number) => '$' + Math.floor(n).toLocaleString('de-DE');
export const fmtMult = (n: number) => (Math.round(n * 100) / 100).toLocaleString('de-DE');
