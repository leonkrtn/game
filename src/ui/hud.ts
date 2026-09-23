import { CHIP_COLORS, chipLabel, DENOMINATIONS, DEBTS, ITEMS, POCKET_MOD_INFO, RARITY, RULES } from '../game/content';
import { FIELD_BY_ID, fieldWins, KIND_NAME } from '../game/fields';
import type { Run } from '../game/run';
import type { Line } from '../game/scoring';
import type { ItemInstance, Pocket } from '../game/types';
import { COLOR_NAME, POCKET_COUNT, standardColor } from '../game/wheel';
import { $, fmt, fmtMult, h } from './dom';

const pct = (x: number) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';

export function chipFace(value: number): HTMLElement {
  const d = CHIP_COLORS[value] ?? CHIP_COLORS[1];
  const e = h('div', { class: 'chipface', text: chipLabel(value) });
  e.style.setProperty('--c', d.face);
  e.style.setProperty('--r', d.rim);
  return e;
}

export function itemDesc(t: ItemInstance): string {
  const d = ITEMS[t.def];
  const step = t.def === 'glocke' ? 0.2 : t.def === 'rabe' ? 0.5 : 0;
  return d.desc.replace('{n}', fmtMult(t.counter * step));
}

export const rarityColor = (def: string) => `var(--${ITEMS[def].rarity})`;

/** Chance (0..1) that a bet on `fieldId` wins this round. */
export function fieldChance(run: Run, fieldId: string): number {
  const f = FIELD_BY_ID[fieldId];
  const ch = run.chances();
  let win = 0;
  run.wheel.forEach((p, i) => {
    if (fieldWins(f, p) && !(f.kind === 'red' && run.rule === 'rotfluch')) win += ch[i];
  });
  return win;
}

/** Number cells a bet covers on the layout, for highlighting. */
export function coveredCells(run: Run, fieldId: string): string[] {
  const f = FIELD_BY_ID[fieldId];
  if (f.numbers.length) return f.numbers.map((n) => `n${n}`);
  const nums = new Set<number>();
  for (const p of run.wheel) if (fieldWins(f, p)) nums.add(p.number);
  return [...nums].map((n) => `n${n}`);
}

// ---- Sidebar ------------------------------------------------------------------

export interface SideState {
  cash: number;
  sum: number;
  mult: number;
  lines: Line[];
  result?: number;
}

export function renderSide(run: Run, st: SideState): void {
  const side = $('side');
  side.classList.remove('hidden');
  side.classList.add('panel');
  const due = run.phase === 'due';
  const covered = run.deposit + run.cash;
  const depShare = Math.min(1, run.deposit / run.debt);
  const cashShare = Math.min(1 - depShare, run.cash / run.debt);
  const pips = h('div', { class: 'pips' });
  for (let i = 0; i < run.cycleRounds; i++) {
    const done = i < run.cycleRounds - run.roundsLeft;
    pips.append(h('i', { class: done ? 'done' : i === run.cycleRounds - run.roundsLeft ? 'now' : '' }));
  }
  const rateNo = run.endless ? `Rate ${run.cycle + 1} · endlos` : `Rate ${run.cycle + 1} von ${DEBTS.length}`;
  const status = due
    ? h('div', { class: 'due-now', text: 'Jetzt fällig: zur Kasse!' })
    : run.roundsLeft === 0
      ? h('div', { class: 'small', text: 'Alle Runden gespielt.' })
      : h('div', { class: 'small', html: `Runde <b>${run.round}</b> von <b>${run.cycleRounds}</b>, dann ist sie fällig` });

  const sumCell = h('div', { class: 'cell sum', html: `<span class="label">Summe</span>${fmt(st.sum)}` });
  const multCell = h('div', { class: 'cell mult', html: `<span class="label">Mult</span>×${fmtMult(st.mult)}` });
  sumCell.id = 'sumCell';
  multCell.id = 'multCell';
  const ticker = h('div', {});
  ticker.id = 'ticker';
  for (const l of st.lines.slice(-6)) {
    ticker.append(h('div', { class: `t ${l.kind}` }, h('span', { text: l.text }), h('span', { class: 'a', text: lineAmount(l) })));
  }
  const result = st.result === undefined ? null : h('div', { class: 'result ' + (st.result >= 0 ? 'plus' : 'minus'), text: (st.result >= 0 ? '+' : '−') + fmt(Math.abs(st.result)) });

  side.replaceChildren(
    h('section', {},
      h('div', { class: 'eyebrow', text: rateNo }),
      h('div', { class: 'big debt', text: fmt(run.debt) }),
      status,
      pips,
      h('div', { class: 'meter', title: 'Eingezahlt und Bargeld im Verhältnis zur Rate' },
        h('i', { class: 'dep', style: `width:${depShare * 100}%` }),
        h('i', { class: 'cash', style: `width:${cashShare * 100}%` }),
      ),
      h('div', { class: 'row split small' },
        h('span', { html: `Eingezahlt <b class="num">${fmt(run.deposit)}</b>` }),
        h('span', { html: covered >= run.debt ? '<b style="color:var(--money)">gedeckt</b>' : `fehlt <b class="num">${fmt(run.debt - covered)}</b>` }),
      ),
    ),
    h('section', {},
      h('div', { class: 'eyebrow', text: 'Bargeld' }),
      h('div', { class: 'big money', text: fmt(st.cash) }),
      run.stakeTotal ? h('div', { class: 'small', html: `Auf dem Tisch <b class="num">${fmt(run.stakeTotal)}</b>` }) : null,
    ),
    h('section', {},
      h('div', { class: 'scorebox' }, sumCell, h('span', { class: 'x', text: '×' }), multCell),
      ticker,
      result,
    ),
    h('section', {},
      h('div', { class: 'stat' }, h('span', { text: 'Glücksmarken' }), h('span', { class: 'v marks', text: `◆ ${run.marks}` })),
      h('div', { class: 'stat', title: 'Chance, dass die Kugel in ein besseres Nachbarfach hüpft' }, h('span', { text: 'Glück' }), h('span', { class: 'v luck', text: `${run.luck} · ${pct(run.hopChance)} Nachhopser` })),
      h('div', { class: 'stat' }, h('span', { text: 'Zinsen auf Einzahlung' }), h('span', { class: 'v', text: `${pct(run.interestRate)} / Runde` })),
      h('div', { class: 'stat' }, h('span', { text: 'Talismane' }), h('span', { class: 'v', text: `${run.items.length} / ${run.perks.slots}` })),
    ),
    h('section', { class: 'rule' },
      h('div', { class: 'eyebrow', text: 'Hausregel' }),
      h('div', { html: run.rule ? `<b>${RULES[run.rule].name}</b><br>${RULES[run.rule].desc}` : '<span class="muted">Keine. Der Abend ist noch jung.</span>' }),
      h('div', { class: 'small', html: `Ab der nächsten Rate: <b>${RULES[run.nextRule].name}</b>` }),
    ),
  );
}

