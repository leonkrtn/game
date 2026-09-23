import { DEBTS, ITEMS, OFFERS, POCKET_ITEMS, RARITY, START_KITS, type PocketToolId } from '../game/content';
import { ACHIEVEMENTS, rewardName, type Profile } from '../game/meta';
import type { Run } from '../game/run';
import type { Pocket } from '../game/types';
import { fmt, h } from './dom';
import { itemDesc, modLegend, numberPicker, rarityColor, wheelRing } from './hud';

const pct = (x: number) => Math.round(x * 100) + ' %';

function header(title: string, right: HTMLElement[], close: () => void): HTMLElement {
  return h('div', { class: 'head' },
    h('h2', { text: title }),
    h('div', { class: 'row' }, ...right, h('button', { class: 'ghost', onclick: close, html: 'Zurück <kbd>Esc</kbd>' })),
  );
}

// ---- Cashier ------------------------------------------------------------------

export interface KasseHandlers {
  deposit(amount: number): void;
  pay(): void;
  surrender(): void;
  close(): void;
}

export function kasseView(run: Run, hd: KasseHandlers): HTMLElement {
  const due = run.phase === 'due';
  const missing = Math.max(0, run.debt - run.deposit);
  const short = run.debt - run.deposit - run.cash;
  const cash = run.cash;
  const depositBtn = (label: string, amount: number) =>
    h('button', { class: 'ghost', onclick: () => hd.deposit(amount), disabled: amount <= 0 || amount > cash || !run.cashierOpen, text: label });

  let payNote = '';
  if (run.stakeTotal > 0) payNote = 'Erst deine Einsätze vom Tisch nehmen.';
  else if (!run.canPay()) payNote = `Dir fehlen noch ${fmt(short)}.`;
  else if (run.phase === 'betting') payNote = `Früh zahlen bringt Glücksmarken: +◆${run.payMarks} statt +◆${run.payMarks - run.roundsLeft}.`;

  return h('div', { class: 'panel dialog', style: 'max-width:760px' },
    header('Kasse', [h('b', { class: 'num', style: 'color:var(--money);font-size:20px', text: fmt(cash) })], hd.close),
    h('div', { class: 'cols', style: 'margin-top:16px' },
      h('div', { class: 'box' + (due ? ' alert' : '') },
        h('div', { class: 'eyebrow', text: run.endless ? `Rate ${run.cycle + 1} · endlos` : `Rate ${run.cycle + 1} von ${DEBTS.length}` }),
        h('div', { class: 'big debt', text: fmt(run.debt) }),
        h('p', {
          style: 'margin:0',
          html: due
            ? short > 0
              ? `Die Herren von der Kreditabteilung warten. Dir fehlen <b>${fmt(short)}</b>.`
              : 'Die Herren von der Kreditabteilung warten. Zeit zu zahlen.'
            : `Fällig nach Runde ${run.cycleRounds}. Noch <b>${run.roundsLeft}</b> Runde${run.roundsLeft === 1 ? '' : 'n'}.`,
        }),
        h('div', { class: 'row' },
          h('button', { onclick: hd.pay, disabled: !run.canPay(), text: `Rate bezahlen (+◆${run.payMarks})` }),
          due && short > 0 ? h('button', { class: 'danger', onclick: hd.surrender, text: 'Aufgeben' }) : null,
        ),
        payNote ? h('div', { class: 'small', text: payNote }) : null,
      ),
      h('div', { class: 'box' },
        h('div', { class: 'eyebrow', text: 'Einzahlung' }),
        h('div', { class: 'big', style: 'color:var(--brass-hi)', text: fmt(run.deposit) }),
        h('p', { class: 'small', style: 'margin:0', html: `Eingezahltes Geld ist sicher vor dem Tisch und bringt <b>${pct(run.interestRate)} Zinsen</b> nach jeder Runde. Zurück bekommst du es nicht – es ist für die Rate.` }),
        h('div', { class: 'row' },
          depositBtn('+ $10', 10),
          depositBtn('+ 25 %', Math.floor(cash * 0.25)),
          depositBtn('+ 50 %', Math.floor(cash * 0.5)),
          depositBtn('Alles', cash),
        ),
        missing > 0 ? h('button', { onclick: () => hd.deposit(Math.min(missing, cash)), disabled: cash <= 0 || !run.cashierOpen, text: `Bis zur Rate auffüllen (${fmt(Math.min(missing, cash))})` }) : h('div', { class: 'small', style: 'color:var(--money)', text: 'Die Rate ist durch deine Einzahlung gedeckt.' }),
      ),
    ),
  );
}

