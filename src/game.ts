import * as THREE from 'three';
import { sfx } from './audio';
import { ITEMS, OFFERS, POCKET_ITEMS, RULES, type PocketToolId } from './game/content';
import { FIELD_BY_ID } from './game/fields';
import { checkAchievements, loadProfile, lockedIds, recordRun, rewardName, saveProfile, type Profile } from './game/meta';
import { Run, RUSH_SECONDS } from './game/run';
import type { Line, SpinResult } from './game/scoring';
import { Input } from './input';
import { $, fmt, fmtMult } from './ui/dom';
import {
  availableChips, bigWin, bump, closeModal, coveredCells, floater, modalOpen, openModal, renderFieldInfo, renderItemTip,
  renderSide, renderTableBar, setBanner, setHelp, setPrompt, toast, type SideState,
} from './ui/hud';
import {
  collectionView, gameOverView, kasseView, phoneView, startView, victoryView, vitrineView, wheelView,
} from './ui/screens';
import { World } from './world/world';

type Mode = 'start' | 'room' | 'table' | 'spinning' | 'kasse' | 'vitrine' | 'phone' | 'caught' | 'over';

const ROOM_HELP = '<span><kbd>WASD</kbd> laufen</span><span><kbd>Shift</kbd> rennen</span><span><kbd>E</kbd> benutzen</span><span><kbd>V</kbd> Rad</span><span><kbd>M</kbd> Ton</span>';

export class Game {
  private world: World;
  private input = new Input();
  private profile: Profile;
  private run: Run;
  private mode: Mode = 'start';
  private chip = 5;
  private hover?: string;
  private mouse = { x: -1, y: -1 };
  private rushLeft?: number;
  private confirmEmpty = false;
  private side: SideState = { cash: 0, sum: 0, mult: 1, lines: [] };
  private shownCash = 0;
  private sideDirty = true;
  private seq: { delay: number; fn: () => void }[] = [];
  private seqWait = 0;
  private spinStage: 'rolling' | 'scoring' = 'rolling';
  private caughtTimer = 0;
  private ringTimer = 0;
  private last = performance.now();
  /** Largest simulated step per frame; raised by automated tests on slow software renderers. */
  maxDt = 0.05;

