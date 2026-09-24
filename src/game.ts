import * as THREE from 'three';
import { sfx } from './audio';
import { CONSUMABLES, ITEMS, NEWS, OFFERS, POCKET_ITEMS, RULES, SHARK_FACTOR, type PocketToolId } from './game/content';
import { FIELD_BY_ID } from './game/fields';
import { checkAchievements, loadProfile, lockedIds, recordRun, rewardName, saveProfile, type Profile } from './game/meta';
import { Run, RUSH_SECONDS } from './game/run';
import type { Line, SpinResult } from './game/scoring';
import { Input } from './input';
import { $, fmt, fmtMult } from './ui/dom';
import {
  availableChips, bigWin, bump, closeModal, coveredCells, floater, hideOsd, modalOpen, navModal, openModal, renderFieldInfo,
  renderItemTip, renderOsd, renderScore, renderSlip, renderTableBar, setBanner, setHelp, setPrompt, toast, type ScoreState,
} from './ui/hud';
import {
  automatView, collectionView, controlsView, gameOverView, kasseView, overviewView, phoneView, sharkView, startView, victoryView,
  vitrineView, wheelView,
} from './ui/screens';
import { ItemPreview } from './world/preview';
import { World } from './world/world';

type Mode = 'start' | 'room' | 'table' | 'spinning' | 'kasse' | 'vitrine' | 'phone' | 'smokes' | 'shark' | 'caught' | 'over';

