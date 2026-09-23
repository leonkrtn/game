import { CHIPS, DEBTS, POCKET_ITEMS, TALISMANS } from '../game/content';
import { MAX_TALISMANS, MIN_BAG, type Run } from '../game/run';
import type { Pocket } from '../game/types';
import { COLOR_NAME } from '../game/wheel';
import { fmt, h } from './dom';
import { chipFace, itemInfo, modLegend, numberPicker, talismanDesc, wheelRing } from './ui';

export interface KasseHandlers {
  pay(): void;
  surrender(): void;
  buy(i: number): void;
  target(i: number): void;
  reroll(): void;
  sell(uid: number): void;
  close(): void;
}

export function kasseView(run: Run, hd: KasseHandlers): HTMLElement {
  const due = run.phase === 'due';
  const short = run.debt - run.money;
  const rate = h('div', { class: 'ratebox' + (due ? ' due' : '') },
    h('div', { class: 'muted', text: run.endless ? `Rate ${run.cycle + 1} (endlos)` : `Rate ${run.cycle + 1} von ${DEBTS.length}` }),
    h('div', { class: 'amount', text: fmt(run.debt) }),
    h('p', {
      html: due
        ? short > 0
          ? `Die Herren von der „Kreditabteilung" warten. Dir fehlen <b>${fmt(short)}</b>. Verkaufe Talismane – oder…`
          : 'Die Herren von der „Kreditabteilung" warten. Zeit zu zahlen.'
        : `Fällig nach Runde ${run.spinsPerCycle}. Noch <b>${run.spinsLeft}</b> Runde${run.spinsLeft === 1 ? '' : 'n'}.`,
    }),
    h('div', { class: 'row' },
      h('button', { onclick: hd.pay, disabled: !run.canPay(), text: `Rate bezahlen (${fmt(run.debt)})` }),
      due && short > 0 ? h('button', { class: 'danger', onclick: hd.surrender, text: 'Aufgeben' }) : null,
    ),
  );

  const items = h('div', { class: 'items' });
  run.shop.forEach((it, i) => {
    const info = itemInfo(it.kind, it.def);
    const direct = it.kind === 'chip' || it.kind === 'talisman';
    let reason = '';
    if (it.kind === 'talisman' && run.talismans.length >= MAX_TALISMANS) reason = 'Kein Platz';
    if (it.kind === 'service' && run.bag.length <= MIN_BAG) reason = 'Beutel zu klein';
    items.append(
      h('div', { class: 'item' + (it.sold ? ' sold' : '') },
        h('div', { class: 'icon' }, info.icon),
        h('div', { class: 'kind', text: info.kindLabel }),
        h('div', { class: 'name', text: info.name }),
        h('div', { class: 'desc', text: info.desc }),
        h('button', {
          onclick: () => (direct ? hd.buy(i) : hd.target(i)),
          disabled: !run.canBuy(i),
          text: it.sold ? 'Verkauft' : reason || fmt(it.price),
        }),
      ),
    );
  });

  const mine = h('div', { class: 'mine' });
  mine.append(h('h4', { text: `Deine Talismane (${run.talismans.length}/${MAX_TALISMANS})` }));
  if (!run.talismans.length) mine.append(h('div', { class: 'muted', text: 'Noch keine. Talismane wirken bei jedem Dreh.' }));
  for (const t of run.talismans) {
    mine.append(
      h('div', { class: 'talrow' },
        h('div', { class: 'tal', text: TALISMANS[t.def].icon }),
        h('div', { class: 'd', html: `<b>${TALISMANS[t.def].name}</b><br>${talismanDesc(t)}` }),
        h('button', { class: 'ghost', onclick: () => hd.sell(t.uid), text: `+${fmt(run.sellPrice(t.uid))}` }),
      ),
    );
  }
  mine.append(h('h4', { text: `Dein Jeton-Beutel (${run.bag.length})` }), bagView(run));

  return h('div', { class: 'panel dialog' },
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('h2', { text: 'Kasse' }),
      h('div', { class: 'row' }, h('b', { style: 'color:var(--money);font-size:20px', text: fmt(run.money) }), h('button', { class: 'ghost', onclick: hd.close, html: 'Zurück <kbd>Esc</kbd>' })),
    ),
    h('div', { class: 'kasse' },
      h('div', {},
        rate,
        h('h4', { text: 'Angebot' }),
        items,
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'ghost', onclick: hd.reroll, disabled: run.money < run.rerollCost || !run.shopOpen, text: `Neues Angebot (${fmt(run.rerollCost)})` }),
          h('span', { class: 'muted', style: 'font-size:12px', text: 'Das Angebot erneuert sich nach jeder bezahlten Rate. Preise steigen mit der Rate.' }),
        ),
      ),
      mine,
    ),
  );
}

