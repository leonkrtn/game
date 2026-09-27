import { CHIP_COLORS, chipLabel, CONSUMABLES, cursed, DENOMINATIONS, DEBTS, GOLD_DESC, ITEMS, MAX_POCKET_LVL, NEWS, POCKET_ITEMS, POCKET_MOD_INFO, pocketModText, RARITY, RULES, SETS, STAGES, type PocketToolId } from '../game/content';
import { FIELD_BY_ID, fieldWins, KIND_NAME } from '../game/fields';
import type { Run } from '../game/run';
import { neighborIndices, streakBonus, type Line } from '../game/scoring';
import { buildFocus, fitReason } from './guide';
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
  const step = (t.def === 'glocke' ? 0.2 : t.def === 'rabe' ? 0.4 : 0) * (t.gold ? 2 : 1);
  const now = t.def === 'rabe' ? Math.min(3 * (t.gold ? 2 : 1), t.counter * step) : t.counter * step;
  return ((t.gold && GOLD_DESC[t.def]) || d.desc).replace('{n}', fmtMult(now));
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
    if (fieldWins(f, p) && !cursed(f.kind, run.activeRule) && run.blocked !== fieldId) win += ch[i];
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

/** `compact`: walking around in first person, only the essentials stay on screen. */
export function renderOsd(run: Run, cash: number, tape: number, compact = false): void {
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
    run.suspicion > 0 ? h('div', { class: 'line', html: `<span class="${run.suspicion >= 70 ? 'warn' : 'warn-soft'}">VERDACHT ${run.suspicion}/100</span>` }) : null,
    run.news && !compact ? h('div', { class: 'line news', html: `TV: ${NEWS[run.news].headline} – ${NEWS[run.news].desc}` }) : null,
    compact ? null : h('div', {
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
    compact ? null : h('div', { class: 'line', text: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }),
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
  // The bigger the multiplier, the hotter the box: it glows, then shakes, then burns.
  const heat = st.mult >= 12 ? ' inferno' : st.mult >= 6 ? ' fire' : st.mult >= 3 ? ' hot' : '';
  const mult = h('div', { class: 'box mult' + heat }, h('span', { text: 'MULT' }), h('span', { class: 'num', text: `×${fmtMult(st.mult)}` }));
  sum.id = 'sumCell';
  mult.id = 'multCell';
  const ticker = h('div', { class: 'ticker' });
  for (const l of st.lines.slice(-5)) ticker.append(h('div', { class: 't' }, h('span', { text: l.text }), h('span', { class: `a ${l.kind}`, text: lineAmount(l) })));
  box.replaceChildren(sum, mult, ticker);
  if (st.result !== undefined && st.sum > 0) box.append(h('div', { class: 'calc num', text: `${fmt(st.sum)} × ${fmtMult(st.mult)} = ${fmt(Math.floor(st.sum * st.mult))}` }));
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
  magnet(): void;
}

export function renderTableBar(run: Run, selected: number, hd: TableHandlers, busy: boolean): void {
  const chips = $('chips');
  chips.replaceChildren();
  availableChips(run.cash + run.stakeTotal).forEach((v, i) => {
    const b = h('button', { class: 'chipbtn' + (v === selected ? ' sel' : ''), onclick: () => hd.chip(v), disabled: v > run.betLimit });
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
        : run.stakeTotal === 0 ? '<kbd>B</kbd> BESTECHEN (ERST SETZEN)' : `<kbd>B</kbd> BESTECHEN ${fmt(run.bribePrice)} · +${run.bribeSuspicion} VERDACHT`,
    }),
    h('button', {
      onclick: hd.magnet, disabled: busy || (!run.cheatMagnet && !Object.keys(run.bets).some((f) => FIELD_BY_ID[f].kind === 'straight')),
      class: run.cheatMagnet ? 'on risk' : '',
      html: run.cheatMagnet ? `<kbd>G</kbd> MAGNET AN · PLEINS ×2` : `<kbd>G</kbd> MAGNET UNTERM TISCH · +${Math.round(14 * run.magnetCost)} VERDACHT`,
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
  const rows: HTMLElement[] = [
    h('div', { class: 'title', text: `WETTSCHEIN · DREH ${run.round}/${run.cycleRounds}` }),
    h('div', { class: 'limit' },
      h('span', { text: `TISCHLIMIT ${fmt(run.stakeTotal)} / ${fmt(run.tableMax)}` }),
      h('span', { text: `PLEIN MAX ${fmt(run.fieldMax('n1'))}` })),
    h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, (run.stakeTotal / run.tableMax) * 100)}%` })),
    // At the table the tape readout is short: house rule and news live here.
    run.rule ? h('div', { class: 'rule', html: `HAUSREGEL: ${run.activeRule ? '' : '<s>'}${RULES[run.rule].name}${run.activeRule ? '' : '</s> (SONNENBRILLE)'} – ${RULES[run.rule].desc}` }) : null,
    run.news ? h('div', { class: 'news', text: `TV: ${NEWS[run.news].headline} – ${NEWS[run.news].desc}` }) : null,
  ].filter((x): x is HTMLDivElement => !!x);
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
  if (run.stats.winStreak > 0) rows.push(h('div', { class: 'boost', text: `SERIE ${run.stats.winStreak}: NÄCHSTER GEWINN +${fmtMult(streakBonus(run.stats.winStreak))} MULT` }));
  const focus = buildFocus(run);
  if (focus.length) rows.push(h('div', { class: 'boost', text: `DEIN BUILD ZAHLT AUF: ${focus.map((f) => f.focus).join(' · ')}` }));
  const boosts = boostLabels(run);
  if (boosts.length) rows.push(h('div', { class: 'boost', text: 'AKTIV: ' + boosts.join(' · ') }));
  if (run.doubleNext) rows.push(h('div', { class: 'boost hot', text: `DOPPELKUGEL: ZWEI KUGELN ROLLEN, JEDE ZAHLT FÜR SICH.${run.doubleCharges > 1 ? ` (NOCH ${run.doubleCharges})` : ''}` }));
  if (run.blocked) rows.push(h('div', { class: 'duel', text: `DER BARON SPERRT ${FIELD_BY_ID[run.blocked].label.toUpperCase()}: WETTEN DORT GEWINNEN NICHT.` }));
  rows.push(h('div', { class: 'susp' }, h('span', { text: `VERDACHT ${run.suspicion}/100` }), h('div', { class: 'meter' + (run.suspicion >= 70 ? ' danger' : '') }, h('i', { style: `width:${run.suspicion}%` }))));
  if (run.duel) {
    const f = FIELD_BY_ID[run.duel.fieldId];
    rows.push(h('div', { class: 'duel', text: run.duel.name === 'Der Baron'
      ? `DER BARON SETZT ${fmt(run.duel.stake)} AUF ${f.label.toUpperCase()}. GEWINNST DU MEHR ALS ER, SINKT DIE RATE UM 10 %.`
      : `DUELL: ${run.duel.name.toUpperCase()} SETZT ${fmt(run.duel.stake)} AUF ${f.label.toUpperCase()}. GEWINN MEHR ALS ER: +◆3 UND SEIN EINSATZ. SONST RATE +15 %.` }));
  }
  rows.push(h('div', { class: 'title small', text: `TALISMANE ${run.items.length}/${run.perks.slots} · GLÜCK ${run.luck} = ${pct(run.hopChance)} NACHHOPSER` }));
  if (!run.items.length) rows.push(h('div', { class: 'hint', text: 'Noch keine. Die Vitrine verkauft sie gegen Glücksmarken.' }));
  for (const t of run.items) {
    rows.push(h('div', { class: 'item' }, h('span', { class: 'n ' + rarityClass(t.def), text: itemName(t) }), h('span', { class: 'd', text: itemDesc(t) })));
  }
  box.replaceChildren(...rows);
}

let lastFieldKey = '';
let lastFieldChances: number[] | undefined;

export function renderFieldInfo(run: Run, fieldId: string | undefined, x: number, y: number, chances?: number[]): void {
  const box = $('fieldinfo');
  if (!fieldId) {
    box.classList.add('hidden');
    return;
  }
  // Same field, same odds: only move the box instead of rebuilding it every frame.
  const key = `${fieldId}|${run.stakeTotal}|${run.tableMax}|${run.items.length}|${chances ? chances.length : 0}`;
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  if (key === lastFieldKey && lastFieldChances === chances && !box.classList.contains('hidden')) return;
  lastFieldKey = key;
  lastFieldChances = chances;
  const f = FIELD_BY_ID[fieldId];
  const payout = f.kind === 'straight' && run.activeRule === 'halbzahl' ? 18 : f.payout;
  const stake = (run.bets[fieldId] ?? []).reduce((a, b) => a + b, 0);
  box.replaceChildren(
    h('b', { text: f.kind === 'straight' ? `PLEIN ${f.label}` : f.numbers.length ? `${KIND_NAME[f.kind]} ${f.label}` : f.label }),
    h('div', { text: `QUOTE ${payout - 1}:1 (×${payout} ZURÜCK) · CHANCE ${pct(fieldChance(run, fieldId, chances))}${run.cubeField === fieldId ? ' · VERDREHT ×3' : ''}` }),
  );
  box.append(h('div', { text: `GESETZT ${fmt(stake)} VON MAX ${fmt(run.fieldMax(fieldId))}${stake ? ' · RECHTSKLICK ZURÜCK' : ''}` }));
  // What a hit here would be worth with everything on the table, and why.
  const hit = run.previewHit(fieldId);
  if (hit) {
    const range = hit.min === hit.max ? `×${fmtMult(hit.max)}` : `×${fmtMult(hit.min)} BIS ×${fmtMult(hit.max)}`;
    box.append(h('div', { class: 'hit', text: `BEI TREFFER: MULT ${range}${hit.max > 1 ? '' : ' – NICHTS VERSTÄRKT DIESES FELD'}` }));
    if (hit.lines.length) box.append(h('div', { class: 'why', text: hit.lines.slice(0, 4).map((l) => l.text).join(' · ') }));
  }
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.classList.remove('hidden');
}

export function renderItemTip(run: Run, uid: number | undefined, x: number, y: number, hint?: string): void {
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
    ...(hint ? [h('div', { class: 'hint', text: hint })] : []),
  );
  box.style.left = `${x}px`;
  box.style.top = `${y - 10}px`;
  box.classList.remove('hidden');
}

/** Tooltip over a showcase offer: what it is, what it does, why it fits, and whether you can take it. */
export function renderShopTip(run: Run, index: number | undefined, x = 0, y = 0): void {
  const box = $('shoptip');
  const it = index === undefined ? undefined : run.shop[index];
  if (!it || it.sold) {
    box.classList.add('hidden');
    return;
  }
  const rows: (HTMLElement | null)[] = [];
  if (it.kind === 'item') {
    const d = ITEMS[it.def];
    rows.push(h('div', { class: 'r ' + rarityClass(it.def), text: RARITY[d.rarity].name + (it.fuse ? ' · MACHT DEINEN GOLDEN' : '') }));
    rows.push(h('div', { class: 'name', text: (it.fuse ? '★ ' : '') + d.name }));
    rows.push(h('div', { class: 'desc', text: (it.fuse ? GOLD_DESC[it.def] ?? d.desc : d.desc).replace(' (aktuell +{n})', '') }));
    const set = setInfo(run, it.def);
    if (set) rows.push(h('div', { class: 'set', text: set }));
    const fit = fitReason(run, it.def);
    if (fit) rows.push(h('div', { class: 'fit', text: '★ ' + fit }));
  } else {
    const p = POCKET_ITEMS[it.def as PocketToolId];
    rows.push(h('div', { class: 'r', text: 'RAD-UMBAU' }));
    rows.push(h('div', { class: 'name', text: p.name }));
    rows.push(h('div', { class: 'desc', text: p.desc }));
  }
  const full = it.kind === 'item' && !it.fuse && run.items.length >= run.perks.slots;
  const status = !run.cashierOpen ? 'GERADE GESCHLOSSEN'
    : run.marks < it.price ? `ZU WENIG GLÜCKSMARKEN (◆${run.marks}/${it.price})`
      : full ? 'DEIN TISCH IST VOLL – ERST EINEN VERKAUFEN (T)'
        : it.kind === 'item' ? `◆${it.price} · KLICK ZUM KAUFEN` : `◆${it.price} · KLICK, DANN FACH WÄHLEN`;
  rows.push(h('div', { class: 'buy' + (run.canBuy(index!) ? ' ok' : ''), text: status }));
  const key = `${index}|${run.marks}|${run.items.length}|${it.price}`;
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.replaceChildren(...rows.filter((r): r is HTMLElement => !!r));
  }
  // The card sits beside the piece, never on top of it, and stays on screen.
  box.classList.remove('hidden');
  const w = box.offsetWidth, hgt = box.offsetHeight;
  const right = x < window.innerWidth / 2;
  const left = right ? x + 70 : x - 70 - w;
  box.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, left))}px`;
  box.style.top = `${Math.max(12, Math.min(window.innerHeight - hgt - 150, y - 10))}px`;
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
  // Menus need the mouse pointer back.
  if (document.pointerLockElement) document.exitPointerLock();
  m.className = style;
  m.replaceChildren(content);
  m.onclick = (e) => {
    if (e.target === m) onBackdrop?.();
  };
  const first = m.querySelector<HTMLButtonElement>('button.card') ?? m.querySelector<HTMLButtonElement>('button.row:not(:disabled)');
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
  const ring = document.querySelector<HTMLElement & { nav?: (k: string) => boolean }>('#modal [data-nav]');
  if (ring?.nav?.(key)) return true;
  const rows = [...document.querySelectorAll<HTMLButtonElement>('#modal button.card, #modal button.row:not(:disabled)')];
  if (!rows.length) return false;
  let i = rows.findIndex((r) => r.classList.contains('sel'));
  // Cards sit side by side: left and right move between them.
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && rows[i]?.classList.contains('card')) key = key === 'ArrowLeft' ? 'ArrowUp' : 'ArrowDown';
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

const POCKET_FILL: Record<string, string> = { red: '#c8202c', black: '#141414', green: '#11804a' };
const MOD_TOOLS = new Set<string>(['gold', 'kristall', 'flamme', 'schwer', 'doppel', 'stern', 'eis']);

/** What using `tool` on pocket `p` would do, or why it would be wasted. */
function toolPreview(run: Run, tool: PocketToolId, p: Pocket): { text: string; ok: boolean; also: number[] } {
  const up = (n: number, c: string) => `${n} ${COLOR_NAME[c as keyof typeof COLOR_NAME].toUpperCase()}`;
  if (MOD_TOOLS.has(tool)) {
    const mod = tool as keyof typeof POCKET_MOD_INFO;
    const info = POCKET_MOD_INFO[mod];
    if (p.mod === mod) {
      const lvl = p.lvl ?? 1;
      if (lvl >= MAX_POCKET_LVL) return { text: `SCHON ${info.name.toUpperCase()} III – MEHR GEHT NICHT`, ok: false, also: [] };
      return { text: `${info.name.toUpperCase()} ${'I'.repeat(lvl + 1)}: ${pocketModText(mod, lvl + 1)}`, ok: true, also: [] };
    }
    const was = p.mod ? ` (ERSETZT ${POCKET_MOD_INFO[p.mod].name.toUpperCase()})` : '';
    return { text: `WIRD ${info.name.toUpperCase()}: ${pocketModText(mod, 1)}${was}`, ok: true, also: [] };
  }
  if (tool === 'farbe') {
    if (p.color === 'green') return { text: 'GRÜN WIRD ROT', ok: true, also: [] };
    return { text: `WIRD ${p.color === 'red' ? 'SCHWARZ' : 'ROT'}`, ok: true, also: [] };
  }
  if (tool === 'kopie') {
    const nb = neighborIndices(p.index);
    const same = nb.every((j) => run.wheel[j].number === p.number && run.wheel[j].color === p.color && run.wheel[j].mod === p.mod && run.wheel[j].lvl === p.lvl);
    if (same) return { text: 'DIE NACHBARN SIND SCHON KOPIEN', ok: false, also: nb };
    return { text: `${nb.map((j) => run.wheel[j].number).join(' UND ')} WERDEN ZU ${up(p.number, p.color)}${p.mod ? ' MIT ' + POCKET_MOD_INFO[p.mod].name.toUpperCase() : ''}`, ok: true, also: nb };
  }
  return { text: 'DANACH: NEUE ZAHL WÄHLEN', ok: true, also: [] };
}

/**
 * The wheel as a big flat ring, seen from above in real order: numbers outside, each pocket's
 * chance inside, effects as a coloured band around it. Hovering a pocket shows it in the middle;
 * with `pick`, clicking it (or arrows + Enter) confirms with a flash.
 */
export function wheelRing(run: Run, opts: { pick?: (p: Pocket) => void; center?: string; tool?: PocketToolId } = {}): HTMLElement {
  const box = h('div', { class: 'ring2' });
  const ch = run.chances();
  const N = POCKET_COUNT;
  const C = 300;
  const R = { modOut: 296, modIn: 272, numOut: 268, numIn: 196, chOut: 192, chIn: 150 };
  const seg = (Math.PI * 2) / N;
  const pt = (a: number, r: number) => `${(C + Math.cos(a) * r).toFixed(1)},${(C + Math.sin(a) * r).toFixed(1)}`;
  const wedge = (a0: number, a1: number, r0: number, r1: number) =>
    `M${pt(a0, r1)} A${r1},${r1} 0 0 1 ${pt(a1, r1)} L${pt(a1, r0)} A${r0},${r0} 0 0 0 ${pt(a0, r0)} Z`;
  const maxCh = Math.max(...ch);
  let svg = `<svg viewBox="0 0 600 600" class="wheelsvg"><circle cx="${C}" cy="${C}" r="${R.modOut + 3}" fill="#2a1508" stroke="#d6ad52" stroke-width="3"/>`;
  for (const p of run.wheel) {
    const mid = -Math.PI / 2 + p.index * seg;
    const a0 = mid - seg / 2, a1 = mid + seg / 2;
    const deg = (mid * 180) / Math.PI + 90;
    const hot = ch[p.index] > 1.2 / N;
    const vis = run.visions.includes(p.index);
    svg += `<g class="pk${opts.pick ? ' pickable' : ''}" data-i="${p.index}">`;
    svg += `<path class="mb" d="${wedge(a0, a1, R.modIn, R.modOut)}" fill="${p.mod ? POCKET_MOD_INFO[p.mod].color : vis ? '#b48cff' : '#3a2010'}"/>`;
    if (p.mod && (p.lvl ?? 1) > 1) svg += `<text x="${pt(mid, 284).split(',')[0]}" y="${pt(mid, 284).split(',')[1]}" class="lv" transform="rotate(${deg} ${pt(mid, 284).replace(',', ' ')})">${'I'.repeat(p.lvl ?? 1)}</text>`;
    svg += `<path class="nb" d="${wedge(a0, a1, R.numIn, R.numOut)}" fill="${POCKET_FILL[p.color]}"/>`;
    const [nx, ny] = pt(mid, 234).split(',');
    svg += `<text x="${nx}" y="${ny}" class="num" transform="rotate(${deg} ${nx} ${ny})">${p.number}</text>`;
    svg += `<path class="cb" d="${wedge(a0, a1, R.chIn, R.chOut)}" fill="rgba(255,255,255,${(0.04 + 0.22 * (ch[p.index] / maxCh)).toFixed(3)})"/>`;
    const [cx, cy] = pt(mid, 171).split(',');
    svg += `<text x="${cx}" y="${cy}" class="chv${hot ? ' hot' : ''}" transform="rotate(${deg - 90} ${cx} ${cy})">${(ch[p.index] * 100).toFixed(1).replace('.', ',')}</text>`;
    svg += `</g>`;
  }
  // Separators like brass frets.
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * seg;
    svg += `<line x1="${pt(a, R.chIn).split(',')[0]}" y1="${pt(a, R.chIn).split(',')[1]}" x2="${pt(a, R.numOut).split(',')[0]}" y2="${pt(a, R.numOut).split(',')[1]}" stroke="#d6ad52" stroke-width="1.6" opacity=".8"/>`;
  }
  svg += `<circle cx="${C}" cy="${C}" r="${R.chIn - 2}" fill="#1a0d06" stroke="#d6ad52" stroke-width="2"/></svg>`;
  const wrap = h('div', { class: 'wheelwrap2', html: svg });
  const center = h('div', { class: 'center' });
  const idle = () => center.replaceChildren(h('div', { class: 'c-idle', html: opts.center ?? '' }), h('div', { class: 'c-hint', text: opts.pick ? 'FACH ANKLICKEN · ◀ ▶ + ENTER' : 'MAUS AUF EIN FACH' }));
  idle();
  wrap.append(center);
  box.append(wrap);
  const groups = [...wrap.querySelectorAll<SVGGElement>('g.pk')];
  let sel = -1;
  let busy = false;
  const show = (i: number) => {
    sel = i;
    groups.forEach((g) => g.classList.toggle('sel', +g.dataset.i! === i));
    if (i < 0) {
      groups.forEach((g) => g.classList.remove('also'));
      idle();
      return;
    }
    const p = run.wheel[i];
    const pv = opts.tool ? toolPreview(run, opts.tool, p) : undefined;
    groups.forEach((g) => g.classList.toggle('also', !!pv?.also.includes(+g.dataset.i!)));
    center.replaceChildren(
      h('div', { class: `c-num ${p.color}`, text: String(p.number) }),
      h('div', { class: 'c-col', text: `${COLOR_NAME[p.color].toUpperCase()} · ${pct(ch[i])}` }),
      h('div', { class: 'c-mod', text: p.mod ? `${POCKET_MOD_INFO[p.mod].name.toUpperCase()}${(p.lvl ?? 1) > 1 ? ' ' + 'I'.repeat(p.lvl ?? 1) : ''}: ${pocketModText(p.mod, p.lvl)}` : run.visions.includes(i) ? 'VISION DER KRISTALLKUGEL' : 'KEIN EFFEKT' }),
      ...(pv ? [h('div', { class: 'c-pre' + (pv.ok ? '' : ' bad'), text: (pv.ok ? '→ ' : '✕ ') + pv.text })] : []),
    );
  };
  const pick = (i: number) => {
    if (!opts.pick || busy || i < 0) return;
    const p = run.wheel[i];
    if (opts.tool && !toolPreview(run, opts.tool, p).ok) {
      groups[i].classList.remove('deny');
      void groups[i].getBoundingClientRect();
      groups[i].classList.add('deny');
      return;
    }
    busy = true;
    groups[i].classList.add('picked');
    box.classList.add('picking');
    setTimeout(() => opts.pick!(p), 480);
  };
  for (const g of groups) {
    const i = +g.dataset.i!;
    g.addEventListener('mouseenter', () => !busy && show(i));
    g.addEventListener('click', () => pick(i));
  }
  wrap.addEventListener('mouseleave', () => !busy && show(-1));
  // Keyboard: navModal hands arrows and Enter to the ring first.
  (box as HTMLElement & { nav?: (k: string) => boolean }).nav = (k: string) => {
    if (busy) return true;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      show(sel < 0 ? 0 : (sel + (k === 'ArrowRight' ? 1 : N - 1)) % N);
      return true;
    }
    if ((k === 'Enter' || k === 'Space') && sel >= 0 && opts.pick) {
      pick(sel);
      return true;
    }
    return false;
  };
  box.dataset.nav = '1';
  return box;
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

// ---- The board: chances of the next spin, always on screen ---------------------------------------

let boardKey = '';

/** The odds board: where the next ball ends, by colour, halves, dozens and the hottest numbers. */
export function renderBoard(run: Run | undefined, show: boolean, frozen: boolean, side = false): void {
  const box = $('board');
  box.classList.toggle('hidden', !run || !show);
  box.classList.toggle('low', frozen);
  // At the table it sits under the bet slip, off the felt.
  box.classList.toggle('side', side && !frozen);
  if (!run || !show) return;
  // In the room: right under the tape readout, however many lines it has.
  const osd = document.querySelector('#osd .left');
  if (!frozen && !side && osd) box.style.top = `${Math.round(osd.getBoundingClientRect().bottom + 12)}px`;
  if (frozen || side) box.style.top = '';
  if (frozen) return;
  const key = [
    JSON.stringify(run.bets), run.wheel.map((p) => `${p.number}${p.color[0]}${p.mod ?? ''}${p.lvl ?? ''}`).join(), run.items.map((t) => t.def + (t.gold ? '*' : '')).join(),
    run.activeRule, run.cheatMagnet, run.bribed, run.phase, run.round, run.visions.join(), run.highRisk, run.blocked, run.luck,
  ].join('|');
  if (key === boardKey) return;
  boardKey = key;
  const ch = run.finalChances();
  const sum = (id: string) => run.wheel.reduce((a, p, i) => a + (fieldWins(FIELD_BY_ID[id], p) ? ch[i] : 0), 0);
  const cell = (label: string, v: number, cls = '') => h('span', { class: 'b-c ' + cls }, h('i', { text: label }), h('b', { text: pct(v) }));
  const byNumber = new Map<number, number>();
  run.wheel.forEach((p, i) => byNumber.set(p.number, (byNumber.get(p.number) ?? 0) + ch[i]));
  const hot = [...byNumber.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const colorOf = (n: number) => run.wheel.find((p) => p.number === n)?.color ?? 'green';
  box.replaceChildren(
    h('div', { class: 'b-head', text: 'TAFEL · CHANCEN NÄCHSTER DREH' }),
    h('div', { class: 'b-row' }, cell('ROT', sum('red'), 'red'), cell('SCHWARZ', sum('black'), 'black'), cell('GRÜN', 1 - sum('red') - sum('black'), 'green')),
    h('div', { class: 'b-row' }, cell('GERADE', sum('even')), cell('UNGERADE', sum('odd')), cell('1–18', sum('low')), cell('19–36', sum('high'))),
    h('div', { class: 'b-row' }, cell('1–12', sum('doz0')), cell('13–24', sum('doz1')), cell('25–36', sum('doz2'))),
    hot[0][1] > 1.1 / POCKET_COUNT
      ? h('div', { class: 'b-row hot' }, h('i', { text: 'HEISS' }), ...hot.filter(([, v]) => v > 1.05 / POCKET_COUNT).map(([n, v]) => h('span', { class: 'b-n ' + colorOf(n) }, h('b', { text: String(n) }), h('i', { text: pct(v) }))))
      : h('div', { class: 'b-row hot' }, h('i', { text: `JEDE ZAHL ${pct(hot[0][1])}` })),
  );
}