const ROOM_HELP = '<span><kbd>WASD</kbd> LAUFEN</span><span><kbd>SHIFT</kbd> RENNEN</span><span><kbd>E</kbd> BENUTZEN</span><span><kbd>TAB</kbd> ÜBERSICHT</span><span><kbd>V</kbd> RAD</span><span><kbd>M</kbd> TON</span>';

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
  private score?: ScoreState;
  private shownCash = 0;
  private shownCashValue = 0;
  private osdDirty = true;
  private tape = 0;
  private osdSecond = -1;
  private preview = new ItemPreview();
  private seq: { delay: number; fn: () => void }[] = [];
  private seqWait = 0;
  private spinStage: 'rolling' | 'scoring' = 'rolling';
  private caughtTimer = 0;
  private ringTimer = 0;
  private overview = false;
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
    void this.boot();
  }

  private async boot(): Promise<void> {
    const loading = document.getElementById('loading');
    try {
      await this.world.init(import.meta.env.BASE_URL + 'assets/', (text) => {
        if (loading) loading.textContent = text;
      });
    } catch (e) {
      if (loading) loading.textContent = `BANDFEHLER: ${(e as Error).message ?? e}`;
      throw e;
    }
    this.world.setQuality(this.profile.quality === 'auto' ? 'high' : this.profile.quality);
    if (loading) loading.textContent = 'LADE BAND … SPULE VOR';
    await this.world.warmup().catch(() => undefined);
    loading?.remove();
    this.syncWorld();
    this.showStart();
    this.last = performance.now();
    this.world.renderer.setAnimationLoop(() => this.frame());
  }

  // Frame-rate watch for the 'auto' graphics setting: steps down while it stays too slow.
  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsSlow = 0;

  private watchPerformance(dt: number): void {
    if (this.profile.quality !== 'auto' || this.world.quality === 'low') return;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 2) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.fpsSlow = fps < 45 ? this.fpsSlow + 1 : 0;
    if (this.fpsSlow >= 2) {
      this.fpsSlow = 0;
      const next = this.world.quality === 'high' ? 'medium' : 'low';
      this.world.setQuality(next);
      toast(`GRAFIK AUTOMATISCH AUF ${next === 'medium' ? 'MITTEL' : 'NIEDRIG'} GESTELLT.`);
    }
  }

  private setGraphics(q: Profile['quality']): void {
    this.profile.quality = q;
    saveProfile(this.profile);
    this.world.setQuality(q === 'auto' ? 'high' : q);
    this.fpsSlow = 0;
  }

  // ---- Runs ------------------------------------------------------------------

  private showStart(): void {
    this.mode = 'start';
    this.world.cameraMode = 'menu';
    hideOsd();
    setBanner();
    setPrompt();
    setHelp('<span>PFEILE + ENTER</span><span>◀ ▶ ÄNDERN</span>');
    $('tablebar').classList.add('hidden');
    openModal(startView(this.profile, lockedIds(this.profile), {
      start: (kit, stage, ball) => this.newRun(kit, stage, ball),
      collection: () => openModal(collectionView(this.profile, () => this.showStart()), 'vcr'),
      controls: () => openModal(controlsView(() => this.showStart()), 'vcr'),
      toggleSound: () => {
        sfx.muted = !sfx.muted;
        return !sfx.muted;
      },
      graphics: (q) => this.setGraphics(q),
    }, !sfx.muted, this.profile.quality), 'clear');
  }

  private newRun(kit: string, stage: number, ball = 'stahl'): void {
    sfx.unlock();
    this.profile.lastKit = kit;
    this.profile.lastStage = stage;
    this.profile.lastBall = ball;
    saveProfile(this.profile);
    this.run = new Run({ kit, stage, ball, locked: lockedIds(this.profile) });
    this.world.setBall(ball);
    this.world.dismissShark();
    this.world.resetPlayer();
    this.shownCash = this.run.cash;
    this.shownCashValue = this.run.cash;
    this.score = undefined;
    renderScore();
    this.tape = 0;
    this.seq = [];
    this.world.clearChips();
    this.world.dismissThugs();
    this.world.distort(1.2);
    this.syncWorld();
    closeModal();
    this.enterRoom();
    toast('GEH AN DEN ROULETTETISCH UND DRÜCK <kbd>E</kbd>.');
  }

  /** Pushes run state that the 3D scene shows: talismans, showcase, wheel, marquee, phone. */
  private syncWorld(): void {
    const r = this.run;
    this.chanceCache = undefined;
    this.world.setItems(r.items, r.perks.slots);
    this.world.setShowcase(r.shop);
    this.world.refreshWheel(r.wheel, undefined, r.visions);
    this.world.markCells = new Set(r.visions.map((i) => `n${r.wheel[i].number}`));
    this.world.setMarquee(r.history, r.debt, r.round, r.cycleRounds);
    this.world.phoneRinging = r.offers.length > 0;
    this.world.setNews(r.news ? `${NEWS[r.news].headline} · ${NEWS[r.news].desc.toUpperCase()}` : '');
    this.world.setRival(r.duel);
    this.osdDirty = true;
  }

  private checkUnlocks(): void {
    for (const a of checkAchievements(this.profile, this.run)) {
      sfx.win(true);
      toast(`◆ ERFOLG: ${a.name.toUpperCase()} – FREIGESCHALTET: ${a.rewards.map(rewardName).join(', ').toUpperCase()}`, 'unlock');
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
    renderSlip(this.run, false);
    setHelp(ROOM_HELP);
    this.osdDirty = true;
    this.updateBanner();
  }

  private enterTable(): void {
    if (this.run.phase !== 'betting') {
      toast('DIE RATE IST FÄLLIG. ERST AN DIE KASSE!');
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
    if (this.run.duel) toast(`DUELL: ${this.run.duel.name.toUpperCase()} SPIELT GEGEN DICH. GEWINN MEHR ALS ER!`, 'boss');
    else if (this.run.roundsLeft === 1) toast('LETZTER DREH VOR DER RATE. <kbd>H</kbd> = HOCHRISIKO.');
  }

  private openSmokes(): void {
    this.mode = 'smokes';
    this.world.cameraMode = 'smokes';
    this.world.standAt('smokes');
    setPrompt();
    this.renderSmokes();
  }

  private renderSmokes(): void {
    openModal(automatView(this.run, lockedIds(this.profile), (id) => {
      const msg = this.run.buySmoke(id);
      if (!msg) {
        sfx.error();
        return;
      }
      sfx.coin();
      toast(`${CONSUMABLES[id].name.toUpperCase()}: ${msg}`);
      this.shownCash = this.run.cash;
      this.checkUnlocks();
      this.syncWorld();
      this.renderSmokes();
    }, () => this.closePanel()), 'vcr', () => this.closePanel());
  }

  private toggleOverview(): void {
    if (this.overview) {
      this.overview = false;
      closeModal();
      return;
    }
    if (modalOpen()) return;
    this.overview = true;
    openModal(overviewView(this.run, () => this.toggleOverview()), 'vcr', () => this.toggleOverview());
  }

  // ---- Loan shark ----------------------------------------------------------------------

  private startShark(): void {
    this.mode = 'shark';
    this.world.standAtTable(false);
    this.world.summonShark();
    this.world.cameraMode = 'shark';
    $('tablebar').classList.add('hidden');
    renderSlip(this.run, false);
    setBanner();
    setPrompt();
    sfx.threat();
    toast(this.run.sharkDue ? 'DU KANNST NICHT ZAHLEN. JEMAND IN WEISS KOMMT HEREIN.' : 'DU BIST PLEITE. JEMAND IN WEISS KOMMT HEREIN.', 'boss');
    setTimeout(() => {
      if (this.mode !== 'shark') return;
      openModal(sharkView(this.run, () => {
        const amount = this.run.takeShark();
        sfx.cash();
        closeModal();
        toast(`+${fmt(amount)} VOM KREDITHAI. AB DER NÄCHSTEN RATE ZAHLST DU ${Math.round((SHARK_FACTOR - 1) * 100)} % MEHR.`, 'boss');
        this.shownCash = this.run.cash;
        this.world.dismissShark();
        this.afterShark();
      }, () => {
        this.run.declineShark();
        closeModal();
        this.world.dismissShark();
        this.afterShark();
      }), 'clear');
    }, 2200);
  }

  private afterShark(): void {
    this.syncWorld();
    if (this.run.phase === 'gameover') {
      this.startCaught();
      return;
    }
    if (this.run.phase === 'due') {
      this.world.summonThugs();
      toast('DIE TÜR GEHT AUF.', 'boss');
    }
    this.enterRoom();
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
          this.osdDirty = true;
        }
      },
      pay: () => this.pay(),
      surrender: () => {
        this.run.surrender();
        closeModal();
        this.startCaught();
      },
      close: () => this.closePanel(),
    }), 'vcr', () => this.closePanel());
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
          toast(`${ITEMS[def].name.toUpperCase()} STEHT JETZT AUF DEINEM TISCH.`);
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
    }, this.preview), 'vcr', () => this.closePanel());
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
          toast(num !== undefined ? `FACH ${before} IST JETZT DIE ${p.number}.` : `${name.toUpperCase()}: FACH ${p.number}.`);
          setTimeout(() => this.world.refreshWheel(this.run.wheel, undefined, this.run.visions), 2500);
        }
        this.afterShop();
      },
    }), 'vcr');
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
      toast(`BOSS: ${OFFERS[id].name.toUpperCase()}. ${msg ?? ''}`, 'boss');
      this.syncWorld();
      this.checkUnlocks();
      this.closePanel();
    }, () => {
      this.run.declineOffers();
      this.syncWorld();
      this.checkUnlocks();
      this.closePanel();
    }), 'clear', () => this.closePanel());
  }

  private closePanel(): void {
    closeModal();
    if (this.mode === 'kasse' || this.mode === 'vitrine' || this.mode === 'phone' || this.mode === 'smokes') this.enterRoom();
  }

  private pay(): void {
    const n = this.run.cycle + 1;
    if (!this.run.pay()) return;
    sfx.cash();
    this.world.dismissThugs();
    this.rushLeft = undefined;
    this.shownCash = this.run.cash;
    toast(`RATE ${n} BEZAHLT. +◆${this.run.lastPayMarks} GLÜCKSMARKEN. DIE HERREN ZIEHEN AB – VORERST.`);
    if (this.run.rule) setTimeout(() => toast(`NEUE HAUSREGEL: ${RULES[this.run.rule!].name.toUpperCase()} – ${RULES[this.run.rule!].desc}`), 800);
    setTimeout(() => toast('DAS ROTE TELEFON KLINGELT.', 'boss'), 1600);
    this.syncWorld();
    this.checkUnlocks();
    if (this.run.phase === 'victory') {
      recordRun(this.profile, this.run, true);
      closeModal();
      openModal(victoryView(this.run, () => {
        this.run.continueEndless();
        closeModal();
        this.enterRoom();
      }, () => this.rewind()), 'black');
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
    renderSlip(this.run, false);
    this.world.thugsAttack();
    this.world.cameraMode = 'caught';
    sfx.caught();
    recordRun(this.profile, this.run, false);
  }

  /** Back to the menu with a burst of rewinding tape. */
  private rewind(): void {
    closeModal();
    this.world.distort(3);
    sfx.rewind();
    setTimeout(() => this.showStart(), 700);
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
      if (this.run.activeRule === 'limit' && this.chip <= this.run.cash) toast('TISCHLIMIT: HÖCHSTENS EIN VIERTEL DEINES GELDES PRO DREH.');
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

  private bribe(): void {
    if (!this.run.bribe()) {
      sfx.error();
      if (!this.run.stakeTotal) toast('ERST SETZEN – DER CROUPIER WILL WISSEN, WOFÜR.');
      return;
    }
    if (this.run.bribed) {
      sfx.coin();
      this.world.croupierNod();
      toast(`DER CROUPIER NICKT. ER KASSIERT ${fmt(this.run.bribePrice)}, WENN ER DIE KUGEL WIRFT.`);
    } else {
      sfx.pickup();
      toast('BESTECHUNG ZURÜCKGEZOGEN.');
    }
    this.renderTable();
  }

  private toggleRisk(): void {
    if (!this.run.setHighRisk(!this.run.highRisk)) {
      sfx.error();
      toast(this.run.stakeTotal ? 'DAFÜR BRAUCHST DU NOCH EINMAL SO VIEL BARGELD WIE DEIN EINSATZ.' : 'ERST SETZEN, DANN HOCHRISIKO.');
      return;
    }
    if (this.run.highRisk) {
      sfx.threat();
      this.world.distort(0.5);
      toast('HOCHRISIKO: GEWINN ×2 MULT – VERLUST DOPPELT. EINSÄTZE SIND GESPERRT.', 'boss');
    } else {
      sfx.pickup();
    }
    this.shownCash = this.run.cash;
    this.renderTable();
  }

  private useSmoke(i: number): void {
    const id = this.run.smokes[i];
    if (!id || !this.run.useSmoke(i)) return;
    sfx.select();
    toast(`${CONSUMABLES[id].name.toUpperCase()}: ${CONSUMABLES[id].desc}`);
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
      toast('NOCH NICHTS GESETZT. <kbd>LEER</kbd> NOCHMAL = TROTZDEM DREHEN.');
      return;
    }
    this.confirmEmpty = false;
    this.rushLeft = undefined;
    $('timer').classList.add('hidden');
    renderSlip(this.run, false);
    const bribed = this.run.bribed;
    const r = this.run.spin();
    if (bribed && !this.run.bribePaid) {
      toast('FÜR DIE BESTECHUNG FEHLT DIR DAS GELD. DER CROUPIER WIRFT GANZ NORMAL.');
    } else if (this.run.bribeCaught) {
      sfx.error();
      toast('DER SAALCHEF HAT DIE BESTECHUNG GESEHEN! DAS GELD IST WEG, DIE RATE STEIGT UM 20 %.', 'boss');
    } else if (bribed) {
      this.world.croupierNod();
    }
    this.mode = 'spinning';
    this.spinStage = 'rolling';
    this.score = { sum: 0, mult: 1, lines: [] };
    renderScore(this.score);
    this.osdDirty = true;
    this.world.cameraMode = 'wheel';
    this.world.hoverField = undefined;
    this.world.hoverCells = new Set();
    this.world.setGhost(undefined, undefined);
    $('fieldinfo').classList.add('hidden');
    $('itemtip').classList.add('hidden');
    this.world.wheel.spin(r.hop ? r.hop.from : r.pocket.index, 6.5, r.hop?.to);
    sfx.spin();
    floater('RIEN NE VA PLUS!', window.innerWidth / 2, window.innerHeight * 0.22, '#fff', 48);
    this.renderTable();
  }

  /** The ball rested in its first pocket, and luck is about to make it hop. */
  private onFirstLanding(): void {
    const r = this.run.lastResult!;
    sfx.land();
    const s = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
    const from = this.run.wheel[r.hop!.from];
    floater(`${from.number} …`, s.x, s.y - 40, '#ddd', 44);
    const lucky = this.run.wheel[r.hop!.to];
    const good = r.payout > 0;
    setTimeout(() => {
      if (good) sfx.coin();
      else sfx.lose();
      const s2 = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
      floater(good ? `GLÜCK! SIE HÜPFT AUF ${lucky.number}!` : `PECH! SIE HÜPFT AUF ${lucky.number}!`, s2.x, s2.y - 70, good ? 'var(--luck)' : 'var(--rec)', 38);
    }, 450);
  }

  private onLanded(): void {
    const r = this.run.lastResult!;
    this.run.settle();
    sfx.land();
    this.world.refreshWheel(this.run.wheel, r.pocket.index);
    this.world.setDolly(r.pocket.number);
    const s = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
    const col = r.pocket.color === 'red' ? '#ff5a64' : r.pocket.color === 'black' ? '#eee' : '#4fe08a';
    floater(`${r.pocket.number}`, s.x, s.y - 40, col, 72);
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
    this.score!.lines.push(l);
    let at: THREE.Vector3 | undefined;
    if (l.item !== undefined) at = this.world.triggerItem(l.item);
    if (l.kind === 'bet') {
      setSum(getSum() + l.amount);
      this.score!.sum = getSum();
      if (l.fieldId) at = this.world.popField(l.fieldId);
      sfx.line(i);
      if (at) {
        const s = this.world.project(at);
        floater(`+${fmt(l.amount)}`, s.x, s.y, 'var(--sum)', 34);
      }
      this.osdDirty = true;
      renderScore(this.score);
      bump('sum');
    } else if (l.kind === 'add' || l.kind === 'mul') {
      setMult(l.kind === 'add' ? getMult() + l.amount : getMult() * l.amount);
      this.score!.mult = Math.round(getMult() * 1000) / 1000;
      sfx.mult(i);
      if (at) {
        const s = this.world.project(at);
        floater(l.kind === 'add' ? `+${fmtMult(l.amount)} MULT` : `×${fmtMult(l.amount)} MULT`, s.x, s.y, 'var(--mult)', 32);
      }
      renderScore(this.score);
      bump('mult');
    } else if (l.kind === 'money') {
      sfx.cash();
      if (at) floater(`+${fmt(l.amount)}`, this.world.project(at).x, this.world.project(at).y, 'var(--money)', 32);
      renderScore(this.score);
    } else if (l.kind === 'marks') {
      sfx.coin();
      floater(`+◆${l.amount}`, window.innerWidth / 2, window.innerHeight * 0.3, 'var(--marks)', 40);
      renderScore(this.score);
    }
  }

  private finishScoring(r: SpinResult): void {
    const net = r.payout - r.stake;
    this.score!.result = net;
    renderScore(this.score);
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
        floater(`+${fmt(r.payout)}`, s.x, s.y - 30, 'var(--money)', 48);
      }
    } else if (r.stake > 0) {
      sfx.lose();
    }
    if (r.nearMiss.length) {
      floater(`KNAPP! DIE ${r.nearMiss[0]} LAG DIREKT DANEBEN.`, window.innerWidth / 2, window.innerHeight * 0.42, '#ffb0a0', 34);
    }
    if (this.run.lastInterest > 0) setTimeout(() => toast(`ZINSEN AUF DEINE EINZAHLUNG: +${fmt(this.run.lastInterest)}`), 400);
    this.shownCash = this.run.cash;
  }

  private endSpin(): void {
    this.world.clearChips();
    this.world.setDolly();
    setTimeout(() => {
      if (this.mode !== 'spinning') {
        this.score = undefined;
        renderScore();
      }
    }, 2500);
    this.world.pulseFields = new Set();
    this.syncWorld();
    this.checkUnlocks();
    if (this.run.phase === 'gameover') {
      this.startCaught();
      return;
    }
    const d = this.run.lastDuel;
    if (d) {
      this.world.rivalReact(d.outcome === 'lost');
      if (d.outcome === 'won') toast(`DUELL GEWONNEN GEGEN ${d.name.toUpperCase()} (${fmt(d.playerNet ?? 0)} ZU ${fmt(d.rivalNet ?? 0)}): +◆3 UND ${fmt(d.stake)}.`, 'unlock');
      else if (d.outcome === 'lost') toast(`DUELL VERLOREN GEGEN ${d.name.toUpperCase()} (${fmt(d.playerNet ?? 0)} ZU ${fmt(d.rivalNet ?? 0)}): DIE RATE STEIGT UM 15 %.`, 'boss');
      else toast(`DUELL UNENTSCHIEDEN GEGEN ${d.name.toUpperCase()}.`);
    }
    if (this.run.duel && !d) setTimeout(() => toast(`EIN STAMMGAST SETZT SICH AN DEN TISCH: ${this.run.duel?.name.toUpperCase() ?? ''} WILL EIN DUELL.`, 'boss'), 900);
    this.clampChip();
    this.rushLeft = undefined;
    if (this.run.phase === 'shark') {
      this.startShark();
      return;
    }
    // After every spin you get up from the table and walk the room again.
    this.enterRoom();
    if (this.run.phase === 'due') {
      this.world.summonThugs();
      sfx.threat();
      toast('DIE TÜR GEHT AUF. DIE RATE IST FÄLLIG.', 'boss');
    } else {
      toast(`DREH ${this.run.round - 1}/${this.run.cycleRounds} GESPIELT. <kbd>E</kbd> AM TISCH FÜR DEN NÄCHSTEN.`);
    }
    this.updateBanner();
  }

  private updateBanner(): void {
    if (this.run.phase !== 'due') {
      setBanner();
      return;
    }
    const short = this.run.debt - this.run.deposit - this.run.cash;
    setBanner(short <= 0
      ? `<div class="big">RATE FÄLLIG</div>GEH ZUR KASSE UND BEZAHLE ${fmt(this.run.debt)}.`
      : `<div class="big">DIR FEHLEN ${fmt(short)}</div>DAS WIRD UNGEMÜTLICH.`);
  }

  // ---- Rendering ------------------------------------------------------------------

  private chanceCache?: number[];

  private renderTable(): void {
    this.chanceCache = undefined;
    if (this.mode !== 'table' && this.mode !== 'spinning') return;
    renderTableBar(this.run, this.chip, {
      chip: (v) => this.selectChip(v),
      spin: () => this.spin(),
      repeat: () => this.repeatBets(),
      clear: () => this.clearBets(),
      leave: () => this.enterRoom(),
      wheel: () => this.showWheel(),
      bribe: () => this.bribe(),
      risk: () => this.toggleRisk(),
      smoke: (i) => this.useSmoke(i),
    }, this.mode === 'spinning');
    renderSlip(this.run, this.mode === 'table');
    this.osdDirty = true;
  }

  private renderOsdNow(): void {
    renderOsd(this.run, Math.round(this.shownCashValue), this.tape);
    this.osdDirty = false;
  }

  private showWheel(): void {
    openModal(wheelView(this.run, () => closeModal()), 'vcr', () => closeModal());
  }

  // ---- Frame ------------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    const dt = Math.min(this.maxDt, raw);
    this.last = now;
    this.watchPerformance(Math.min(raw, 1));
    const presses = this.input.takePresses();

    if (presses.includes('KeyM')) {
      sfx.muted = !sfx.muted;
      toast(sfx.muted ? 'TON AUS' : 'TON AN');
    }

    if (!modalOpen()) this.overview = false;
    if (modalOpen()) {
      for (const k of presses) navModal(k);
      if (this.overview && (presses.includes('Escape') || presses.includes('Tab'))) this.toggleOverview();
      else if (presses.includes('Escape')) {
        if (this.mode === 'kasse' || this.mode === 'vitrine' || this.mode === 'phone' || this.mode === 'smokes') this.closePanel();
        else if (this.mode === 'room' || this.mode === 'table') closeModal();
        else if (this.mode === 'start') this.showStart();
      }
      if (this.mode !== 'start') this.world.movePlayer(dt, new THREE.Vector2(), false);
    } else {
      switch (this.mode) {
        case 'room': this.frameRoom(dt, presses); break;
        case 'table': this.frameTable(dt, presses); break;
        case 'spinning': this.frameSpinning(dt, presses); break;
        case 'caught': this.frameCaught(dt); break;
        default: break;
      }
    }

    // Rolling cash counter and tape clock in the OSD.
    if (this.mode !== 'start' && this.mode !== 'over') {
      this.tape += dt;
      if (Math.floor(this.tape) !== this.osdSecond) {
        this.osdSecond = Math.floor(this.tape);
        this.osdDirty = true;
      }
      const target = this.mode === 'spinning' && this.spinStage === 'rolling' ? this.run.cash : this.shownCash;
      const d = target - this.shownCashValue;
      if (Math.abs(d) > 0.5) {
        const step = d * Math.min(1, dt * 6) + Math.sign(d) * dt * 20;
        this.shownCashValue = Math.abs(step) >= Math.abs(d) ? target : this.shownCashValue + step;
        this.osdDirty = true;
      } else if (this.shownCashValue !== target) {
        this.shownCashValue = target;
        this.osdDirty = true;
      }
      if (this.osdDirty) this.renderOsdNow();
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

    const spot = this.world.nearKasse() ? 'kasse' : this.world.nearVitrine() ? 'vitrine' : this.world.nearPhone() ? 'phone' : this.world.nearSmokes() ? 'smokes' : this.world.nearTable() ? 'table' : undefined;
    const due = this.run.phase === 'due';
    switch (spot) {
      case 'kasse': setPrompt(`<kbd>E</kbd> KASSE${due ? ' – RATE BEZAHLEN' : ''}`); break;
      case 'vitrine': setPrompt('<kbd>E</kbd> VITRINE'); break;
      case 'phone': setPrompt(this.run.offers.length ? '<kbd>E</kbd> RANGEHEN' : 'DAS TELEFON SCHWEIGT.'); break;
      case 'smokes': setPrompt('<kbd>E</kbd> ZIGARETTENAUTOMAT'); break;
      case 'table': setPrompt(due ? 'DIE RATE IST FÄLLIG – ERST ZUR KASSE!' : '<kbd>E</kbd> AN DEN TISCH'); break;
      default: setPrompt();
    }
    if (presses.includes('KeyE')) {
      if (spot === 'kasse') this.openKasse();
      else if (spot === 'vitrine') this.openVitrine();
      else if (spot === 'phone') this.answerPhone();
      else if (spot === 'smokes') this.openSmokes();
      else if (spot === 'table') this.enterTable();
    }
    if (presses.includes('KeyV')) this.showWheel();
    if (presses.includes('Tab')) this.toggleOverview();
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
      if (k.startsWith('Digit') && Number(k.slice(5)) <= 6) {
        const v = list[Number(k.slice(5)) - 1];
        if (v) this.selectChip(v);
      }
      if (k === 'Digit7' || k === 'Digit8' || k === 'Digit9') this.useSmoke(Number(k.slice(5)) - 7);
      if (k === 'KeyB') this.bribe();
      if (k === 'KeyH') this.toggleRisk();
      if (k === 'Tab') this.toggleOverview();
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
    // Odds only change when the table changes (renderTable clears this), not every frame.
    this.chanceCache ??= this.run.finalChances();
    renderFieldInfo(this.run, field, this.mouse.x, this.mouse.y - 14, this.chanceCache);
    if (!field) this.hoverItems();
    else $('itemtip').classList.add('hidden');

    if (this.rushLeft !== undefined) {
      this.rushLeft -= dt;
      const t = $('timer');
      t.classList.remove('hidden');
      t.textContent = `${Math.max(0, Math.ceil(this.rushLeft))}`;
      if (this.rushLeft <= 0) {
        toast('RIEN NE VA PLUS! DER CROUPIER DREHT.');
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
      openModal(gameOverView(this.run, () => this.rewind()), 'black');
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