  constructor(container: HTMLElement) {
    this.world = new World(container);
    this.profile = loadProfile();
    this.run = new Run({ locked: lockedIds(this.profile) });
    this.world.wheel.onTick = (s) => sfx.tick(s);

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mousedown', (e) => {
      sfx.unlock();
      if (this.mode === 'table') {
        if (e.button === 0) this.placeChip();
        if (e.button === 2) this.takeChip();
      } else if (this.mode === 'spinning' && this.spinStage === 'scoring') {
        this.seqWait = 0;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (this.mode !== 'table') return;
      const list = availableChips(this.run.moneyBefore).filter((v) => v <= this.run.cash);
      const i = list.indexOf(this.chip);
      const j = Math.max(0, Math.min(list.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
      if (list[j]) this.selectChip(list[j]);
    }, { passive: true });
    window.addEventListener('keydown', () => sfx.unlock(), { once: true });

    this.showStart();
    this.world.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- Runs ------------------------------------------------------------------

  private showStart(): void {
    this.mode = 'start';
    openModal(startView(this.profile, lockedIds(this.profile), (kit) => this.newRun(kit), () => this.showCollection()));
  }

  private showCollection(): void {
    openModal(collectionView(this.profile, () => this.showStart()));
  }

  private newRun(kit: string): void {
    sfx.unlock();
    this.profile.lastKit = kit;
    saveProfile(this.profile);
    this.run = new Run({ kit, locked: lockedIds(this.profile) });
    this.shownCash = this.run.cash;
    this.shownCashValue = this.run.cash;
    this.side = { cash: this.run.cash, sum: 0, mult: 1, lines: [] };
    this.seq = [];
    this.world.clearChips();
    this.world.dismissThugs();
    this.syncWorld();
    closeModal();
    this.enterRoom();
    toast('Geh an den <b>Roulettetisch</b> und drück <kbd>E</kbd>.');
  }

  /** Pushes run state that the 3D scene shows: talismans, showcase, wheel, marquee, phone. */
  private syncWorld(): void {
    const r = this.run;
    this.world.setItems(r.items, r.perks.slots);
    this.world.setShowcase(r.shop);
    this.world.refreshWheel(r.wheel, undefined, r.visions);
    this.world.markCells = new Set(r.visions.map((i) => `n${r.wheel[i].number}`));
    this.world.setMarquee(r.history, r.debt, r.round, r.cycleRounds);
    this.world.phoneRinging = r.offers.length > 0;
    this.sideDirty = true;
  }

  private checkUnlocks(): void {
    for (const a of checkAchievements(this.profile, this.run)) {
      sfx.win(true);
      toast(`<div class="eyebrow">Erfolg · ${a.name}</div>Freigeschaltet: <b>${a.rewards.map(rewardName).join(', ')}</b>`, 'unlock');
    }
  }

  // ---- Modes -------------------------------------------------------------------

  private enterRoom(): void {
    this.mode = 'room';
    this.world.cameraMode = 'room';
    this.world.standAtTable(false);
    this.world.hoverField = undefined;
    this.world.hoverCells = new Set();
    this.world.setGhost(undefined, undefined);
    $('tablebar').classList.add('hidden');
    $('fieldinfo').classList.add('hidden');
    $('timer').classList.add('hidden');
    setHelp(ROOM_HELP);
    this.sideDirty = true;
    this.updateBanner();
  }

  private enterTable(): void {
    if (this.run.phase !== 'betting') {
      toast('Die Rate ist fällig. Erst an die <b>Kasse</b>!');
      sfx.error();
      return;
    }
    this.mode = 'table';
    this.world.cameraMode = 'table';
    this.world.standAtTable(true);
    setPrompt();
    $('tablebar').classList.remove('hidden');
    setHelp('');
    if (this.run.rule === 'eile' && this.rushLeft === undefined) this.rushLeft = RUSH_SECONDS;
    this.clampChip();
    this.renderTable();
  }

  private openKasse(): void {
    this.mode = 'kasse';
    this.world.cameraMode = 'kasse';
    this.world.standAt('kasse');
    setPrompt();
    this.renderKasse();
  }

  private renderKasse(): void {
    openModal(kasseView(this.run, {
      deposit: (amount) => {
        if (this.run.depositCash(amount)) {
          sfx.cash();
          this.shownCash = this.run.cash;
          this.renderKasse();
          this.sideDirty = true;
        }
      },
      pay: () => this.pay(),
      surrender: () => {
        this.run.surrender();
        closeModal();
        this.startCaught();
      },
      close: () => this.closePanel(),
    }), () => this.closePanel());
  }

  private openVitrine(): void {
    this.mode = 'vitrine';
    this.world.cameraMode = 'vitrine';
    this.world.standAt('vitrine');
    setPrompt();
    this.renderVitrine();
  }

  private renderVitrine(): void {
    openModal(vitrineView(this.run, {
      buy: (i) => {
        const def = this.run.shop[i].def;
        if (this.run.buy(i)) {
          sfx.cash();
          toast(`<b>${ITEMS[def].name}</b> steht jetzt auf deinem Tisch.`);
          this.afterShop();
        }
      },
      target: (i) => this.useUpgrade(i),
      reroll: () => {
        if (this.run.reroll()) {
          sfx.select();
          this.afterShop();
        }
      },
      sell: (uid) => {
        if (this.run.sellItem(uid)) {
          sfx.cash();
          this.afterShop();
        }
      },
      move: (uid, dir) => {
        if (this.run.moveItem(uid, dir)) {
          sfx.select();
          this.afterShop();
        }
      },
      close: () => this.closePanel(),
    }), () => this.closePanel());
  }

  private afterShop(): void {
    this.syncWorld();
    this.checkUnlocks();
    this.renderVitrine();
  }

  private useUpgrade(i: number): void {
    openModal(wheelView(this.run, () => this.renderVitrine(), {
      index: i,
      apply: (pocket, num) => {
        const before = this.run.wheel[pocket].number;
        const name = POCKET_ITEMS[this.run.shop[i].def as PocketToolId].name;
        if (this.run.applyPocket(i, pocket, num)) {
          sfx.cash();
          this.world.refreshWheel(this.run.wheel, pocket, this.run.visions);
          const p = this.run.wheel[pocket];
          toast(num !== undefined ? `Fach <b>${before}</b> ist jetzt die <b>${p.number}</b>.` : `${name}: Fach <b>${p.number}</b>.`);
          setTimeout(() => this.world.refreshWheel(this.run.wheel, undefined, this.run.visions), 2500);
        }
        this.afterShop();
      },
    }));
  }

  private answerPhone(): void {
    if (!this.run.offers.length) return;
    this.mode = 'phone';
    this.world.cameraMode = 'phone';
    this.world.standAt('phone');
    setPrompt();
    sfx.pickup();
    openModal(phoneView(this.run, (i) => {
      const id = this.run.offers[i];
      const msg = this.run.chooseOffer(i);
      sfx.cash();
      toast(`<b>${OFFERS[id].name}.</b> ${msg ?? ''}`);
      this.syncWorld();
      this.checkUnlocks();
      this.closePanel();
    }, () => {
      this.run.offers = [];
      this.syncWorld();
      this.closePanel();
    }), () => this.closePanel());
  }

  private closePanel(): void {
    closeModal();
    if (this.mode === 'kasse' || this.mode === 'vitrine' || this.mode === 'phone') this.enterRoom();
  }

  private pay(): void {
    const n = this.run.cycle + 1;
    if (!this.run.pay()) return;
    sfx.cash();
    this.world.dismissThugs();
    this.rushLeft = undefined;
    this.shownCash = this.run.cash;
    toast(`Rate ${n} bezahlt: +◆${this.run.lastPayMarks} Glücksmarken. Die Herren ziehen ab – vorerst.`);
    if (this.run.rule) setTimeout(() => toast(`Neue Hausregel: <b>${RULES[this.run.rule!].name}</b> – ${RULES[this.run.rule!].desc}`), 800);
    setTimeout(() => toast('Das rote <b>Telefon</b> klingelt.'), 1600);
    this.syncWorld();
    this.checkUnlocks();
    if (this.run.phase === 'victory') {
      recordRun(this.profile, this.run, true);
      closeModal();
      openModal(victoryView(this.run, () => {
        this.run.continueEndless();
        closeModal();
        this.enterRoom();
      }, () => this.showStart()));
      sfx.win(true);
    } else {
      this.renderKasse();
    }
  }

  private startCaught(): void {
    this.mode = 'caught';
    this.caughtTimer = 3.2;
    $('tablebar').classList.add('hidden');
    setBanner();
    setPrompt();
    this.world.standAtTable(false);
    this.world.thugsAttack();
    this.world.cameraMode = 'caught';
    sfx.caught();
    recordRun(this.profile, this.run, false);
  }

  // ---- Betting -------------------------------------------------------------------

  private clampChip(): void {
    const list = availableChips(this.run.moneyBefore);
    if (!list.includes(this.chip) || this.chip > this.run.cash) {
      const fits = list.filter((v) => v <= this.run.cash);
      this.chip = fits.length ? fits[Math.max(0, fits.length - 3)] : list[0];
    }
  }

  private selectChip(v: number): void {
    if (v > this.run.cash) return;
    this.chip = v;
    sfx.select();
    this.renderTable();
  }

  private placeChip(): void {
    if (!this.hover) return;
    if (!this.run.placeBet(this.hover, this.chip)) {
      sfx.error();
      if (this.run.rule === 'limit' && this.chip <= this.run.cash) toast('<b>Tischlimit</b>: höchstens ein Viertel deines Geldes pro Runde.');
      return;
    }
    this.world.placeChip(this.hover, this.chip);
    sfx.chip();
    this.confirmEmpty = false;
    this.shownCash = this.run.cash;
    if (this.chip > this.run.cash) this.clampChip();
    this.renderTable();
  }

  private takeChip(): void {
    if (!this.hover) return;
    if (!this.run.removeBet(this.hover)) return;
    this.world.pickChip(this.hover);
    sfx.pickup();
    this.shownCash = this.run.cash;
    this.renderTable();
  }

  private repeatBets(): void {
    if (this.run.stakeTotal > 0) return;
    if (this.run.repeatBets()) {
      this.world.syncChips(this.run.bets);
      sfx.chip();
      this.shownCash = this.run.cash;
      this.renderTable();
    }
  }

  private clearBets(): void {
    if (!this.run.stakeTotal) return;
    this.run.clearBets();
    this.world.clearChips();
    sfx.pickup();
    this.shownCash = this.run.cash;
    this.renderTable();
  }

  private spin(force = false): void {
    if (this.mode !== 'table' || this.run.phase !== 'betting') return;
    if (this.run.stakeTotal === 0 && !force && !this.confirmEmpty) {
      this.confirmEmpty = true;
      toast('Noch nichts gesetzt. <kbd>Leertaste</kbd> nochmal = trotzdem drehen.');
      return;
    }
    this.confirmEmpty = false;
    this.rushLeft = undefined;
    $('timer').classList.add('hidden');
    const r = this.run.spin();
    this.mode = 'spinning';
    this.spinStage = 'rolling';
    this.side = { cash: this.run.cash, sum: 0, mult: 1, lines: [] };
    this.sideDirty = true;
    this.world.cameraMode = 'wheel';
    this.world.hoverField = undefined;
    this.world.hoverCells = new Set();
    this.world.setGhost(undefined, undefined);
    $('fieldinfo').classList.add('hidden');
    $('itemtip').classList.add('hidden');
    this.world.wheel.spin(r.hop ? r.hop.from : r.pocket.index, 6.5, r.hop?.to);
    sfx.spin();
    floater('Rien ne va plus!', window.innerWidth / 2 + 130, window.innerHeight * 0.22, 'var(--brass-hi)', 40);
    this.renderTable();
  }

  /** The ball rested in its first pocket, and luck is about to make it hop. */
  private onFirstLanding(): void {
    const r = this.run.lastResult!;
    sfx.land();
    const s = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
    const from = this.run.wheel[r.hop!.from];
    floater(`${from.number} …`, s.x, s.y - 40, '#ddd', 34);
    setTimeout(() => {
      sfx.coin();
      const s2 = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
      floater('Glück! Sie hüpft!', s2.x, s2.y - 70, 'var(--luck)', 30);
    }, 450);
  }

  private onLanded(): void {
    const r = this.run.lastResult!;
    this.run.settle();
    sfx.land();
    this.world.refreshWheel(this.run.wheel, r.pocket.index);
    const s = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
    const col = r.pocket.color === 'red' ? '#ff5a64' : r.pocket.color === 'black' ? '#eee' : '#4fe08a';
    floater(`${r.pocket.number}`, s.x, s.y - 40, col, 52);
    this.spinStage = 'scoring';
    this.buildScoring(r);
  }

  /** Queues the step-by-step scoring show: stacks pop, talismans fire, numbers count up. */
  private buildScoring(r: SpinResult): void {
    const q = (delay: number, fn: () => void) => this.seq.push({ delay, fn });
    q(0.9, () => {
      this.world.cameraMode = 'table';
      this.world.dimLosers(r.bets.filter((b) => !b.won).map((b) => b.fieldId));
      this.world.pulseFields = new Set(r.bets.filter((b) => b.won).map((b) => b.fieldId));
    });
    const steps = r.lines.length;
    const pace = Math.max(0.16, Math.min(0.4, 2.4 / Math.max(1, steps)));
    let sum = 0;
    let mult = 1;
    let i = 0;
    for (const l of r.lines) {
      const idx = i++;
      q(idx === 0 ? 0.7 : pace, () => this.scoreLine(l, idx, (v) => (sum = v), () => sum, (v) => (mult = v), () => mult));
    }
    q(pace + 0.2, () => this.finishScoring(r));
    q(1.6, () => this.endSpin());
    this.seqWait = this.seq[0].delay;
  }

  private scoreLine(l: Line, i: number, setSum: (v: number) => void, getSum: () => number, setMult: (v: number) => void, getMult: () => number): void {
    this.side.lines.push(l);
    let at: THREE.Vector3 | undefined;
    if (l.item !== undefined) at = this.world.triggerItem(l.item);
    if (l.kind === 'bet') {
      setSum(getSum() + l.amount);
      this.side.sum = getSum();
      if (l.fieldId) at = this.world.popField(l.fieldId);
      sfx.line(i);
      if (at) {
        const s = this.world.project(at);
        floater(`+${fmt(l.amount)}`, s.x, s.y, 'var(--sum)', 26);
      }
      this.sideDirty = true;
      this.renderSideNow();
      bump('sum');
    } else if (l.kind === 'add' || l.kind === 'mul') {
      setMult(l.kind === 'add' ? getMult() + l.amount : getMult() * l.amount);
      this.side.mult = Math.round(getMult() * 1000) / 1000;
      sfx.mult(i);
      if (at) {
        const s = this.world.project(at);
        floater(l.kind === 'add' ? `+${fmtMult(l.amount)} Mult` : `×${fmtMult(l.amount)} Mult`, s.x, s.y, 'var(--mult)', 24);
      }
      this.renderSideNow();
      bump('mult');
    } else if (l.kind === 'money') {
      sfx.cash();
      if (at) floater(`+${fmt(l.amount)}`, this.world.project(at).x, this.world.project(at).y, 'var(--money)', 24);
      this.renderSideNow();
    } else if (l.kind === 'marks') {
      sfx.coin();
      floater(`+◆${l.amount}`, window.innerWidth / 2 + 130, window.innerHeight * 0.3, 'var(--marks)', 30);
      this.renderSideNow();
    }
  }

  private finishScoring(r: SpinResult): void {
    const net = r.payout - r.stake;
    this.side.result = net;
    this.renderSideNow();
    const debt = this.run.debt;
    if (r.payout > 0) {
      const big = r.payout >= debt * 0.5;
      sfx.win(big);
      this.world.shake(Math.min(1.5, 0.3 + (r.payout / Math.max(1, debt)) * 1.2));
      if (big) {
        this.world.coinShower(Math.min(80, 20 + Math.floor((r.payout / debt) * 30)));
        bigWin(r.payout >= debt ? 'JACKPOT!' : 'Großer Gewinn!', `+${fmt(r.payout)}`);
      } else {
        const s = this.world.project(this.world.fieldTopWorld(r.bets.find((b) => b.won)?.fieldId ?? 'red'));
        floater(`+${fmt(r.payout)}`, s.x, s.y - 30, 'var(--money)', 36);
      }
    } else if (r.stake > 0) {
      sfx.lose();
    }
    if (r.nearMiss.length) {
      floater(`Knapp! Die ${r.nearMiss[0]} lag direkt daneben.`, window.innerWidth / 2 + 130, window.innerHeight * 0.4, '#ffb0a0', 24);
    }
    if (this.run.lastInterest > 0) setTimeout(() => toast(`Zinsen auf deine Einzahlung: <b>+${fmt(this.run.lastInterest)}</b>`), 400);
    this.shownCash = this.run.cash;
  }

  private endSpin(): void {
    this.world.clearChips();
    this.world.pulseFields = new Set();
    this.syncWorld();
    this.checkUnlocks();
    if (this.run.phase === 'gameover') {
      this.startCaught();
      return;
    }
    this.mode = 'table';
    this.world.cameraMode = 'table';
    this.clampChip();
    if (this.run.phase === 'due') {
      this.world.summonThugs();
      sfx.threat();
      this.enterRoom();
    } else if (this.run.rule === 'eile') {
      this.rushLeft = RUSH_SECONDS;
    }
    this.updateBanner();
    this.renderTable();
  }

  private updateBanner(): void {
    if (this.run.phase !== 'due') {
      setBanner();
      return;
    }
    const short = this.run.debt - this.run.deposit - this.run.cash;
    setBanner(short <= 0
      ? `<h3>Die Geldeintreiber sind da.</h3>Geh zur <b>Kasse</b> und bezahle <b>${fmt(this.run.debt)}</b>.`
      : `<h3>Dir fehlen ${fmt(short)}.</h3>Das wird ungemütlich.`);
  }

  // ---- Rendering ------------------------------------------------------------------

  private renderTable(): void {
    if (this.mode !== 'table' && this.mode !== 'spinning') return;
    renderTableBar(this.run, this.chip, {
      chip: (v) => this.selectChip(v),
      spin: () => this.spin(),
      repeat: () => this.repeatBets(),
      clear: () => this.clearBets(),
      leave: () => this.enterRoom(),
      wheel: () => this.showWheel(),
    }, this.mode === 'spinning');
    this.sideDirty = true;
  }

  private renderSideNow(): void {
    this.side.cash = Math.round(this.shownCashValue);
    renderSide(this.run, this.side);
    this.sideDirty = false;
  }

  private shownCashValue = 0;

  private showWheel(): void {
    openModal(wheelView(this.run, () => closeModal()), () => closeModal());
  }

  // ---- Frame ------------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(this.maxDt, (now - this.last) / 1000);
    this.last = now;
    const presses = this.input.takePresses();

    if (presses.includes('KeyM')) {
      sfx.muted = !sfx.muted;
      toast(sfx.muted ? 'Ton aus' : 'Ton an');
    }

    if (modalOpen()) {
      if (presses.includes('Escape') && ['kasse', 'vitrine', 'phone', 'room', 'table'].includes(this.mode)) {
        if (this.mode === 'kasse' || this.mode === 'vitrine' || this.mode === 'phone') this.closePanel();
        else closeModal();
      }
      this.world.movePlayer(dt, new THREE.Vector2(), false);
    } else {
      switch (this.mode) {
        case 'room': this.frameRoom(dt, presses); break;
        case 'table': this.frameTable(dt, presses); break;
        case 'spinning': this.frameSpinning(dt, presses); break;
        case 'caught': this.frameCaught(dt); break;
        default: break;
      }
    }

    // Rolling cash counter in the sidebar.
    if (this.mode !== 'start') {
      const target = this.mode === 'spinning' && this.spinStage === 'rolling' ? this.run.cash : this.shownCash;
      const d = target - this.shownCashValue;
      if (Math.abs(d) > 0.5) {
        const step = d * Math.min(1, dt * 6) + Math.sign(d) * dt * 20;
        this.shownCashValue = Math.abs(step) >= Math.abs(d) ? target : this.shownCashValue + step;
        this.sideDirty = true;
      } else if (this.shownCashValue !== target) {
        this.shownCashValue = target;
        this.sideDirty = true;
      }
      if (this.sideDirty) this.renderSideNow();
    }

    // The phone rings until it is answered.
    this.ringTimer -= dt;
    if (this.run.offers.length && this.ringTimer <= 0 && this.mode !== 'start' && this.mode !== 'phone') {
      this.ringTimer = 2.2;
      sfx.ring();
    }

    const speed = this.mode === 'spinning' && this.input.isDown('Space') ? 3.5 : 1;
    const ev = this.world.wheel.update(dt, speed);
    if (ev === 'landed') this.onFirstLanding();
    if (ev === 'done' && this.mode === 'spinning' && this.spinStage === 'rolling') this.onLanded();
    this.world.update(dt);
  }

  private frameRoom(dt: number, presses: string[]): void {
    const a = this.input.axis();
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    this.world.movePlayer(dt, new THREE.Vector2(a.x, a.y), sprint);

    const spot = this.world.nearKasse() ? 'kasse' : this.world.nearVitrine() ? 'vitrine' : this.world.nearPhone() ? 'phone' : this.world.nearTable() ? 'table' : undefined;
    const due = this.run.phase === 'due';
    switch (spot) {
      case 'kasse': setPrompt(`<kbd>E</kbd> Kasse${due ? ' – Rate bezahlen' : ''}`); break;
      case 'vitrine': setPrompt('<kbd>E</kbd> Vitrine ansehen'); break;
      case 'phone': setPrompt(this.run.offers.length ? '<kbd>E</kbd> Rangehen' : 'Das Telefon schweigt.'); break;
      case 'table': setPrompt(due ? 'Die Rate ist fällig – erst zur Kasse!' : '<kbd>E</kbd> An den Tisch'); break;
      default: setPrompt();
    }
    if (presses.includes('KeyE')) {
      if (spot === 'kasse') this.openKasse();
      else if (spot === 'vitrine') this.openVitrine();
      else if (spot === 'phone') this.answerPhone();
      else if (spot === 'table') this.enterTable();
    }
    if (presses.includes('KeyV')) this.showWheel();
    this.hoverItems();
  }

  private hoverItems(): void {
    const uid = this.mouse.x >= 0 ? this.world.pickItem(this.mouse.x, this.mouse.y) : undefined;
    renderItemTip(this.run, uid, this.mouse.x, this.mouse.y);
  }

  private frameTable(dt: number, presses: string[]): void {
    this.world.movePlayer(dt, new THREE.Vector2(), false);
    const list = availableChips(this.run.moneyBefore);
    for (const k of presses) {
      if (k.startsWith('Digit')) {
        const v = list[Number(k.slice(5)) - 1];
        if (v) this.selectChip(v);
      }
      if (k === 'KeyR') this.repeatBets();
      if (k === 'KeyC') this.clearBets();
      if (k === 'Space' || k === 'Enter') this.spin();
      if (k === 'KeyV') this.showWheel();
      if (k === 'Escape' || k === 'KeyE') {
        this.enterRoom();
        return;
      }
    }
    if (this.mode !== 'table') return;

    const field = this.mouse.x >= 0 ? this.world.raycastField(this.mouse.x, this.mouse.y) : undefined;
    if (field !== this.hover) {
      this.hover = field;
      this.world.hoverField = field && FIELD_BY_ID[field].numbers.length <= 1 ? field : undefined;
      this.world.hoverCells = new Set(field ? coveredCells(this.run, field) : []);
    }
    this.world.setGhost(this.chip <= this.run.cash ? this.chip : undefined, field);
    renderFieldInfo(this.run, field, this.mouse.x, this.mouse.y - 14);
    if (!field) this.hoverItems();
    else $('itemtip').classList.add('hidden');

    if (this.rushLeft !== undefined) {
      this.rushLeft -= dt;
      const t = $('timer');
      t.classList.remove('hidden');
      t.textContent = `${Math.max(0, Math.ceil(this.rushLeft))}`;
      if (this.rushLeft <= 0) {
        toast('<b>Rien ne va plus!</b> Der Croupier dreht.');
        this.spin(true);
      }
    }
  }

  private frameSpinning(dt: number, presses: string[]): void {
    this.world.movePlayer(dt, new THREE.Vector2(), false);
    if (this.spinStage !== 'scoring') return;
    const fast = presses.includes('Space') || presses.includes('Enter') || this.input.isDown('Space');
    this.seqWait -= dt * (fast ? 4 : 1);
    while (this.seq.length && this.seqWait <= 0) {
      const step = this.seq.shift()!;
      step.fn();
      this.seqWait += this.seq[0]?.delay ?? 0;
    }
  }

  private frameCaught(dt: number): void {
    this.caughtTimer -= dt;
    if (this.caughtTimer <= 0 && this.mode === 'caught') {
      this.mode = 'over';
      openModal(gameOverView(this.run, () => this.showStart()));
    }
  }

  /** Debug helper for the console: `game.cheat(5000)`. */
  cheat(money: number, marks = 0): void {
    this.run.cash += money;
    this.run.marks += marks;
    this.shownCash = this.run.cash;
    this.syncWorld();
  }
}