// ---- Showcase -------------------------------------------------------------------

export interface VitrineHandlers {
  buy(i: number): void;
  target(i: number): void;
  reroll(): void;
  sell(uid: number): void;
  move(uid: number, dir: -1 | 1): void;
  close(): void;
}

export function vitrineView(run: Run, hd: VitrineHandlers): HTMLElement {
  const offer = h('div', { class: 'cards' });
  run.shop.forEach((it, i) => {
    const isItem = it.kind === 'item';
    const name = isItem ? ITEMS[it.def].name : POCKET_ITEMS[it.def as PocketToolId].name;
    const desc = isItem ? ITEMS[it.def].desc.replace(' (aktuell +{n})', '') : POCKET_ITEMS[it.def as PocketToolId].desc;
    const label = isItem ? RARITY[ITEMS[it.def].rarity].name : 'Rad-Umbau';
    const full = isItem && run.items.length >= run.perks.slots;
    const card = h('div', { class: 'card' + (it.sold ? ' sold' : ''), style: `--rc:${isItem ? rarityColor(it.def) : '#b48cff'}` },
      h('div', { class: 'rar', text: label }),
      h('div', { class: 'name', text: name }),
      h('div', { class: 'desc', text: desc }),
      h('button', {
        onclick: () => (isItem ? hd.buy(i) : hd.target(i)),
        disabled: !run.canBuy(i),
        html: it.sold ? 'Verkauft' : full ? 'Tisch ist voll' : `<span>Kaufen · ◆${it.price}</span>`,
      }),
    );
    offer.append(card);
  });

  const mine = h('div', { class: 'mine' });
  if (!run.items.length) mine.append(h('div', { class: 'muted', text: 'Noch nichts. Talismane stehen auf deinem Tisch und wirken bei jedem Dreh.' }));
  run.items.forEach((t, i) => {
    mine.append(h('div', { class: 'it' },
      h('div', { class: 'n', style: `color:${rarityColor(t.def)}`, text: ITEMS[t.def].name }),
      h('div', { class: 'row' },
        h('button', { class: 'ghost small', onclick: () => hd.move(t.uid, -1), disabled: i === 0, title: 'Nach links', text: '◀' }),
        h('button', { class: 'ghost small', onclick: () => hd.move(t.uid, 1), disabled: i === run.items.length - 1, title: 'Nach rechts', text: '▶' }),
        h('button', { class: 'ghost small', onclick: () => hd.sell(t.uid), text: `Verkaufen +◆${run.sellPrice(t.uid)}` }),
      ),
      h('div', { class: 'd', text: itemDesc(t) }),
    ));
  });

  return h('div', { class: 'panel dialog' },
    header('Kuriositäten', [h('b', { class: 'marks', style: 'font-size:20px', text: `◆ ${run.marks}` })], hd.close),
    h('p', { class: 'muted', text: 'Bezahlt wird mit Glücksmarken. Die gibt es für jede bezahlte Rate – und mehr, wenn du früher zahlst.' }),
    h('div', { class: 'cols three' },
      h('div', {},
        h('h4', { text: 'Im Angebot' }),
        offer,
        h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'ghost', onclick: hd.reroll, disabled: run.marks < run.rerollCost || !run.cashierOpen, text: `Neu bestücken (◆${run.rerollCost})` }),
          h('span', { class: 'small', text: 'Nach jeder Rate kommt neue Ware.' }),
        ),
      ),
      h('div', {},
        h('h4', { text: `Auf deinem Tisch (${run.items.length}/${run.perks.slots})` }),
        h('div', { class: 'small', style: 'margin-bottom:6px', text: 'Die Reihenfolge zählt: der Handspiegel kopiert seinen rechten Nachbarn.' }),
        mine,
      ),
    ),
  );
}

// ---- Phone --------------------------------------------------------------------------

export function phoneView(run: Run, choose: (i: number) => void, hangUp: () => void): HTMLElement {
  const cards = h('div', { class: 'cards' });
  run.offers.forEach((id, i) => {
    const o = OFFERS[id];
    cards.append(h('div', { class: 'card offer clickable', style: '--rc:var(--danger)', onclick: () => choose(i) },
      h('div', { class: 'rar', text: 'Angebot' }),
      h('div', { class: 'name', text: o.name }),
      h('div', { class: 'desc', text: o.desc }),
    ));
  });
  const lines = [
    '„Du hast bezahlt. Respekt. Ich mag Leute, die zahlen. Ich hab da was für dich …"',
    '„Pünktlich wie ein Uhrwerk. Lass uns über dich reden, mein Freund."',
    '„Weißt du, was ich an dir mag? Du bist noch da. Hör zu …"',
  ];
  return h('div', { class: 'panel dialog', style: 'max-width:760px' },
    h('div', { class: 'head' }, h('h2', { text: 'Der Boss ist dran' }), h('button', { class: 'ghost', onclick: hangUp, text: 'Auflegen' })),
    h('p', { style: 'font-size:17px;font-style:italic', text: lines[run.paidRates % lines.length] }),
    h('h4', { text: 'Such dir eins aus' }),
    cards,
  );
}

