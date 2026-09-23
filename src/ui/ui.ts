import { BOSSES, CHIPS, DEBTS, POCKET_ITEMS, POCKET_MOD_INFO, TALISMANS } from '../game/content';
import { FIELD_BY_ID, fieldWins } from '../game/fields';
import { MAX_TALISMANS, type Run } from '../game/run';
import type { Line, SpinResult } from '../game/scoring';
import type { Pocket, TalismanInstance } from '../game/types';
import { COLOR_NAME, POCKET_COUNT, standardColor } from '../game/wheel';
import { $, fmt, fmtMult, h } from './dom';

export function chipFace(def: string, small = false): HTMLElement {
  const d = CHIPS[def];
  const e = h('div', { class: 'chipface' + (small ? ' small' : ''), text: String(d.value) });
  e.style.setProperty('--c', d.color);
  e.style.setProperty('--r', d.rim);
  return e;
}

export function talismanDesc(t: TalismanInstance): string {
  return TALISMANS[t.def].desc.replace('{n}', String(t.counter));
}

/** Chance (0..1) that a bet on `fieldId` wins with the current wheel and weights. */
export function fieldChance(run: Run, fieldId: string): number {
  const f = FIELD_BY_ID[fieldId];
  const w = run.weights();
  const total = w.reduce((a, b) => a + b, 0);
  let win = 0;
  run.wheel.forEach((p, i) => {
    if (fieldWins(f, p) && !(f.kind === 'red' && run.rule === 'rotfluch')) win += w[i];
  });
  return win / total;
}

const pct = (x: number) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';

export function renderTopbar(run: Run): void {
  const bar = $('topbar');
  bar.replaceChildren();
  bar.append(
    h('div', { class: 'panel stat money' }, h('div', { class: 'label', text: 'Bargeld' }), h('div', { class: 'value', text: fmt(run.money) })),
  );
  const due = run.phase === 'due';
  const progress = Math.min(1, run.money / run.debt);
  const bar2 = h('div', { class: 'bar' }, h('i', { class: progress >= 1 ? 'ok' : '', style: `width:${progress * 100}%` }));
  const rounds = h('div', { class: 'rounds' });
  for (let i = 0; i < run.spinsPerCycle; i++) rounds.append(h('i', { class: i < run.spinsPerCycle - run.spinsLeft ? 'done' : '' }));
  const rateNo = run.endless ? `Rate ${run.cycle + 1} (endlos)` : `Rate ${run.cycle + 1}/${DEBTS.length}`;
  bar.append(
    h('div', { class: 'panel stat debt' + (due ? ' due' : '') },
      h('div', { class: 'label', text: due ? `${rateNo} · jetzt fällig!` : `${rateNo} · fällig nach ${run.spinsPerCycle} Runden` }),
      h('div', { class: 'value', text: fmt(run.debt) }),
      bar2,
    ),
    h('div', { class: 'panel stat' },
      h('div', { class: 'label', text: run.spinsLeft === 0 ? 'Alle Runden gespielt' : `Runde ${run.round} von ${run.spinsPerCycle}` }),
      rounds,
    ),
  );
  if (run.rule) {
    const b = BOSSES[run.rule];
    bar.append(h('div', { class: 'panel stat rule' }, h('div', { class: 'label', text: 'Hausregel' }), h('div', { html: `<b>${b.name}</b><br>${b.desc}` })));
  }
  if (run.bonusMult > 0) {
    bar.append(h('div', { class: 'panel stat' }, h('div', { class: 'label', text: 'Glücksmünzen' }), h('div', { class: 'value', style: 'color:var(--mult)', text: `+${run.bonusMult} Mult` })));
  }
}

export function renderTalismans(run: Run, flash?: Set<number>): void {
  const box = $('talismans');
  box.replaceChildren();
  for (const t of run.talismans) {
    const d = TALISMANS[t.def];
    box.append(
      h('div', { class: 'tal' + (flash?.has(t.uid) ? ' flash' : '') },
        d.icon,
        t.counter ? h('span', { class: 'count', text: `+${t.counter}` }) : null,
        h('div', { class: 'tip panel', html: `<b>${d.name}</b>${talismanDesc(t)}` }),
      ),
    );
  }
  for (let i = run.talismans.length; i < MAX_TALISMANS; i++) box.append(h('div', { class: 'tal empty', text: '—' }));
}

export interface TableHandlers {
  select(i: number): void;
  spin(): void;
  redraw(): void;
  leave(): void;
  wheel(): void;
}

