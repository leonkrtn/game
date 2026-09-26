import { ITEMS, POCKET_ITEMS, SETS, type PocketToolId } from '../game/content';
import type { Run } from '../game/run';
import { streakBonus } from '../game/scoring';
import { $, fmt, fmtMult, h } from './dom';

/** Which bet a talisman rewards, in the player's words. */
const FOCUS: Record<string, string> = {
  kerze: 'ROT',
  katze: 'SCHWARZ',
  wuerfel: 'GERADE/UNGERADE · 1–18/19–36',
  abakus: 'DUTZEND · KOLONNE',
  winkekatze: 'PLEINS',
  walkman: 'NUR PLEINS',
  magnet: 'PLEINS',
  pager: 'PLEINS',
  fernglas: 'CHEVAL · CARRÉ',
  totenkopf: 'DIE 0',
  zinnsoldat: '4+ FELDER',
  zigarre: 'HALBES BARGELD',
  kassette: 'IMMER DASSELBE',
  zauberwuerfel: 'DAS LILA FELD',
};

/** Bets the current talismans reward, strongest first, each with the talismans behind it. */
export function buildFocus(run: Run): { focus: string; items: string[] }[] {
  const out = new Map<string, string[]>();
  for (const t of run.items) {
    const f = FOCUS[t.def];
    if (f) out.set(f, [...(out.get(f) ?? []), ITEMS[t.def].name]);
  }
  return [...out.entries()].map(([focus, items]) => ({ focus, items })).sort((a, b) => b.items.length - a.items.length);
}

/** Why a showcase talisman would suit this run, or undefined. */
export function fitReason(run: Run, def: string): string | undefined {
  if (run.items.some((t) => t.def === def && !t.gold)) return 'MACHT DEINEN GOLDEN';
  const set = SETS.find((s) => s.items.includes(def));
  const have = set ? set.items.filter((d) => run.has(d)).length : 0;
  if (set && have === 2) return `VOLLENDET SET „${set.name.toUpperCase()}"`;
  const f = FOCUS[def];
  const same = f && run.items.find((t) => FOCUS[t.def] === f);
  if (same) return `PASST ZU ${ITEMS[same.def].name.toUpperCase()} (${f})`;
  if (set && have === 1) return `SET „${set.name.toUpperCase()}" 2/3`;
  return undefined;
}

/** What to do next and why, in one line. */
function nextStep(run: Run): string {
  const held = run.deposit + run.cash;
  if (run.phase === 'due') {
    return held >= run.debt ? `GEH ZUR KASSE UND ZAHL ${fmt(run.debt)} – SONST HOLEN SIE ES SICH.` : `DIR FEHLEN ${fmt(run.debt - held)}. GEH ZUR KASSE UND BETE.`;
  }
  if (run.bossRate) return `DER BARON SPIELT GEGEN DICH: SCHLAG IHN BEI EINEM DREH, DANN SINKT DIE RATE UM 10 %.`;
  if (run.suspicion >= 70) return `VERDACHT ${run.suspicion}: SPIEL EIN PAAR DREHS EHRLICH, SONST KOMMT DER SAALCHEF.`;
  const affordable = run.shop.map((s, i) => ({ s, i })).filter(({ i }) => run.canBuy(i));
  if (affordable.length) {
    const fit = affordable.find(({ s }) => s.kind === 'item' && fitReason(run, s.def));
    const pick = fit ?? affordable.find(({ s }) => s.kind === 'item') ?? affordable[0];
    const name = pick.s.kind === 'item' ? ITEMS[pick.s.def].name : POCKET_ITEMS[pick.s.def as PocketToolId].name;
    if (!run.items.length) return `KAUF IN DER VITRINE EINEN TALISMAN (◆${run.marks}): OHNE MULT GEWINNT AUF DAUER DAS HAUS.`;
    return `VITRINE: ${name.toUpperCase()} FÜR ◆${pick.s.price}${fit ? ' – ' + fitReason(run, pick.s.def) : ''}.`;
  }
  if (held >= run.debt && run.deposit < run.debt) {
    return `RATE GEDECKT: ZAHL ${fmt(run.debt - run.deposit)} AN DER KASSE EIN – DORT IST ES SICHER UND BRINGT ZINSEN.`;
  }
  const focus = buildFocus(run);
  if (focus.length) return `AN DEN TISCH: DEIN BUILD ZAHLT AUF ${focus[0].focus} (${focus[0].items.join(', ').toUpperCase()}).`;
  return `AN DEN TISCH: DU BRAUCHST NOCH ${fmt(Math.max(0, run.debt - held))} IN ${run.roundsLeft} ${run.roundsLeft === 1 ? 'DREH' : 'DREHS'}.`;
}

let lastGoal = '';

/** The goal strip at the top: how far the rate is, what to do next, and the running streak. */
export function renderGoal(run: Run | undefined, show: boolean): void {
  const box = $('goal');
  if (!run || !show) {
    box.classList.add('hidden');
    lastGoal = '';
    return;
  }
  const held = run.deposit + run.cash;
  const share = Math.min(1, held / Math.max(1, run.debt));
  const streak = run.stats.winStreak;
  const key = [held, run.debt, run.round, run.phase, run.marks, run.items.length, run.suspicion, streak, run.shop.map((s) => s.sold).join()].join('|');
  box.classList.remove('hidden');
  if (key === lastGoal) return;
  lastGoal = key;
  const due = run.phase === 'due';
  const left = run.roundsLeft;
  box.replaceChildren(
    h('div', { class: 'g-bar' + (share >= 1 ? ' full' : '') },
      h('i', { style: `width:${Math.round(share * 100)}%` }),
      h('span', { text: share >= 1 ? `RATE ${fmt(run.debt)} GEDECKT · DU HAST ${fmt(held)}` : `RATE ${fmt(run.debt)} · DU HAST ${fmt(held)}` }),
      h('span', { class: 'g-when', text: due ? 'JETZT FÄLLIG' : `IN ${left} ${left === 1 ? 'DREH' : 'DREHS'}` })),
    h('div', { class: 'g-next', text: '▶ ' + nextStep(run) }),
    ...(streak > 0 ? [h('div', { class: 'g-streak', text: `SERIE ${streak} · NÄCHSTER GEWINN +${fmtMult(streakBonus(streak))} MULT${(streak + 1) % 3 === 0 ? ' UND +◆1' : ''}` })] : []),
  );
}