// ---- Wheel ------------------------------------------------------------------------------

/** Wheel view; with `apply` it lets the player use a bought wheel upgrade. */
export function wheelView(run: Run, close: () => void, upgrade?: { index: number; apply: (pocket: number, num?: number) => void }): HTMLElement {
  const box = h('div', { class: 'panel dialog', style: 'max-width:560px' });
  const def = upgrade ? POCKET_ITEMS[run.shop[upgrade.index].def as PocketToolId] : undefined;
  const render = (chosen?: Pocket) => {
    box.replaceChildren(
      h('div', { class: 'head' },
        h('h2', { text: def ? def.name : 'Das Rad' }),
        h('button', { class: 'ghost', onclick: close, html: (def ? 'Abbrechen' : 'Schließen') + ' <kbd>Esc</kbd>' }),
      ),
      h('p', {
        class: 'muted',
        text: def
          ? chosen ? `Welche Zahl soll das Fach „${chosen.number}" bekommen?` : `${def.desc} Wähle ein Fach.`
          : 'Reihenfolge wie auf dem echten Rad. Die Prozente zeigen, wie oft die Kugel in dieser Runde in jedem Fach landet.',
      }),
    );
    if (chosen && def?.id === 'pinsel') {
      box.append(numberPicker((n) => upgrade!.apply(chosen.index, n)));
      box.append(h('button', { class: 'ghost', style: 'margin-top:10px', onclick: () => render(), text: 'Anderes Fach wählen' }));
      return;
    }
    const reds = run.wheel.filter((p) => p.color === 'red').length;
    const blacks = run.wheel.filter((p) => p.color === 'black').length;
    box.append(
      wheelRing(run, {
        pick: def ? (p) => (def.id === 'pinsel' ? render(p) : upgrade!.apply(p.index)) : undefined,
        center: def ? 'Klicke auf ein Fach' : `${reds}× Rot<br>${blacks}× Schwarz<br>${37 - reds - blacks}× Grün`,
      }),
      modLegend(),
    );
  };
  render();
  return box;
}

// ---- Start, collection, end ----------------------------------------------------------

export function startView(profile: Profile, locked: Set<string>, start: (kit: string) => void, collection: () => void): HTMLElement {
  let kit = locked.has(profile.lastKit) ? 'klassisch' : profile.lastKit;
  const kits = h('div', { class: 'kits' });
  const renderKits = () => {
    kits.replaceChildren();
    for (const k of Object.values(START_KITS)) {
      const isLocked = locked.has(k.id);
      const cond = ACHIEVEMENTS.find((a) => a.rewards.includes(k.id));
      kits.append(h('button', {
        class: 'kit' + (k.id === kit ? ' sel' : ''),
        disabled: isLocked,
        onclick: () => {
          kit = k.id;
          renderKits();
        },
      },
      h('span', { class: 'n', text: isLocked ? '???' : k.name }),
      h('span', { class: 'd', text: isLocked ? `Gesperrt: ${cond?.desc ?? ''}` : k.desc })));
    }
  };
  renderKits();
  const done = profile.done.length;
  return h('div', { class: 'panel dialog', style: 'max-width:820px' },
    h('div', { class: 'title-block' },
      h('h1', { text: 'Rien ne va plus' }),
      h('div', { class: 'tagline', text: 'Ein Tisch. Eine Kasse. Und Schulden bei den falschen Leuten.' }),
    ),
    h('p', { style: 'font-size:16px', html: 'Du setzt <b>dein echtes Geld</b> am Roulettetisch. Alle <b>5 Runden</b> wollen die Geldeintreiber an der <b>Kasse</b> ihre Rate. Zahl ein, was du sicher behalten willst – eingezahltes Geld bringt Zinsen. Mit <b>Glücksmarken</b> kaufst du in der Vitrine <b>Talismane</b>, die auf deinem Tisch stehen und das Glück verbiegen. Und wenn das rote Telefon klingelt: geh ran.' }),
    h('h4', { text: 'Womit fängst du an?' }),
    kits,
    h('div', { class: 'cols', style: 'margin-top:16px' },
      h('div', {},
        h('h4', { text: 'Steuerung' }),
        h('div', { class: 'controls', html: `
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Laufen, <kbd>Shift</kbd> rennen</span>
          <span><kbd>E</kbd></span><span>Tisch, Kasse, Vitrine, Telefon</span>
          <span>Linksklick</span><span>Jeton setzen (auch auf Linien und Ecken)</span>
          <span>Rechtsklick</span><span>Jeton zurücknehmen</span>
          <span><kbd>1</kbd>–<kbd>6</kbd></span><span>Jeton-Wert wählen</span>
          <span><kbd>Leertaste</kbd></span><span>Drehen, halten = schneller</span>
          <span><kbd>M</kbd></span><span>Ton an/aus</span>` }),
      ),
      h('div', {},
        h('h4', { text: 'Bisher' }),
        h('div', { class: 'lifetime', html: `<span>Spiele <b>${profile.runs}</b></span><span>Meiste Raten <b>${profile.bestRates}</b></span><span>Bester Gewinn <b>${fmt(profile.bestWin)}</b></span><span>Frei gekommen <b>${profile.wins}×</b></span>` }),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'ghost', onclick: collection, text: `Sammlung (${done}/${ACHIEVEMENTS.length})` })),
      ),
    ),
    h('div', { class: 'row', style: 'margin-top:20px' }, h('button', { onclick: () => start(kit), style: 'font-size:18px;padding:10px 22px', text: 'Ins Casino gehen' })),
  );
}

