import { CHIP_COLORS, chipLabel, CONSUMABLES, DENOMINATIONS, DEBTS, GOLD_DESC, ITEMS, NEWS, POCKET_MOD_INFO, RARITY, RULES, SETS, STAGES } from '../game/content';
import { FIELD_BY_ID, fieldWins, KIND_NAME } from '../game/fields';
import type { Run } from '../game/run';
import type { Line } from '../game/scoring';
import type { ItemInstance, Pocket } from '../game/types';
import { COLOR_NAME, POCKET_COUNT, standardColor } from '../game/wheel';
import { $, fmt, fmtMult, h } from './dom';

export const pct = (x: number) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';

export function chipFace(value: number): HTMLElement {
  const d = CHIP_COLORS[value] ?? CHIP_COLORS[1];
  const e = h('div', { class: 'chipface', text: chipLabel(value) });
  e.style.setProperty('--c', d.face);
  e.style.setProperty('--r', d.rim);
  return e;
}

export function itemDesc(t: Pick<ItemInstance, 'def' | 'counter' | 'gold'>): string {
  const d = ITEMS[t.def];
  const step = (t.def === 'glocke' ? 0.2 : t.def === 'rabe' ? 0.5 : 0) * (t.gold ? 2 : 1);
  return ((t.gold && GOLD_DESC[t.def]) || d.desc).replace('{n}', fmtMult(t.counter * step));
}

/** Name with a star for golden talismans. */
export const itemName = (t: Pick<ItemInstance, 'def' | 'gold'>) => (t.gold ? '★ ' : '') + ITEMS[t.def].name;

/** Which set a talisman belongs to, with how many of its parts stand on the table. */
export function setInfo(run: Run, def: string): string {
  const set = SETS.find((x) => x.items.includes(def));
  if (!set) return '';
  const have = set.items.filter((d) => run.has(d)).length;
  return `SET „${set.name}" ${have}/3: ${set.desc}`;
}

export const rarityClass = (def: string) => `rar-${ITEMS[def].rarity}`;

/** Chance (0..1) that a bet on `fieldId` wins this spin, lucky hops included. */
export function fieldChance(run: Run, fieldId: string, ch = run.finalChances()): number {
  const f = FIELD_BY_ID[fieldId];
  let win = 0;
  run.wheel.forEach((p, i) => {
    if (fieldWins(f, p) && !(f.kind === 'red' && run.activeRule === 'rotfluch')) win += ch[i];
  });
  return win;
}

export function coveredCells(run: Run, fieldId: string): string[] {
  const f = FIELD_BY_ID[fieldId];
  if (f.numbers.length) return f.numbers.map((n) => `n${n}`);
  const nums = new Set<number>();
  for (const p of run.wheel) if (fieldWins(f, p)) nums.add(p.number);
  return [...nums].map((n) => `n${n}`);
}

// ---- The VCR on-screen display ------------------------------------------------------

export interface ScoreState {
  sum: number;
  mult: number;
  lines: Line[];
  result?: number;
}