export function renderTableBar(run: Run, selected: number, handlers: TableHandlers, spinning: boolean): void {
  const hand = $('hand');
  hand.replaceChildren();
  run.hand.forEach((c, i) => {
    const d = CHIPS[c.def];
    hand.append(
      h('div', { class: 'panel card clickable' + (i === selected ? ' sel' : ''), onclick: () => handlers.select(i) },
        h('span', { class: 'key', text: String(i + 1) }),
        chipFace(c.def),
        h('div', { class: 'name', text: d.name }),
        h('div', { class: 'tip panel', html: `<b>${d.name} · Wert ${d.value}</b>${d.desc}` }),
      ),
    );
  });
  if (run.hand.length === 0) hand.append(h('div', { class: 'panel', style: 'padding:10px 14px', text: 'Alle Jetons gesetzt.' }));
  const act = $('actions');
  act.replaceChildren(
    h('button', { onclick: handlers.spin, disabled: spinning || run.phase !== 'betting', html: 'Drehen <kbd>Leertaste</kbd>' }),
    h('button', { class: 'ghost', onclick: handlers.redraw, disabled: spinning || run.redrawsLeft <= 0 || run.hand.length === 0 || run.phase !== 'betting', html: `Neu ziehen (${run.redrawsLeft}) <kbd>R</kbd>` }),
    h('button', { class: 'ghost', onclick: handlers.wheel, disabled: spinning, html: 'Rad ansehen <kbd>V</kbd>' }),
    h('button', { class: 'ghost', onclick: handlers.leave, disabled: spinning, html: 'Aufstehen <kbd>Esc</kbd>' }),
  );
}

export function renderFieldInfo(run: Run, fieldId: string | undefined, x: number, y: number): void {
  const box = $('fieldinfo');
  if (!fieldId) {
    box.classList.add('hidden');
    return;
  }
  const f = FIELD_BY_ID[fieldId];
  const payout = f.kind === 'straight' && run.rule === 'halbzahl' ? 18 : f.payout;
  const stack = run.placed[fieldId] ?? [];
  box.replaceChildren(
    h('b', { text: f.kind === 'straight' ? `Zahl ${f.label}` : f.label }),
    h('div', { html: `Zahlt <b>×${payout}</b> · Chance <b>${pct(fieldChance(run, fieldId))}</b>` }),
  );
  if (stack.length) {
    box.append(h('div', { class: 'muted', text: `${stack.length} Jeton${stack.length > 1 ? 's' : ''} hier · Rechtsklick nimmt zurück` }));
  }
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.classList.remove('hidden');
}

// ---- Result panel ---------------------------------------------------------

function lineAmount(l: Line): string {
  switch (l.kind) {
    case 'sum': return fmt(l.amount);
    case 'add': return `+${fmtMult(l.amount)} Mult`;
    case 'mul': return `×${fmtMult(l.amount)} Mult`;
    case 'money': return `+${fmt(l.amount)}`;
    default: return '';
  }
}

/** Reveals the scoring lines one by one. Calls `onLine` per line for sounds and talisman flashes. */
export function showResult(r: SpinResult, onLine: (l: Line, i: number) => void): () => void {
  const box = $('result');
  box.replaceChildren();
  box.classList.remove('hidden');
  const p = r.pocket;
  box.append(h('h3', {}, h('div', { class: `pocketball ${p.color}`, text: String(p.number) }), `${p.number} ${COLOR_NAME[p.color]}`));
  if (p.mod) box.append(h('div', { class: 'line info', text: `${POCKET_MOD_INFO[p.mod].name}fach: ${POCKET_MOD_INFO[p.mod].short}` }));
  const lines = r.lines.filter((l) => l.kind !== 'info');
  const timers: number[] = [];
  lines.forEach((l, i) => {
    timers.push(window.setTimeout(() => {
      box.append(h('div', { class: `line ${l.kind}` }, h('span', { text: l.text }), h('span', { class: 'amt', text: lineAmount(l) })));
      onLine(l, i);
    }, 200 + i * 170));
  });
  timers.push(window.setTimeout(() => {
    const total = r.score + r.money;
    box.append(
      h('div', { class: 'total' },
        h('span', { class: 'formula', html: `<span class="s">${fmt(r.sum)}</span> × <span class="m">${fmtMult(r.mult)}</span>` }),
        h('span', { class: 'big' + (total === 0 ? ' zero' : ''), text: total ? `+${fmt(total)}` : '±0' }),
      ),
    );
    if (r.broken.length) box.append(h('div', { class: 'line info', text: `${r.broken.length} Glas-Jeton zerbrochen!` }));
  }, 300 + lines.length * 170));
  return () => timers.forEach(clearTimeout);
}

