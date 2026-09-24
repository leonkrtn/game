import { DEBTS, ITEMS, OFFERS, POCKET_ITEMS, POCKET_MOD_INFO, RARITY, STAGES, START_KITS, type PocketToolId } from '../game/content';
import { ACHIEVEMENTS, rewardName, type Profile } from '../game/meta';
import type { Run } from '../game/run';
import type { Pocket } from '../game/types';
import type { ItemPreview } from '../world/preview';
import { fmt, h } from './dom';
import { itemDesc, modLegend, numberPicker, pct, rarityClass, row, wheelRing } from './hud';

function head(title: string, right = ''): HTMLElement {
  return h('div', { class: 'head' }, h('h2', { text: title }), h('span', { html: right }));
}

const label = (text: string) => h('div', { class: 'label', text });

// ---- Cashier --------------------------------------------------------------------------

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
  const dep = (text: string, amount: number) => row(text, fmt(Math.max(0, Math.floor(amount))), () => hd.deposit(amount), { disabled: amount < 1 || amount > cash || !run.cashierOpen });

  let payNote = '';
  if (run.stakeTotal > 0) payNote = 'Erst deine Einsätze vom Tisch nehmen.';
  else if (!run.canPay()) payNote = `Dir fehlen noch ${fmt(short)}.`;
  else if (run.phase === 'betting') payNote = `Früh zahlen bringt mehr Glücksmarken: +◆${run.payMarks} statt +◆${run.payMarks - run.roundsLeft}.`;

  return h('div', { class: 'menu' },
    head('KASSE 01', `BARGELD <span class="money-c">${fmt(cash)}</span>`),
    h('div', { class: 'cols' },
      h('div', { class: 'rows' },
        label(run.endless ? `RATE ${run.cycle + 1} · ENDLOS` : `RATE ${run.cycle + 1} VON ${DEBTS.length}`),
        h('div', { class: 'stat' }, h('span', { text: 'FÄLLIG' }), h('span', { class: 'debt-c', text: fmt(run.debt) })),
        h('div', { class: 'stat' }, h('span', { text: 'EINGEZAHLT' }), h('span', { text: fmt(run.deposit) })),
        h('div', { class: 'stat' }, h('span', { text: due ? 'STATUS' : 'NOCH' }), h('span', { class: due ? 'rec-c' : '', text: due ? 'JETZT FÄLLIG' : `${run.roundsLeft} RUNDE${run.roundsLeft === 1 ? '' : 'N'}` })),
        label('AKTIONEN'),
        row('RATE BEZAHLEN', `+◆${run.payMarks}`, hd.pay, { disabled: !run.canPay() }),
        payNote ? h('div', { class: 'info', text: payNote }) : null,
        due && short > 0 ? row('<span class="rec-c">AUFGEBEN</span>', '', hd.surrender) : null,
        row('ZURÜCK', 'ESC', hd.close),
      ),
      h('div', { class: 'rows' },
        label(`EINZAHLEN · ${pct(run.interestRate)} ZINSEN PRO RUNDE`),
        h('div', { class: 'info', text: 'Eingezahltes Geld ist sicher vor dem Tisch und wächst nach jeder Runde. Zurück bekommst du es nicht – es gehört der Rate.' }),
        missing > 0 ? dep('BIS ZUR RATE', Math.min(missing, cash)) : h('div', { class: 'info money-c', text: 'Die Rate ist durch deine Einzahlung gedeckt.' }),
        dep('+ $10', 10),
        dep('+ 25 %', cash * 0.25),
        dep('+ 50 %', cash * 0.5),
        dep('ALLES', cash),
      ),
    ),
  );
}

// ---- Showcase ----------------------------------------------------------------------------

export interface VitrineHandlers {
  buy(i: number): void;
  target(i: number): void;
  reroll(): void;
  sell(uid: number): void;
  move(uid: number, dir: -1 | 1): void;
  close(): void;
}