export function collectionView(profile: Profile, back: () => void): HTMLElement {
  const list = h('div', {});
  for (const a of ACHIEVEMENTS) {
    const done = profile.done.includes(a.id);
    list.append(h('div', { class: 'ach' + (done ? ' done' : '') },
      h('span', { class: 'mark', text: done ? '◆' : '◇' }),
      h('span', {}, h('span', { class: 'n', text: a.name }), ' · ', h('span', { class: 'muted', text: a.desc })),
      h('span', { class: 'r', text: (done ? 'Freigeschaltet: ' : 'Schaltet frei: ') + a.rewards.map(rewardName).join(', ') }),
    ));
  }
  return h('div', { class: 'panel dialog', style: 'max-width:680px' },
    h('div', { class: 'head' }, h('h2', { text: 'Sammlung' }), h('button', { class: 'ghost', onclick: back, text: 'Zurück' })),
    h('p', { class: 'muted', text: 'Erfolge schalten neue Talismane und Startausrüstungen frei. Sie bleiben in diesem Browser gespeichert.' }),
    list,
  );
}

export function gameOverView(run: Run, restart: () => void): HTMLElement {
  return h('div', { class: 'panel dialog caught', style: 'max-width:560px' },
    h('h1', { text: 'Erwischt.' }),
    h('p', { style: 'font-size:17px', html: `Die Geldeintreiber wollten <b>${fmt(run.debt)}</b>. Du hattest <b>${fmt(run.cash + run.deposit)}</b>. Sie waren nicht begeistert.` }),
    h('div', { class: 'lifetime', html: `<span>Bezahlte Raten <b>${run.paidRates}</b></span><span>Runden <b>${run.stats.spins}</b></span><span>Bester Gewinn <b>${fmt(run.stats.bestWin)}</b></span><span>Nachhopser <b>${run.stats.hops}</b></span>` }),
    h('div', { class: 'row', style: 'margin-top:18px' }, h('button', { onclick: restart, text: 'Noch einmal' })),
  );
}

export function victoryView(run: Run, endless: () => void, restart: () => void): HTMLElement {
  return h('div', { class: 'panel dialog', style: 'max-width:560px' },
    h('h1', { text: 'Frei!' }),
    h('p', { style: 'font-size:17px', html: `Alle ${DEBTS.length} Raten bezahlt. Die Geldeintreiber nicken dir zu und verschwinden in der Nacht.` }),
    h('div', { class: 'lifetime', html: `<span>Runden <b>${run.stats.spins}</b></span><span>Bester Gewinn <b>${fmt(run.stats.bestWin)}</b></span><span>Bargeld <b>${fmt(run.cash)}</b></span>` }),
    h('div', { class: 'row', style: 'margin-top:18px' },
      h('button', { onclick: endless, text: 'Weiterspielen (endlos)' }),
      h('button', { class: 'ghost', onclick: restart, text: 'Neues Spiel' }),
    ),
  );
}