export function hideResult(): void {
  $('result').classList.add('hidden');
}

// ---- Floaters, toasts, prompts -------------------------------------------

export function floater(text: string, x: number, y: number, color = 'var(--money)', size = 22): void {
  const e = h('div', { class: 'floater', text, style: `left:${x}px;top:${y}px;color:${color};font-size:${size}px` });
  $('floaters').append(e);
  setTimeout(() => e.remove(), 1500);
}

export function toast(html: string): void {
  const e = h('div', { class: 'panel toast', html });
  $('toasts').append(e);
  setTimeout(() => e.remove(), 3100);
}

export function setPrompt(html?: string): void {
  const p = $('prompt');
  if (!html) p.classList.add('hidden');
  else {
    p.innerHTML = html;
    p.classList.remove('hidden');
    p.classList.add('panel');
  }
}

export function setBanner(html?: string): void {
  const b = $('banner');
  if (!html) b.classList.add('hidden');
  else {
    b.innerHTML = html;
    b.classList.remove('hidden');
    b.classList.add('panel');
  }
}

export function setHelp(html: string): void {
  $('helpbar').innerHTML = html;
}

// ---- Modal content ----------------------------------------------------------

export function openModal(content: HTMLElement, onBackdrop?: () => void): void {
  const m = $('modal');
  m.replaceChildren(content);
  m.classList.remove('hidden');
  m.onclick = (e) => {
    if (e.target === m) onBackdrop?.();
  };
}

export function closeModal(): void {
  $('modal').classList.add('hidden');
  $('modal').replaceChildren();
}

export function modalOpen(): boolean {
  return !$('modal').classList.contains('hidden');
}

/** 37 pockets laid out as on the wheel, with chances. */
export function wheelRing(run: Run, opts: { pick?: (p: Pocket) => void; center?: string } = {}): HTMLElement {
  const ring = h('div', { class: 'ring' });
  const w = run.weights();
  const total = w.reduce((a, b) => a + b, 0);
  const R = 185;
  for (const p of run.wheel) {
    const a = -Math.PI / 2 + (p.index / POCKET_COUNT) * Math.PI * 2;
    const e = h('div', {
      class: `p ${p.color}` + (opts.pick ? ' pickable' : ''),
      text: String(p.number),
      title: `${p.number} ${COLOR_NAME[p.color]}${p.mod ? ' · ' + POCKET_MOD_INFO[p.mod].name + ': ' + POCKET_MOD_INFO[p.mod].short : ''}`,
      onclick: opts.pick ? () => opts.pick!(p) : undefined,
    });
    e.style.left = `${210 + Math.cos(a) * R}px`;
    e.style.top = `${210 + Math.sin(a) * R}px`;
    if (p.mod) e.style.borderColor = POCKET_MOD_INFO[p.mod].color;
    ring.append(e);
    const ch = h('span', { class: 'ch', text: pct(w[p.index] / total) });
    ch.style.left = `${210 + Math.cos(a) * (R - 36)}px`;
    ch.style.top = `${210 + Math.sin(a) * (R - 36)}px`;
    if (w[p.index] > 1) ch.classList.add('hi');
    ring.append(ch);
  }
  ring.append(h('div', { class: 'center', html: opts.center ?? '' }));
  return ring;
}

export function modLegend(): HTMLElement {
  const l = h('div', { class: 'legend' });
  for (const m of Object.values(POCKET_MOD_INFO)) {
    l.append(h('span', { html: `<i style="background:${m.color}"></i>${m.name}: ${m.short}` }));
  }
  return l;
}

export function numberPicker(onPick: (n: number) => void): HTMLElement {
  const g = h('div', { class: 'numpick' });
  for (let n = 0; n <= 36; n++) g.append(h('button', { class: standardColor(n), text: String(n), onclick: () => onPick(n) }));
  return g;
}

export function itemInfo(kind: string, def: string): { icon: HTMLElement | string; name: string; desc: string; kindLabel: string } {
  if (kind === 'chip') return { icon: chipFace(def), name: CHIPS[def].name, desc: `Wert ${CHIPS[def].value}. ${CHIPS[def].desc}`, kindLabel: 'Jeton' };
  if (kind === 'talisman') return { icon: TALISMANS[def].icon, name: TALISMANS[def].name, desc: TALISMANS[def].desc.replace(' (aktuell +{n})', ''), kindLabel: 'Talisman' };
  const p = POCKET_ITEMS[def];
  return { icon: p.icon, name: p.name, desc: p.desc, kindLabel: kind === 'service' ? 'Service' : 'Rad-Umbau' };
}