export function vitrineView(run: Run, hd: VitrineHandlers, preview: ItemPreview): HTMLElement {
  const name = h('div', { class: 'name' });
  const rar = h('div', {});
  const desc = h('div', { class: 'desc' });
  const show = (kind: 'item' | 'pocket', def: string, owned?: { counter: number; uid: number }) => {
    if (kind === 'item') {
      const d = ITEMS[def];
      name.textContent = d.name;
      name.className = 'name ' + rarityClass(def);
      rar.textContent = RARITY[d.rarity].name.toUpperCase() + (owned ? ' · AUF DEINEM TISCH' : '');
      desc.textContent = owned ? itemDesc({ def, counter: owned.counter, uid: owned.uid }) : d.desc.replace(' (aktuell +{n})', '');
      preview.show(def);
    } else {
      const p = POCKET_ITEMS[def as PocketToolId];
      name.textContent = p.name;
      name.className = 'name';
      rar.textContent = 'RAD-UMBAU';
      desc.textContent = p.desc;
      preview.show('upgrade:' + def, POCKET_MOD_INFO[def as keyof typeof POCKET_MOD_INFO]?.color ?? (def === 'pinsel' ? '#e8e0d0' : '#7a7aff'));
    }
  };

  const offer = h('div', { class: 'rows' }, label('IM ANGEBOT · PREIS IN GLÜCKSMARKEN'));
  run.shop.forEach((it, i) => {
    const isItem = it.kind === 'item';
    const n = isItem ? ITEMS[it.def].name : POCKET_ITEMS[it.def as PocketToolId].name;
    const full = isItem && run.items.length >= run.perks.slots;
    const cls = isItem ? rarityClass(it.def) : '';
    const value = it.sold ? 'VERKAUFT' : full ? 'TISCH VOLL' : `<span class="price">◆${it.price}</span>`;
    offer.append(row(`<span class="${cls}">${n}</span>`, value, () => (isItem ? hd.buy(i) : hd.target(i)), {
      disabled: !run.canBuy(i),
      onHover: () => show(isItem ? 'item' : 'pocket', it.def),
    }));
  });
  offer.append(row('NEU BESTÜCKEN', `<span class="price">◆${run.rerollCost}</span>`, hd.reroll, { disabled: run.marks < run.rerollCost || !run.cashierOpen }));

  const mine = h('div', { class: 'rows' }, label(`AUF DEINEM TISCH ${run.items.length}/${run.perks.slots} · ◀ ▶ VERSCHIEBEN, ENTER VERKAUFT`));
  if (!run.items.length) mine.append(h('div', { class: 'info', text: 'Noch nichts. Talismane stehen auf deinem Tisch und wirken bei jedem Dreh. Die Reihenfolge zählt für den Handspiegel.' }));
  run.items.forEach((t) => {
    mine.append(row(`<span class="${rarityClass(t.def)}">${ITEMS[t.def].name}</span>`, `VERKAUFEN +◆${run.sellPrice(t.uid)}`, () => hd.sell(t.uid), {
      onHover: () => show('item', t.def, t),
      onStep: (d) => hd.move(t.uid, d as -1 | 1),
    }));
  });
  mine.append(row('ZURÜCK', 'ESC', hd.close));

  const first = run.shop.find((s) => !s.sold) ?? run.shop[0];
  if (first) show(first.kind === 'item' ? 'item' : 'pocket', first.def);
  else if (run.items[0]) show('item', run.items[0].def, run.items[0]);

  return h('div', { class: 'menu' },
    head('KURIOSITÄTEN', `<span class="price">◆ ${run.marks} GLÜCKSMARKEN</span>`),
    h('div', { class: 'cols' },
      h('div', { class: 'rows', style: 'gap:10px' }, offer, mine),
      h('div', { class: 'preview' }, preview.canvas, rar, name, desc),
    ),
  );
}

// ---- Phone ---------------------------------------------------------------------------------

export function phoneView(run: Run, choose: (i: number) => void, hangUp: () => void): HTMLElement {
  const lines = [
    '„Du hast bezahlt. Respekt. Ich mag Leute, die zahlen. Ich hab da was für dich …"',
    '„Pünktlich wie ein Uhrwerk. Lass uns über dich reden, mein Freund."',
    '„Weißt du, was ich an dir mag? Du bist noch da. Hör zu …"',
  ];
  const detail = h('div', { class: 'info', style: 'min-height:2.3em' });
  const rows = h('div', { class: 'rows' });
  run.offers.forEach((id, i) => {
    const o = OFFERS[id];
    rows.append(row(o.name, '', () => choose(i), { onHover: () => (detail.textContent = o.desc) }));
  });
  rows.append(row('AUFLEGEN', '', hangUp, { onHover: () => (detail.textContent = 'Der Boss mag es nicht, wenn man auflegt.') }));
  if (run.offers[0]) detail.textContent = OFFERS[run.offers[0]].desc;
  return h('div', { class: 'menu', style: 'margin-top:auto;margin-bottom:6vh;width:min(900px,100%)' },
    h('div', { style: 'color:var(--luck);font-size:32px;text-align:center', text: 'BOSS: ' + lines[run.paidRates % lines.length] }),
    rows,
    detail,
  );
}

// ---- Wheel ------------------------------------------------------------------------------------