export function bagView(run: Run, pick?: (uid: number) => void): HTMLElement {
  const bag = h('div', { class: 'bag' });
  if (pick) {
    for (const c of run.bag) {
      if (run.isPlaced(c.uid)) continue;
      bag.append(h('div', { class: 'b pick', title: CHIPS[c.def].desc, onclick: () => pick(c.uid) }, chipFace(c.def, true), CHIPS[c.def].name));
    }
    return bag;
  }
  const counts = new Map<string, number>();
  for (const c of run.bag) counts.set(c.def, (counts.get(c.def) ?? 0) + 1);
  for (const [def, n] of counts) {
    bag.append(h('div', { class: 'b', title: CHIPS[def].desc }, chipFace(def, true), `${n}× ${CHIPS[def].name}`));
  }
  return bag;
}

/** Wheel view; with `itemIndex` it lets the player apply a bought pocket item. */
export function wheelView(run: Run, close: () => void, item?: { index: number; apply: (pocket: number, num?: number) => void }): HTMLElement {
  const box = h('div', { class: 'panel dialog', style: 'max-width:560px' });
  const def = item ? POCKET_ITEMS[run.shop[item.index].def] : undefined;
  const render = (chosen?: Pocket) => {
    box.replaceChildren(
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', { text: def ? `${def.icon} ${def.name}` : 'Das Rad' }),
        h('button', { class: 'ghost', onclick: close, html: (def ? 'Abbrechen' : 'Schließen') + ' <kbd>Esc</kbd>' }),
      ),
      h('p', { class: 'muted', text: def ? (chosen ? `Welche Zahl soll Fach „${chosen.number}" bekommen?` : `${def.desc} Wähle ein Fach.`) : 'Reihenfolge wie auf dem echten Rad. Die Prozente zeigen, wie oft die Kugel in jedem Fach landet – mit deinen aktuell gesetzten Magneten.' }),
    );
    if (chosen && def?.id === 'pinsel') {
      box.append(numberPicker((n) => item!.apply(chosen.index, n)));
      box.append(h('button', { class: 'ghost', style: 'margin-top:10px', onclick: () => render(), text: 'Anderes Fach wählen' }));
      return;
    }
    box.append(
      wheelRing(run, {
        pick: def ? (p) => (def.id === 'pinsel' ? render(p) : item!.apply(p.index)) : undefined,
        center: def ? 'Klicke auf ein Fach' : `${run.wheel.filter((p) => p.color === 'red').length}× Rot<br>${run.wheel.filter((p) => p.color === 'black').length}× Schwarz<br>${run.wheel.filter((p) => p.color === 'green').length}× Grün`,
      }),
      modLegend(),
    );
  };
  render();
  return box;
}

export function chipPickerView(run: Run, close: () => void, pick: (uid: number) => void): HTMLElement {
  return h('div', { class: 'panel dialog', style: 'max-width:640px' },
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('h2', { text: '✂️ Jeton entfernen' }),
      h('button', { class: 'ghost', onclick: close, text: 'Abbrechen' }),
    ),
    h('p', { class: 'muted', text: 'Welcher Jeton soll für immer aus deinem Beutel verschwinden? Weniger schwache Jetons = öfter die guten auf der Hand.' }),
    bagView(run, pick),
  );
}