/** Tape counter from seconds, like a VCR: 0:12:43. */
function counter(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function renderOsd(run: Run, cash: number, tape: number): void {
  const box = $('osd');
  box.classList.remove('hidden');
  const due = run.phase === 'due';
  const covered = run.deposit + run.cash >= run.debt;
  const rateNo = run.endless ? `RATE ${run.cycle + 1}` : `RATE ${run.cycle + 1}/${DEBTS.length}`;
  const left = h('div', { class: 'left' },
    h('div', { class: 'play', html: '▶ PLAY <span style="font-size:24px">SP</span>' }),
    h('div', { class: 'line', html: `${rateNo} <span class="debt">${fmt(run.debt)}</span>  ${due ? '<span class="warn">JETZT FÄLLIG</span>' : run.roundsLeft === 0 ? 'ALLE DREHS GESPIELT' : `DREH ${run.round}/${run.cycleRounds}`}` }),
    h('div', { class: 'line', html: `KASSE <span class="debt">${fmt(run.deposit)}</span>  ${run.deposit >= run.debt ? '<span class="money">RATE GEDECKT</span>' : covered ? `NOCH ${fmt(run.debt - run.deposit)} – BARGELD REICHT` : `<span class="warn-soft">FEHLT ${fmt(run.debt - run.deposit - run.cash)}</span>`}` }),
    h('div', { class: 'line', html: `BARGELD <span class="money">${fmt(cash)}</span>${run.stakeTotal ? `  IM SPIEL ${fmt(run.stakeTotal)}` : ''}` }),
    h('div', { class: 'line', html: `<span class="marks">◆${run.marks}</span>  <span class="luck">GLÜCK ${run.luck}</span>  ZINS ${pct(run.interestRate)}  TALISMANE ${run.items.length}/${run.perks.slots}` }),
    run.news ? h('div', { class: 'line news', html: `TV: ${NEWS[run.news].headline} – ${NEWS[run.news].desc}` }) : null,
    h('div', {
      class: 'rule',
      html: run.rule
        ? `HAUSREGEL: ${run.activeRule ? '' : '<s>'}${RULES[run.rule].name}${run.activeRule ? '' : '</s> (SONNENBRILLE)'} – ${RULES[run.rule].desc}`
        : `NÄCHSTE HAUSREGEL: ${RULES[run.nextRule].name}`,
    }),
  );
  const d = new Date(1987, 9, 14 + run.cycle, 23, 12 + Math.floor(tape / 60));
  const days = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  const months = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
  const right = h('div', { class: 'right' },
    h('div', { class: 'play', html: `<span class="rec">●</span> ${counter(tape)}` }),
    h('div', { class: 'line', text: `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${months[d.getMonth()]}.${d.getFullYear()}` }),
    h('div', { class: 'line', text: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }),
    run.stage ? h('div', { class: 'line debt', text: `STUFE ${run.stage}: ${STAGES[run.stage].name}` }) : null,
  );
  box.replaceChildren(left, right);
}

export function hideOsd(): void {
  $('osd').classList.add('hidden');
  $('score').classList.add('hidden');
}

export function lineAmount(l: Line): string {
  switch (l.kind) {
    case 'bet': return `+${fmt(l.amount)}`;
    case 'add': return 'MULT';
    case 'mul': return 'MULT';
    case 'money': return `+${fmt(l.amount)}`;
    case 'marks': return `+◆${l.amount}`;
  }
}

export function renderScore(st?: ScoreState): void {
  const box = $('score');
  if (!st) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const sum = h('div', { class: 'box sum' }, h('span', { text: 'SUMME' }), h('span', { class: 'num', text: fmt(st.sum) }));
  const mult = h('div', { class: 'box mult' }, h('span', { text: 'MULT' }), h('span', { class: 'num', text: `×${fmtMult(st.mult)}` }));
  sum.id = 'sumCell';
  mult.id = 'multCell';
  const ticker = h('div', { class: 'ticker' });
  for (const l of st.lines.slice(-5)) ticker.append(h('div', { class: 't' }, h('span', { text: l.text }), h('span', { class: `a ${l.kind}`, text: lineAmount(l) })));
  box.replaceChildren(sum, mult, ticker);
  if (st.result !== undefined) box.append(h('div', { class: 'result num ' + (st.result >= 0 ? 'plus' : 'minus'), text: (st.result >= 0 ? '+' : '−') + fmt(Math.abs(st.result)) }));
}

export function bump(which: 'sum' | 'mult'): void {
  const el = document.getElementById(which === 'sum' ? 'sumCell' : 'multCell');
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ---- Chip tray -------------------------------------------------------------------------

export function availableChips(cash: number): number[] {
  return DENOMINATIONS.filter((d) => d <= Math.max(1, cash)).slice(-6);
}

export interface TableHandlers {
  chip(v: number): void;
  spin(): void;
  repeat(): void;
  clear(): void;
  leave(): void;
  wheel(): void;
  bribe(): void;
  risk(): void;
  smoke(i: number): void;
}

export function renderTableBar(run: Run, selected: number, hd: TableHandlers, busy: boolean): void {
  const chips = $('chips');
  chips.replaceChildren();
  availableChips(run.cash + run.stakeTotal).forEach((v, i) => {
    const b = h('button', { class: 'chipbtn' + (v === selected ? ' sel' : ''), onclick: () => hd.chip(v), disabled: v > run.cash });
    b.append(chipFace(v), h('span', { class: 'k', text: `${i + 1}` }));
    chips.append(b);
  });
  const hasLast = Object.keys(run.lastBets).length > 0;
  $('actions').replaceChildren(
    h('button', { onclick: hd.spin, disabled: busy || run.phase !== 'betting', html: '<kbd>LEER</kbd> DREHEN' }),
    h('button', { onclick: hd.repeat, disabled: busy || !hasLast || run.stakeTotal > 0, html: '<kbd>R</kbd> WIEDERHOLEN' }),
    h('button', { onclick: hd.clear, disabled: busy || run.stakeTotal === 0, html: '<kbd>C</kbd> ABRÄUMEN' }),
    h('button', { onclick: hd.wheel, disabled: busy, html: '<kbd>V</kbd> RAD' }),
    h('button', { onclick: hd.leave, disabled: busy, html: '<kbd>ESC</kbd> AUFSTEHEN' }),
  );
  const extra = h('div', { class: 'extra' },
    h('button', {
      onclick: hd.bribe, disabled: busy || (!run.bribed && (run.stakeTotal === 0 || run.cash < run.bribePrice)),
      class: run.bribed ? 'on' : '',
      html: run.bribed
        ? `<kbd>B</kbd> BESTOCHEN · ${fmt(run.bribePrice)} BEIM DREHEN`
        : run.stakeTotal === 0 ? '<kbd>B</kbd> BESTECHEN (ERST SETZEN)' : `<kbd>B</kbd> BESTECHEN ${fmt(run.bribePrice)} · RISIKO ${pct(run.bribeRisk)}`,
    }),
    run.roundsLeft === 1 ? h('button', {
      onclick: hd.risk, disabled: busy || !run.canHighRisk, class: run.highRisk ? 'on risk' : 'risk',
      html: run.highRisk ? `<kbd>H</kbd> HOCHRISIKO AN · ×2 MULT · ZUSCHLAG ${fmt(run.riskStake)}` : `<kbd>H</kbd> HOCHRISIKO: ZUSCHLAG ${fmt(run.stakeTotal)}, ×2 MULT`,
    }) : null,
    ...run.smokes.map((id, i) => h('button', { onclick: () => hd.smoke(i), disabled: busy, title: CONSUMABLES[id].desc, html: `<kbd>${7 + i}</kbd> ${CONSUMABLES[id].name.toUpperCase()}` })),
  );
  $('actions').append(extra);
}

/** Active one-shot effects for the next spin, as short labels. */
export function boostLabels(run: Run): string[] {
  const b = run.boost;
  const out: string[] = [];
  if (b.luck) out.push(`GLÜCK +${b.luck}`);
  if (b.gezinkt) out.push('GEZINKTE KUGEL');
  if (b.kreide) out.push('KREIDE AUF PLEINS');
  if (b.kaugummi) out.push('KAUGUMMI');
  if (b.korn) out.push('DOPPELKORN +2 MULT');
  if (run.bribed) out.push('CROUPIER BESTOCHEN');
  if (run.highRisk) out.push('HOCHRISIKO ×2');
  return out;
}

/** The bet slip next to the table: every bet with payout, chance and what it would bring. */
export function renderSlip(run: Run, show: boolean): void {
  const box = $('slip');
  if (!show) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const rows: HTMLElement[] = [h('div', { class: 'title', text: `WETTSCHEIN · DREH ${run.round}/${run.cycleRounds}` })];
  const bets = Object.entries(run.bets);
  const ch = run.finalChances();
  if (!bets.length) {
    rows.push(h('div', { class: 'hint', text: 'Klick aufs Feld setzt den gewählten Jeton. Auch Linien und Ecken zwischen Zahlen sind Wetten (Cheval, Carré …).' }));
  }
  for (const [fid, stack] of bets) {
    const f = FIELD_BY_ID[fid];
    const stake = stack.reduce((a, b) => a + b, 0);
    const payout = f.kind === 'straight' && run.activeRule === 'halbzahl' ? 18 : f.payout;
    const name = f.kind === 'straight' ? `PLEIN ${f.label}` : f.numbers.length ? `${KIND_NAME[f.kind].split(' ')[0]} ${f.label}` : f.label;
    rows.push(h('div', { class: 'bet' },
      h('span', { class: 'n', text: name }),
      h('span', { text: fmt(stake) }),
      h('span', { class: 'c', text: pct(fieldChance(run, fid, ch)) }),
      h('span', { class: 'w', text: `→ ${fmt(stake * payout)}` }),
    ));
  }
  if (bets.length) {
    // Exact outlook with every talisman, boost, hop and house rule counted.
    const o = run.outlook();
    const ev = Math.round(o.ev);
    rows.push(h('div', { class: 'sum' }, h('span', { text: `EINSATZ ${fmt(run.stakeTotal + run.riskStake)}` }), h('span', { text: `TRIFFT ${pct(o.pWin)}` })));
    rows.push(h('div', { class: 'ev ' + (ev >= 0 ? 'plus' : 'minus'), text: `IM SCHNITT ${ev >= 0 ? '+' : '−'}${fmt(Math.abs(ev))} PRO DREH (${ev >= 0 ? '+' : '−'}${pct(Math.abs(o.ev) / Math.max(1, run.stakeTotal + run.riskStake))})` }));
    rows.push(h('div', { class: 'hint', text: 'Gewinn = Summe × Mult. Talismane erhöhen den Mult. Ohne Talismane verliert Roulette im Schnitt 2,7 %.' }));
  }
  const boosts = boostLabels(run);
  if (boosts.length) rows.push(h('div', { class: 'boost', text: 'AKTIV: ' + boosts.join(' · ') }));
  if (run.duel) {
    const f = FIELD_BY_ID[run.duel.fieldId];
    rows.push(h('div', { class: 'duel', text: `DUELL: ${run.duel.name.toUpperCase()} SETZT ${fmt(run.duel.stake)} AUF ${f.label.toUpperCase()}. GEWINN MEHR ALS ER: +◆3 UND SEIN EINSATZ. SONST RATE +15 %.` }));
  }
  rows.push(h('div', { class: 'title small', text: `TALISMANE ${run.items.length}/${run.perks.slots} · GLÜCK ${run.luck} = ${pct(run.hopChance)} NACHHOPSER` }));
  if (!run.items.length) rows.push(h('div', { class: 'hint', text: 'Noch keine. Die Vitrine verkauft sie gegen Glücksmarken.' }));
  for (const t of run.items) {
    rows.push(h('div', { class: 'item' }, h('span', { class: 'n ' + rarityClass(t.def), text: itemName(t) }), h('span', { class: 'd', text: itemDesc(t) })));
  }
  box.replaceChildren(...rows);
}

export function renderFieldInfo(run: Run, fieldId: string | undefined, x: number, y: number): void {
  const box = $('fieldinfo');
  if (!fieldId) {
    box.classList.add('hidden');
    return;
  }
  const f = FIELD_BY_ID[fieldId];
  const payout = f.kind === 'straight' && run.activeRule === 'halbzahl' ? 18 : f.payout;
  const stake = (run.bets[fieldId] ?? []).reduce((a, b) => a + b, 0);
  box.replaceChildren(
    h('b', { text: f.kind === 'straight' ? `PLEIN ${f.label}` : f.numbers.length ? `${KIND_NAME[f.kind]} ${f.label}` : f.label }),
    h('div', { text: `QUOTE ${payout - 1}:1 (×${payout} ZURÜCK) · CHANCE ${pct(fieldChance(run, fieldId))}${run.cubeField === fieldId ? ' · VERDREHT ×3' : ''}` }),
  );
  if (stake) box.append(h('div', { text: `GESETZT ${fmt(stake)} · RECHTSKLICK ZURÜCK` }));
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
    h('div', { class: rarityClass(t.def), text: RARITY[d.rarity].name }),
    h('div', { class: 'name', text: d.name }),
    h('div', { class: 'desc', text: itemDesc(t) }),
  );
  box.style.left = `${x}px`;
  box.style.top = `${y - 10}px`;
  box.classList.remove('hidden');
}

// ---- Floaters, subtitles, prompts ---------------------------------------------------------

export function floater(text: string, x: number, y: number, color = 'var(--money)', size = 34): void {
  const e = h('div', { class: 'floater', text, style: `left:${x}px;top:${y}px;color:${color};font-size:${size}px` });
  $('floaters').append(e);
  setTimeout(() => e.remove(), 1400);
}

export function toast(html: string, cls = ''): void {
  const box = $('toasts');
  const e = h('div', { class: `toast ${cls}`, html });
  box.append(e);
  while (box.children.length > 4) box.firstElementChild?.remove();
  setTimeout(() => e.remove(), 3500);
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

// ---- Menus -------------------------------------------------------------------------------

export type MenuStyle = 'vcr' | 'clear' | 'black';

export function openModal(content: HTMLElement, style: MenuStyle = 'vcr', onBackdrop?: () => void): void {
  const m = $('modal');
  m.className = style;
  m.replaceChildren(content);
  m.onclick = (e) => {
    if (e.target === m) onBackdrop?.();
  };
  const first = m.querySelector<HTMLButtonElement>('button.row:not(:disabled)');
  first?.classList.add('sel');
}

export function closeModal(): void {
  const m = $('modal');
  m.className = 'hidden';
  m.replaceChildren();
}

export function modalOpen(): boolean {
  return !$('modal').classList.contains('hidden');
}

/** Arrow keys move the highlight through menu rows, Enter activates it. */
export function navModal(key: string): boolean {
  const rows = [...document.querySelectorAll<HTMLButtonElement>('#modal button.row:not(:disabled)')];
  if (!rows.length) return false;
  let i = rows.findIndex((r) => r.classList.contains('sel'));
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    rows[i]?.classList.remove('sel');
    i = key === 'ArrowDown' ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
    rows[i].classList.add('sel');
    rows[i].scrollIntoView({ block: 'nearest' });
    rows[i].dispatchEvent(new Event('mouseenter'));
    return true;
  }
  if ((key === 'Enter' || key === 'Space') && rows[i]) {
    rows[i].click();
    return true;
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const r = rows[i];
    r?.dispatchEvent(new CustomEvent('step', { detail: key === 'ArrowLeft' ? -1 : 1 }));
    return true;
  }
  return false;
}

/** A menu row: label on the left, value on the right. */
export function row(label: string, value: string | HTMLElement = '', onclick?: () => void, opts: { disabled?: boolean; onHover?: () => void; onStep?: (d: number) => void; cls?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: 'row' + (opts.cls ? ` ${opts.cls}` : ''), onclick, disabled: opts.disabled });
  b.append(h('span', { html: label }), typeof value === 'string' ? h('span', { class: 'v', html: value }) : value);
  b.addEventListener('mouseenter', () => {
    document.querySelectorAll('#modal button.row.sel').forEach((r) => r !== b && r.classList.remove('sel'));
    b.classList.add('sel');
    opts.onHover?.();
  });
  if (opts.onStep) b.addEventListener('step', (e) => opts.onStep!((e as CustomEvent).detail));
  return b;
}

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
    const c = h('span', { class: 'ch', text: pct(ch[p.index]) });
    c.style.left = `${210 + Math.cos(a) * (R - 38)}px`;
    c.style.top = `${210 + Math.sin(a) * (R - 38)}px`;
    if (ch[p.index] > 1.2 / POCKET_COUNT) c.style.color = 'var(--debt)';
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