export function wheelView(run: Run, close: () => void, upgrade?: { index: number; apply: (pocket: number, num?: number) => void }): HTMLElement {
  const box = h('div', { class: 'menu', style: 'width:min(640px,100%)' });
  const def = upgrade ? POCKET_ITEMS[run.shop[upgrade.index].def as PocketToolId] : undefined;
  const render = (chosen?: Pocket) => {
    box.replaceChildren(
      head(def ? def.name : 'DAS RAD', 'ESC ZURÜCK'),
      h('p', {
        class: 'info',
        text: def
          ? chosen ? `Welche Zahl soll das Fach „${chosen.number}" bekommen?` : `${def.desc} Klicke auf ein Fach.`
          : 'Reihenfolge wie auf dem echten Rad. Die Prozente zeigen, wie oft die Kugel in dieser Runde in jedem Fach landet.',
      }),
    );
    if (chosen && def?.id === 'pinsel') {
      box.append(numberPicker((n) => upgrade!.apply(chosen.index, n)), h('div', { class: 'rows' }, row('ANDERES FACH', '', () => render())));
      return;
    }
    const reds = run.wheel.filter((p) => p.color === 'red').length;
    const blacks = run.wheel.filter((p) => p.color === 'black').length;
    box.append(
      wheelRing(run, {
        pick: def ? (p) => (def.id === 'pinsel' ? render(p) : upgrade!.apply(p.index)) : undefined,
        center: def ? 'FACH<br>WÄHLEN' : `${reds}× ROT<br>${blacks}× SCHWARZ<br>${37 - reds - blacks}× GRÜN`,
      }),
      modLegend(),
      h('div', { class: 'rows' }, row('ZURÜCK', 'ESC', close)),
    );
  };
  render();
  return box;
}

// ---- Start menu, collection, controls ------------------------------------------------------------

export interface StartHandlers {
  start(kit: string, stage: number): void;
  collection(): void;
  controls(): void;
  toggleSound(): boolean;
}

export function startView(profile: Profile, locked: Set<string>, hd: StartHandlers, soundOn: boolean): HTMLElement {
  const kits = Object.values(START_KITS);
  let kit = locked.has(profile.lastKit) ? 'klassisch' : profile.lastKit;
  let stage = Math.min(profile.lastStage ?? 0, profile.maxStage ?? 0);
  const info = h('div', { class: 'foot' });
  const kitValue = h('span', { class: 'v' });
  const stageValue = h('span', { class: 'v' });
  const renderValues = () => {
    const k = START_KITS[kit];
    kitValue.textContent = `◀ ${k.name.toUpperCase()} ▶`;
    stageValue.textContent = `◀ ${stage}: ${STAGES[stage].name.toUpperCase()} ▶`;
  };
  const stepKit = (d: number) => {
    const open = kits.filter((k) => !locked.has(k.id));
    const i = open.findIndex((k) => k.id === kit);
    kit = open[(i + d + open.length) % open.length].id;
    renderValues();
    info.textContent = START_KITS[kit].desc;
  };
  const stepStage = (d: number) => {
    stage = Math.max(0, Math.min(profile.maxStage ?? 0, stage + d));
    renderValues();
    info.textContent = `Schuldenstufe ${stage}: ${STAGES.slice(1, stage + 1).map((s) => s.desc).join(' ') || STAGES[0].desc}`;
  };
  renderValues();
  info.textContent = 'Du hast dir Geld bei den falschen Leuten geliehen. Alle fünf Runden kommen sie an die Kasse. Setz dein echtes Geld, sammel Talismane – und bezahl.';
  const lockedKits = kits.filter((k) => locked.has(k.id)).length;
  const sound = row('TON', soundOn ? 'AN' : 'AUS', () => {
    const on = hd.toggleSound();
    (sound.lastElementChild as HTMLElement).textContent = on ? 'AN' : 'AUS';
  });
  return h('div', { class: 'start' },
    h('h1', { html: 'RIEN NE<br>VA PLUS' }),
    h('div', { class: 'tag', text: 'EIN TISCH. EINE KASSE. SCHULDEN.' }),
    h('div', { class: 'rows' },
      row('▶ NEUES SPIEL', '', () => hd.start(kit, stage)),
      row('START', kitValue, () => stepKit(1), { onStep: stepKit, onHover: () => (info.textContent = START_KITS[kit].desc + (lockedKits ? ` · ${lockedKits} weitere gesperrt` : '')) }),
      row('SCHULDENSTUFE', stageValue, () => stepStage(1), {
        onStep: stepStage,
        onHover: () => (info.textContent = (profile.maxStage ?? 0) === 0 ? 'Bezahle alle 8 Raten, um die nächste Schuldenstufe freizuschalten.' : `Freigeschaltet bis Stufe ${profile.maxStage}. ${STAGES[stage].desc}`),
      }),
      row('SAMMLUNG', `${profile.done.length}/${ACHIEVEMENTS.length}`, hd.collection),
      row('STEUERUNG', '', hd.controls),
      sound,
    ),
    info,
    h('div', { class: 'foot', html: `SPIELE ${profile.runs} · MEISTE RATEN ${profile.bestRates} · BESTER GEWINN ${fmt(profile.bestWin)} · FREI ${profile.wins}×` }),
  );
}