export function startView(start: () => void): HTMLElement {
  return h('div', { class: 'panel dialog', style: 'max-width:760px' },
    h('h1', { text: 'Rien ne va plus' }),
    h('p', { class: 'story', html: 'Du hast dir Geld bei den <b>falschen Leuten</b> geliehen. Viel Geld. Jetzt sitzt du in einem kleinen Casino und hoffst auf dein Glück.<br><br>Alle <b>5 Runden</b> kommen die Geldeintreiber und warten an der <b>Kasse</b> auf ihre Rate. Kannst du nicht zahlen … nun ja.' }),
    h('div', { class: 'grid2' },
      h('div', {},
        h('h4', { text: 'So läuft es' }),
        h('p', { html: 'Geh an den <b>Roulettetisch</b> und setze deine <b>Jetons</b>. Jeder Jeton hat einen Wert und oft einen Spezialeffekt. Gewinne = <span style="color:var(--sum)">Summe</span> × <span style="color:var(--mult)">Mult</span>.<br><br>An der <b>Kasse</b> zahlst du Raten und kaufst <b>Talismane</b>, neue <b>Jetons</b> und <b>Umbauten fürs Rad</b>: nummeriere Fächer um, mach sie golden oder schwer – und biege das Glück zu deinen Gunsten.' }),
      ),
      h('div', {},
        h('h4', { text: 'Steuerung' }),
        h('div', { class: 'controls', html: `
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Laufen (<kbd>Shift</kbd> rennen)</span>
          <span><kbd>E</kbd></span><span>An den Tisch / zur Kasse</span>
          <span>Linksklick</span><span>Jeton auf ein Feld setzen</span>
          <span>Rechtsklick</span><span>Jeton zurücknehmen</span>
          <span><kbd>1</kbd>–<kbd>5</kbd></span><span>Jeton wählen</span>
          <span><kbd>Leertaste</kbd></span><span>Drehen (halten = schneller)</span>
          <span><kbd>R</kbd></span><span>Hand neu ziehen</span>
          <span><kbd>V</kbd></span><span>Rad ansehen</span>
          <span><kbd>M</kbd></span><span>Ton an/aus</span>` }),
      ),
    ),
    h('div', { class: 'row', style: 'margin-top:18px' }, h('button', { onclick: start, text: 'Ins Casino gehen' })),
  );
}

export function gameOverView(run: Run, restart: () => void): HTMLElement {
  return h('div', { class: 'panel dialog caught', style: 'max-width:560px' },
    h('h1', { text: 'Erwischt.' }),
    h('p', { class: 'story', html: `Die Geldeintreiber wollten <b>${fmt(run.debt)}</b>. Du hattest <b>${fmt(run.money)}</b>. Sie waren nicht begeistert.` }),
    h('p', { class: 'muted', html: `Bezahlte Raten: <b>${run.paidRates}</b> · Runden gespielt: <b>${run.stats.spins}</b> · Bester Dreh: <b>${fmt(run.stats.bestSpin)}</b> · Insgesamt gewonnen: <b>${fmt(run.stats.totalWon)}</b>` }),
    h('div', { class: 'row' }, h('button', { onclick: restart, text: 'Neuer Versuch' })),
  );
}

export function victoryView(run: Run, endless: () => void, restart: () => void): HTMLElement {
  return h('div', { class: 'panel dialog', style: 'max-width:560px' },
    h('h1', { text: 'Frei!' }),
    h('p', { class: 'story', html: `Alle ${DEBTS.length} Raten bezahlt. Die Geldeintreiber nicken dir respektvoll zu und verschwinden.` }),
    h('p', { class: 'muted', html: `Runden: <b>${run.stats.spins}</b> · Bester Dreh: <b>${fmt(run.stats.bestSpin)}</b> · Bargeld: <b>${fmt(run.money)}</b>` }),
    h('div', { class: 'row' },
      h('button', { onclick: endless, text: 'Weiterspielen (endlos)' }),
      h('button', { class: 'ghost', onclick: restart, text: 'Neues Spiel' }),
    ),
  );
}

export const pocketName = (p: Pocket) => `${p.number} ${COLOR_NAME[p.color]}`;
