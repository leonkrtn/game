import {
  BALLS, CONSUMABLES, DEBTS, GOLD_DESC, ITEMS, MAX_CONSUMABLES, NEWS, OFFERS, POCKET_ITEMS, POCKET_MOD_INFO, RARITY, RULES, SETS, SHARK_FACTOR,
  STAGES, START_KITS, type PocketToolId,
} from '../game/content';
import { ACHIEVEMENTS, rewardName, type Profile } from '../game/meta';
import type { Run } from '../game/run';
import type { Pocket } from '../game/types';
import type { ItemPreview } from '../world/preview';
import { fmt, h } from './dom';
import { boostLabels, itemDesc, itemName, modLegend, numberPicker, pct, rarityClass, row, setInfo, wheelRing } from './hud';

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
        run.debt !== run.baseDebt ? h('div', { class: 'info', text: rateReasons(run) }) : null,
        h('div', { class: 'stat' }, h('span', { text: 'EINGEZAHLT' }), h('span', { text: fmt(run.deposit) })),
        h('div', { class: 'stat' }, h('span', { text: due ? 'STATUS' : 'NOCH' }), h('span', { class: due ? 'rec-c' : '', text: due ? 'JETZT FÄLLIG' : `${run.roundsLeft} RUNDE${run.roundsLeft === 1 ? '' : 'N'}` })),
        label('AKTIONEN'),
        row('RATE BEZAHLEN', `+◆${run.payMarks}`, hd.pay, { disabled: !run.canPay() }),
        payNote ? h('div', { class: 'info', text: payNote }) : null,
        due && short > 0 ? row('<span class="rec-c">AUFGEBEN</span>', '', hd.surrender) : null,
        row('ZURÜCK', 'ESC', hd.close),
      ),
      h('div', { class: 'rows' },
        label(`EINZAHLEN · ${pct(run.interestRate)} ZINSEN PRO DREH`),
        h('div', { class: 'info', text: 'Eingezahltes Geld ist sicher vor dem Tisch und wächst nach jedem Dreh. Zurück bekommst du es nicht – es gehört der Rate.' }),
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
  const show = (kind: 'item' | 'pocket', def: string, owned?: { counter: number; uid: number; gold?: boolean }) => {
    if (kind === 'item') {
      const d = ITEMS[def];
      const fuse = !owned && run.items.some((t) => t.def === def && !t.gold);
      const gold = owned?.gold || fuse;
      name.textContent = (gold ? '★ ' : '') + d.name;
      name.className = 'name ' + rarityClass(def);
      rar.textContent = RARITY[d.rarity].name.toUpperCase() + (owned ? ' · AUF DEINEM TISCH' : fuse ? ' · DEIN EXEMPLAR WIRD GOLDEN' : '');
      const text = owned ? itemDesc({ def, counter: owned.counter, gold: owned.gold }) : fuse ? `GOLDEN: ${GOLD_DESC[def]} (vorher: ${d.desc})` : d.desc;
      const set = setInfo(run, def);
      desc.textContent = text.replace(' (aktuell +{n})', '') + (set ? `\n${set}` : '');
      preview.show(def, undefined, !!gold);
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
    const n = isItem ? (it.fuse ? `★ ${ITEMS[it.def].name} → GOLDEN` : ITEMS[it.def].name) : POCKET_ITEMS[it.def as PocketToolId].name;
    const full = isItem && !it.fuse && run.items.length >= run.perks.slots;
    const cls = isItem ? rarityClass(it.def) : '';
    const value = it.sold ? 'VERKAUFT' : full ? 'TISCH VOLL' : `<span class="price">◆${it.price}</span>`;
    offer.append(row(`<span class="${cls}">${n}</span>`, value, () => (isItem ? hd.buy(i) : hd.target(i)), {
      disabled: !run.canBuy(i),
      onHover: () => show(isItem ? 'item' : 'pocket', it.def),
    }));
  });
  offer.append(row('NEU BESTÜCKEN', `<span class="price">◆${run.rerollCost}</span>`, hd.reroll, { disabled: run.marks < run.rerollCost || !run.cashierOpen }));

  const mine = h('div', { class: 'rows' }, label(`AUF DEINEM TISCH ${run.items.length}/${run.perks.slots} · ◀ ▶ VERSCHIEBEN, ENTER VERKAUFT`));
  if (run.items.length) mine.append(h('div', { class: 'info', text: 'Kauf ein zweites Exemplar eines Talismans, dann wird deiner golden und stärker.' }));
  if (!run.items.length) mine.append(h('div', { class: 'info', text: 'Noch nichts. Talismane stehen auf deinem Tisch und wirken bei jedem Dreh. Die Reihenfolge zählt für den Handspiegel.' }));
  run.items.forEach((t) => {
    mine.append(row(`<span class="${rarityClass(t.def)}">${itemName(t)}</span>`, `VERKAUFEN +◆${run.sellPrice(t.uid)}`, () => hd.sell(t.uid), {
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
          : 'Reihenfolge wie auf dem echten Rad. Die Prozente zeigen, wie oft die Kugel bei diesem Dreh in jedem Fach landet.',
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
  start(kit: string, stage: number, ball: string): void;
  collection(): void;
  controls(): void;
  toggleSound(): boolean;
  graphics(q: Profile['quality']): void;
}

const GRAPHICS: Profile['quality'][] = ['auto', 'high', 'medium', 'low'];
const GRAPHICS_NAME: Record<Profile['quality'], string> = { auto: 'AUTOMATISCH', high: 'HOCH', medium: 'MITTEL', low: 'NIEDRIG' };

export function startView(profile: Profile, locked: Set<string>, hd: StartHandlers, soundOn: boolean, quality: Profile['quality'] = 'auto'): HTMLElement {
  const kits = Object.values(START_KITS);
  let kit = locked.has(profile.lastKit) ? 'klassisch' : profile.lastKit;
  const balls = Object.values(BALLS).filter((b) => !locked.has(b.id));
  let ball = balls.some((b) => b.id === profile.lastBall) ? profile.lastBall : 'stahl';
  const ballValue = h('span', { class: 'v' });
  let stage = Math.min(profile.lastStage ?? 0, profile.maxStage ?? 0);
  const info = h('div', { class: 'foot' });
  const kitValue = h('span', { class: 'v' });
  const stageValue = h('span', { class: 'v' });
  const renderValues = () => {
    const k = START_KITS[kit];
    kitValue.textContent = `◀ ${k.name.toUpperCase()} ▶`;
    stageValue.textContent = `◀ ${stage}: ${STAGES[stage].name.toUpperCase()} ▶`;
    ballValue.textContent = `◀ ${BALLS[ball].name.toUpperCase()} ▶`;
  };
  const stepBall = (d: number) => {
    const i = balls.findIndex((b) => b.id === ball);
    ball = balls[(i + d + balls.length) % balls.length].id;
    renderValues();
    info.textContent = `${BALLS[ball].name}: ${BALLS[ball].desc}`;
  };
  const lockedBalls = Object.keys(BALLS).length - balls.length;
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
  info.textContent = 'Du hast dir Geld bei den falschen Leuten geliehen. Nach je drei Drehs kommen sie an die Kasse. Setz dein echtes Geld, sammel Talismane – und bezahl.';
  const lockedKits = kits.filter((k) => locked.has(k.id)).length;
  let gfx = quality;
  const gfxValue = h('span', { class: 'v', text: `◀ ${GRAPHICS_NAME[gfx]} ▶` });
  const stepGfx = (d: number) => {
    gfx = GRAPHICS[(GRAPHICS.indexOf(gfx) + d + GRAPHICS.length) % GRAPHICS.length];
    gfxValue.textContent = `◀ ${GRAPHICS_NAME[gfx]} ▶`;
    hd.graphics(gfx);
  };
  const graphics = row('GRAFIK', gfxValue, () => stepGfx(1), {
    onStep: stepGfx,
    onHover: () => (info.textContent = 'Ruckelt es? Stell die Grafik niedriger. Automatisch senkt sie von selbst, wenn das Bild zu langsam wird.'),
  });
  const sound = row('TON', soundOn ? 'AN' : 'AUS', () => {
    const on = hd.toggleSound();
    (sound.lastElementChild as HTMLElement).textContent = on ? 'AN' : 'AUS';
  });
  return h('div', { class: 'start' },
    h('h1', { html: 'RIEN NE<br>VA PLUS' }),
    h('div', { class: 'tag', text: 'EIN TISCH. EINE KASSE. SCHULDEN.' }),
    h('div', { class: 'rows' },
      row('▶ NEUES SPIEL', '', () => hd.start(kit, stage, ball)),
      row('START', kitValue, () => stepKit(1), { onStep: stepKit, onHover: () => (info.textContent = START_KITS[kit].desc + (lockedKits ? ` · ${lockedKits} weitere gesperrt` : '')) }),
      row('SCHULDENSTUFE', stageValue, () => stepStage(1), {
        onStep: stepStage,
        onHover: () => (info.textContent = (profile.maxStage ?? 0) === 0 ? 'Bezahle alle 8 Raten, um die nächste Schuldenstufe freizuschalten.' : `Freigeschaltet bis Stufe ${profile.maxStage}. ${STAGES[stage].desc}`),
      }),
      row('KUGEL', ballValue, () => stepBall(1), { onStep: stepBall, onHover: () => (info.textContent = `${BALLS[ball].name}: ${BALLS[ball].desc}` + (lockedBalls ? ` · ${lockedBalls} weitere Kugeln über Erfolge freischalten` : '')) }),
      row('SAMMLUNG', `${profile.done.length}/${ACHIEVEMENTS.length}`, hd.collection),
      row('STEUERUNG', '', hd.controls),
      graphics,
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
    ['E', 'TISCH, KASSE, VITRINE, TELEFON, AUTOMAT'],
    ['TAB', 'ÜBERSICHT: TALISMANE, SETS, TASCHE, BONI'],
    ['LINKSKLICK', 'JETON SETZEN – AUCH AUF LINIEN UND ECKEN'],
    ['RECHTSKLICK', 'JETON ZURÜCKNEHMEN'],
    ['1–6 / MAUSRAD', 'JETON-WERT'],
    ['LEERTASTE', 'DREHEN, HALTEN = SCHNELLER'],
    ['R / C', 'WIEDERHOLEN / ABRÄUMEN'],
    ['B / H', 'CROUPIER BESTECHEN / HOCHRISIKO (LETZTER DREH)'],
    ['7–9', 'SACHEN AUS DER TASCHE BENUTZEN'],
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
    h('div', { style: 'font-size:24px;opacity:.85', html: `RATEN ${run.paidRates} · DREHS ${run.stats.spins} · BESTER GEWINN ${fmt(run.stats.bestWin)} · NACHHOPSER ${run.stats.hops} · DUELLE ${run.stats.duelWins}/${run.stats.duelWins + run.stats.duelLosses}` }),
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

/** Why the rate differs from the base rate. */
export function rateReasons(run: Run): string {
  const r: string[] = [`Grundrate ${fmt(run.baseDebt)}`];
  const voodoo = run.items.find((t) => t.def === 'voodoo');
  const devils = run.active('teufel').length;
  if (devils) r.push(`Teufel +25 %${devils > 1 ? ` ×${devils}` : ''}`);
  if (voodoo) r.push(`Voodoo −${voodoo.gold ? 25 : 15} %`);
  if (run.stage >= 1) r.push('Stufe +25 %');
  if (run.items.length && SETS.find((x) => x.id === 'bank')!.items.every((d) => run.has(d))) r.push('Schweizer Konto −10 %');
  if (run.news === 'razzia') r.push('Razzia −20 %');
  if (run.news === 'inflation') r.push('Inflation +20 %');
  if (run.cycle >= run.sharkFrom) r.push(`Kredithai +${Math.round((SHARK_FACTOR - 1) * 100)} %`);
  if (run.debtFactor !== 1) r.push(`Telefon ×${run.debtFactor.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`);
  if (run.debtAdd) r.push(`Aufschlag +${fmt(run.debtAdd)}`);
  return r.join(' · ');
}

// ---- Overview (TAB) ---------------------------------------------------------------------------

export function overviewView(run: Run, close: () => void): HTMLElement {
  const items = h('div', { class: 'rows' }, label(`TALISMANE ${run.items.length}/${run.perks.slots}`));
  if (!run.items.length) items.append(h('div', { class: 'info', text: 'Noch keine. Die Vitrine verkauft sie gegen Glücksmarken (◆). Sie wirken bei jedem Dreh.' }));
  for (const t of run.items) {
    items.append(h('div', { class: 'ov' }, h('span', { class: 'n ' + rarityClass(t.def), text: itemName(t) }), h('span', { class: 'd', text: itemDesc(t) })));
  }
  items.append(label('SETS · DREI TALISMANE, DIE ZUSAMMENGEHÖREN'));
  for (const set of SETS) {
    const have = set.items.filter((d) => run.has(d));
    items.append(h('div', { class: 'ov' + (have.length === 3 ? ' done' : '') },
      h('span', { class: 'n', text: `${have.length === 3 ? '◆' : '◇'} ${set.name} ${have.length}/3` }),
      h('span', { class: 'd', text: `${set.items.map((d) => (run.has(d) ? ITEMS[d].name.toUpperCase() : ITEMS[d].name)).join(' + ')} → ${set.desc}` }),
    ));
  }
  const stats = h('div', { class: 'rows' },
    label('SO FUNKTIONIERT DER GEWINN'),
    h('div', { class: 'info', text: 'Jede gewinnende Wette zahlt Einsatz × Quote in die SUMME. Talismane, Fächer und Boni erhöhen den MULT. Ausgezahlt wird SUMME × MULT.' }),
    label('DEINE WERTE'),
    stat('GLÜCK', `${run.luck} → ${pct(run.hopChance)} NACHHOPSER`),
    stat('ZINSEN AUF EINZAHLUNG', pct(run.interestRate) + ' PRO DREH'),
    stat('GLÜCKSMARKEN', `◆${run.marks}`),
    stat('KUGEL', `${BALLS[run.ball].name.toUpperCase()}`),
    h('div', { class: 'info', text: BALLS[run.ball].desc }),
    run.perks.redMult || run.perks.blackMult ? stat('DAUER-BONI', `ROT +${run.perks.redMult} · SCHWARZ +${run.perks.blackMult} MULT`) : null,
    label('DIESE RATE'),
    stat('RATE', `${fmt(run.debt)} NACH ${run.cycleRounds} DREHS`),
    h('div', { class: 'info', text: rateReasons(run) }),
    h('div', { class: 'info', text: `TV: ${NEWS[run.news].headline} – ${NEWS[run.news].desc}` }),
    run.rule ? h('div', { class: 'info', text: `HAUSREGEL: ${RULES[run.rule].name} – ${RULES[run.rule].desc}` }) : null,
    run.sharkUsed ? h('div', { class: 'info rec-c', text: run.sharkFrom !== Infinity ? `Du hast beim Kredithai geliehen: alle späteren Raten +${Math.round((SHARK_FACTOR - 1) * 100)} %.` : 'Den Kredithai hast du abgewiesen. Er kommt nicht wieder.' }) : null,
    label(`TASCHE ${run.smokes.length}/${MAX_CONSUMABLES}`),
    run.smokes.length ? h('div', { class: 'info', text: run.smokes.map((id) => `${CONSUMABLES[id].name}: ${CONSUMABLES[id].desc}`).join('\n') }) : h('div', { class: 'info', text: 'Leer. Der Zigarettenautomat an der rechten Wand verkauft Sachen für einen Dreh.' }),
    boostLabels(run).length ? h('div', { class: 'info luck-c', text: 'AKTIV FÜR DEN NÄCHSTEN DREH: ' + boostLabels(run).join(' · ') }) : null,
  );
  return h('div', { class: 'menu' },
    head('ÜBERSICHT', 'TAB / ESC SCHLIESST'),
    h('div', { class: 'cols' }, items, stats),
    h('div', { class: 'rows' }, row('ZURÜCK', 'ESC', close)),
  );
}

function stat(k: string, v: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { text: k }), h('span', { text: v }));
}

// ---- Cigarette machine ------------------------------------------------------------------------

export function automatView(run: Run, locked: Set<string>, buy: (id: string) => void, close: () => void): HTMLElement {
  const detail = h('div', { class: 'info', style: 'min-height:2.2em' });
  const list = h('div', { class: 'rows' }, label(`BARGELD ${fmt(run.cash)} · TASCHE ${run.smokes.length}/${MAX_CONSUMABLES}`));
  for (const c of Object.values(CONSUMABLES)) {
    if (locked.has(c.id)) {
      list.append(row(`<span style="opacity:.5">??? GESPERRT</span>`, '', undefined, { disabled: true }));
      continue;
    }
    const price = run.smokePrice(c.id);
    const instant = c.id === 'rubbellos' || c.id === 'espresso';
    const full = !instant && run.smokes.length >= MAX_CONSUMABLES;
    list.append(row(c.name, full ? 'TASCHE VOLL' : `<span class="money-c">${fmt(price)}</span>`, () => buy(c.id), {
      disabled: full || run.cash < price || (c.id === 'espresso' && run.phase !== 'betting'),
      onHover: () => (detail.textContent = c.desc),
    }));
  }
  list.append(row('ZURÜCK', 'ESC', close, { onHover: () => (detail.textContent = 'Die Preise steigen mit der Rate.') }));
  detail.textContent = CONSUMABLES.zigarette.desc;
  return h('div', { class: 'menu', style: 'width:min(820px,100%)' },
    head('ZIGARETTEN', 'AUTOMAT'),
    h('div', { class: 'info', text: 'Sachen für einen Dreh. Benutzen am Tisch mit den Tasten 7, 8, 9.' }),
    list,
    detail,
  );
}

// ---- Loan shark -------------------------------------------------------------------------------

export function sharkView(run: Run, take: () => void, decline: () => void): HTMLElement {
  const extra = Math.round((SHARK_FACTOR - 1) * 100);
  const says = run.sharkDue
    ? '„Die Herren an der Kasse sind ungeduldig, hm? Ich leg dir was hin. Einmal. Und du weißt, was das kostet."'
    : '„Leere Taschen, mein Freund? Ich helf dir. Einmal. Danach gehörst du ein bisschen mir."';
  return h('div', { class: 'menu', style: 'margin-top:auto;margin-bottom:6vh;width:min(900px,100%)' },
    h('div', { style: 'color:var(--luck);font-size:32px;text-align:center', text: 'KREDITHAI: ' + says }),
    h('div', { class: 'rows' },
      row(`GELD NEHMEN: +${fmt(run.sharkAmount)}`, `ALLE SPÄTEREN RATEN +${extra} %`, take),
      row('ABLEHNEN', run.sharkDue ? 'DAS SPIEL IST VORBEI' : 'OHNE GELD WEITER', decline),
    ),
    h('div', { class: 'info', style: 'text-align:center', text: 'Der Kredithai kommt nur ein einziges Mal pro Spiel.' }),
  );
}