export function collectionView(profile: Profile, back: () => void): HTMLElement {
  const list = h('div', { class: 'rows', style: 'max-height:62vh;overflow:auto' });
  for (const a of ACHIEVEMENTS) {
    const done = profile.done.includes(a.id);
    list.append(h('div', { class: 'ach' + (done ? ' done' : '') },
      h('span', { text: done ? '◆' : '◇' }),
      h('span', { text: `${a.name.toUpperCase()} – ${a.desc}` }),
      h('span', { class: 'd', text: (done ? 'Freigeschaltet: ' : 'Schaltet frei: ') + a.rewards.map(rewardName).join(', ') }),
    ));
  }
  return h('div', { class: 'menu' },
    head('SAMMLUNG', `${profile.done.length}/${ACHIEVEMENTS.length}`),
    h('p', { class: 'info', text: 'Erfolge schalten neue Talismane und Startausrüstungen frei. Siege schalten die nächste Schuldenstufe frei. Alles bleibt in diesem Browser gespeichert.' }),
    list,
    h('div', { class: 'rows' }, row('ZURÜCK', 'ESC', back)),
  );
}

export function controlsView(back: () => void): HTMLElement {
  const lines: [string, string][] = [
    ['WASD / PFEILE', 'LAUFEN, SHIFT RENNT'],
    ['E', 'TISCH, KASSE, VITRINE, TELEFON'],
    ['LINKSKLICK', 'JETON SETZEN – AUCH AUF LINIEN UND ECKEN'],
    ['RECHTSKLICK', 'JETON ZURÜCKNEHMEN'],
    ['1–6 / MAUSRAD', 'JETON-WERT'],
    ['LEERTASTE', 'DREHEN, HALTEN = SCHNELLER'],
    ['R / C', 'WIEDERHOLEN / ABRÄUMEN'],
    ['V', 'RAD MIT WAHRSCHEINLICHKEITEN'],
    ['PFEILE + ENTER', 'IN MENÜS'],
    ['M', 'TON AN/AUS'],
  ];
  return h('div', { class: 'menu', style: 'width:min(820px,100%)' },
    head('STEUERUNG'),
    h('div', { class: 'rows' }, ...lines.map(([k, v]) => h('div', { class: 'stat' }, h('span', { text: k }), h('span', { text: v })))),
    h('div', { class: 'rows' }, row('ZURÜCK', 'ESC', back)),
  );
}

export function gameOverView(run: Run, rewind: () => void): HTMLElement {
  return h('div', { class: 'caught' },
    h('div', { style: 'font-size:34px', text: '■ STOP' }),
    h('h1', { text: 'ERWISCHT.' }),
    h('div', { style: 'font-size:28px', html: `DIE GELDEINTREIBER WOLLTEN ${fmt(run.debt)}. DU HATTEST ${fmt(run.cash + run.deposit)}.` }),
    h('div', { style: 'font-size:24px;opacity:.85', html: `RATEN ${run.paidRates} · RUNDEN ${run.stats.spins} · BESTER GEWINN ${fmt(run.stats.bestWin)} · NACHHOPSER ${run.stats.hops}` }),
    h('div', { class: 'rows' }, row('◀◀ ZURÜCKSPULEN', '', rewind)),
  );
}

export function victoryView(run: Run, endless: () => void, restart: () => void): HTMLElement {
  return h('div', { class: 'caught' },
    h('div', { style: 'font-size:34px', text: '■ ENDE DER AUFNAHME' }),
    h('h1', { style: 'color:var(--money)', text: 'FREI.' }),
    h('div', { style: 'font-size:28px', text: `ALLE ${DEBTS.length} RATEN BEZAHLT. DIE HERREN NICKEN UND GEHEN.` }),
    h('div', { style: 'font-size:24px;opacity:.85', text: run.stage < 5 ? `SCHULDENSTUFE ${run.stage + 1} IST JETZT FREIGESCHALTET.` : 'DU HAST DIE HÖCHSTE SCHULDENSTUFE GESCHAFFT.' }),
    h('div', { class: 'rows' }, row('▶ WEITERSPIELEN (ENDLOS)', '', endless), row('◀◀ NEUES BAND', '', restart)),
  );
}