export function lineAmount(l: Line): string {
  switch (l.kind) {
    case 'bet': return `+${fmt(l.amount)}`;
    case 'add': return 'Mult';
    case 'mul': return 'Mult';
    case 'money': return `+${fmt(l.amount)}`;
    case 'marks': return `+◆${l.amount}`;
  }
}

/** Briefly enlarges the sum or mult cell. */
export function bump(which: 'sum' | 'mult'): void {
  const el = document.getElementById(which === 'sum' ? 'sumCell' : 'multCell');
  if (!el) return;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 90);
}

// ---- Table bar ------------------------------------------------------------------

export function availableChips(cash: number): number[] {
  const fits = DENOMINATIONS.filter((d) => d <= Math.max(1, cash));
  return fits.slice(-6);
}

export interface TableHandlers {
  chip(v: number): void;
  spin(): void;
  repeat(): void;
  clear(): void;
  leave(): void;
  wheel(): void;
}

export function renderTableBar(run: Run, selected: number, hd: TableHandlers, busy: boolean): void {
  const chips = $('chips');
  chips.replaceChildren();
  availableChips(run.cash + run.stakeTotal).forEach((v, i) => {
    const b = h('button', { class: 'chipbtn' + (v === selected ? ' sel' : ''), onclick: () => hd.chip(v), disabled: v > run.cash });
    b.append(chipFace(v), h('span', { class: 'k', html: `<kbd>${i + 1}</kbd>` }));
    chips.append(b);
  });
  const hasLast = Object.keys(run.lastBets).length > 0;
  $('actions').replaceChildren(
    h('button', { onclick: hd.spin, disabled: busy || run.phase !== 'betting', html: `Drehen <kbd>Leertaste</kbd>` }),
    h('button', { class: 'ghost', onclick: hd.repeat, disabled: busy || !hasLast || run.stakeTotal > 0, html: 'Wiederholen <kbd>R</kbd>' }),
    h('button', { class: 'ghost', onclick: hd.clear, disabled: busy || run.stakeTotal === 0, html: 'Abräumen <kbd>C</kbd>' }),
    h('button', { class: 'ghost', onclick: hd.wheel, disabled: busy, html: 'Rad <kbd>V</kbd>' }),
    h('button', { class: 'ghost', onclick: hd.leave, disabled: busy, html: 'Aufstehen <kbd>Esc</kbd>' }),
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
  const stake = (run.bets[fieldId] ?? []).reduce((a, b) => a + b, 0);
  box.replaceChildren(
    h('b', { text: f.kind === 'straight' ? `Plein ${f.label}` : f.numbers.length ? `${KIND_NAME[f.kind]} ${f.label}` : f.label }),
    h('div', { html: `Zahlt <b>×${payout}</b> · Chance <b>${pct(fieldChance(run, fieldId))}</b>` }),
  );
  if (stake) box.append(h('div', { class: 'muted', text: `Gesetzt: ${fmt(stake)} · Rechtsklick nimmt zurück` }));
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.classList.remove('hidden');
}

export function renderItemTip(run: Run, uid: number | undefined, x: number, y: number): void {
  const box = $('itemtip');
  const t = uid === undefined ? undefined : run.items.find((i) => i.uid === uid);
  if (!t) {
    box.classList.add('hidden');
    return;
  }
  const d = ITEMS[t.def];
  box.replaceChildren(
    h('div', { class: 'rar', style: `color:${rarityColor(t.def)}`, text: RARITY[d.rarity].name }),
    h('div', { class: 'name', text: d.name }),
    h('div', { text: itemDesc(t) }),
  );
  box.style.left = `${x}px`;
  box.style.top = `${y - 10}px`;
  box.classList.remove('hidden');
}

// ---- Floaters, toasts, prompts -------------------------------------------------

export function floater(text: string, x: number, y: number, color = 'var(--money)', size = 24): void {
  const e = h('div', { class: 'floater', text, style: `left:${x}px;top:${y}px;color:${color};font-size:${size}px` });
  $('floaters').append(e);
  setTimeout(() => e.remove(), 1400);
}

export function toast(html: string, cls = ''): void {
  const e = h('div', { class: `panel toast ${cls}`, html });
  $('toasts').append(e);
  setTimeout(() => e.remove(), 3300);
}

export function bigWin(title: string, value: string): void {
  const b = $('bigwin');
  b.replaceChildren(h('div', { class: 't', text: title }), h('div', { class: 'v', text: value }));
  b.classList.remove('hidden');
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  setTimeout(() => b.classList.add('hidden'), 2200);
}

export function setPrompt(html?: string): void {
  const p = $('prompt');
  if (!html) p.classList.add('hidden');
  else {
    if (p.innerHTML !== html) p.innerHTML = html;
    p.classList.remove('hidden');
  }
}

export function setBanner(html?: string): void {
  const b = $('banner');
  if (!html) b.classList.add('hidden');
  else {
    b.innerHTML = html;
    b.classList.remove('hidden');
  }
}

export function setHelp(html: string): void {
  $('helpbar').innerHTML = html;
}

// ---- Modals ----------------------------------------------------------------------

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

/** 37 pockets laid out as on the wheel, with this round's chances. */
export function wheelRing(run: Run, opts: { pick?: (p: Pocket) => void; center?: string } = {}): HTMLElement {
  const ring = h('div', { class: 'ring' });
  const ch = run.chances();
  const R = 185;
  for (const p of run.wheel) {
    const a = -Math.PI / 2 + (p.index / POCKET_COUNT) * Math.PI * 2;
    const e = h('div', {
      class: `p ${p.color}` + (opts.pick ? ' pickable' : '') + (run.visions.includes(p.index) ? ' vision' : ''),
      text: String(p.number),
      title: `${p.number} ${COLOR_NAME[p.color]}${p.mod ? ' · ' + POCKET_MOD_INFO[p.mod].name + ': ' + POCKET_MOD_INFO[p.mod].short : ''}`,
      onclick: opts.pick ? () => opts.pick!(p) : undefined,
    });
    e.style.left = `${210 + Math.cos(a) * R}px`;
    e.style.top = `${210 + Math.sin(a) * R}px`;
    if (p.mod) e.style.borderColor = POCKET_MOD_INFO[p.mod].color;
    ring.append(e);
    const c = h('span', { class: 'ch' + (ch[p.index] > 1.2 / POCKET_COUNT ? ' hi' : ''), text: pct(ch[p.index]) });
    c.style.left = `${210 + Math.cos(a) * (R - 36)}px`;
    c.style.top = `${210 + Math.sin(a) * (R - 36)}px`;
    ring.append(c);
  }
  ring.append(h('div', { class: 'center', html: opts.center ?? '' }));
  return ring;
}

export function modLegend(): HTMLElement {
  const l = h('div', { class: 'legend' });
  for (const m of Object.values(POCKET_MOD_INFO)) l.append(h('span', { html: `<i style="background:${m.color}"></i>${m.name}: ${m.short}` }));
  l.append(h('span', { html: '<i style="background:#b48cff"></i>Vision der Kristallkugel' }));
  return l;
}

export function numberPicker(onPick: (n: number) => void): HTMLElement {
  const g = h('div', { class: 'numpick' });
  for (let n = 0; n <= 36; n++) g.append(h('button', { class: standardColor(n), text: String(n), onclick: () => onPick(n) }));
  return g;
}
