import * as THREE from 'three';
import { sfx } from './audio';
import { CONSUMABLES, DEBTS, ITEMS, NEWS, POCKET_ITEMS, RULES, SHARK_FACTOR, type PocketToolId } from './game/content';
import { FIELD_BY_ID } from './game/fields';
import { checkAchievements, loadProfile, lockedIds, recordRun, rewardName, saveProfile, type Profile } from './game/meta';
import { Run, RUSH_SECONDS } from './game/run';
import { streakBonus, type Line, type SpinResult } from './game/scoring';
import { canLockEscape, toggleFullscreen, watchFullscreen } from './fullscreen';
import { BARON, SPECIAL_CHIPS } from './game/extras';
import { Input } from './input';
import { $, fmt, fmtMult } from './ui/dom';
import {
  availableChips, bigWin, bump, closeModal, coveredCells, floater, hideOsd, modalOpen, navModal, openModal, renderFieldInfo,
  renderItemTip, renderOsd, renderShopTip, renderScore, renderSlip, renderTableBar, setBanner, setHelp, setPrompt, toast, type ScoreState,
} from './ui/hud';
import {
  automatView, collectionView, controlsView, bonusWheelView, draftView, gameOverView, kasseView, overviewView, pauseView, rideView, sharkView, startView, storyView, victoryView,
  ownedView, wheelView,
} from './ui/screens';
import { renderGoal } from './ui/guide';
import { World } from './world/world';

type Mode = 'start' | 'room' | 'table' | 'spinning' | 'kasse' | 'vitrine' | 'smokes' | 'shark' | 'caught' | 'over';

const ROOM_HELP = '<span><kbd>MAUS</kbd> UMSEHEN (KLICK)</span><span><kbd>WASD</kbd> LAUFEN</span><span><kbd>SHIFT</kbd> RENNEN</span><span><kbd>E</kbd> BENUTZEN</span><span><kbd>TAB</kbd> ÜBERSICHT</span><span><kbd>V</kbd> RAD</span>';

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
  private seq: { delay: number; fn: () => void }[] = [];
  private seqWait = 0;
  private spinStage: 'rolling' | 'scoring' = 'rolling';
  private caughtTimer = 0;
  private overview = false;
  private paused = false;

  /** When the pause menu opened: the Esc that opened it must not close it again. */
  private pausedAt = 0;

  private openPause(): void {
    this.paused = true;
    this.pausedAt = performance.now();
    this.releasePointer();
    openModal(pauseView(this.profile, !sfx.muted, {
      resume: () => this.closePause(),
      controls: () => openModal(controlsView(() => this.openPause()), 'vcr', () => this.openPause()),
      mouse: (d) => {
        this.profile.mouse = Math.max(1, Math.min(10, this.profile.mouse + d));
        this.world.sensitivity = this.profile.mouse / 5;
    sfx.setMusic(this.profile.music);
        saveProfile(this.profile);
        return this.profile.mouse;
      },
      graphics: (q) => this.setGraphics(q),
      fullscreen: () => this.toggleFs(),
      toggleSound: () => {
        sfx.muted = !sfx.muted;
        return !sfx.muted;
      },
      toggleMusic: () => {
        this.profile.music = !this.profile.music;
        saveProfile(this.profile);
        sfx.setMusic(this.profile.music);
        return this.profile.music;
      },
      quit: () => {
        this.paused = false;
        this.run.surrender();
        recordRun(this.profile, this.run, false);
        this.rewind();
      },
    }), 'vcr', () => this.closePause());
  }

  /** Fullscreen on and off (F, or the menus). Esc stays with the game where the browser allows it. */
  private async toggleFs(): Promise<boolean> {
    sfx.select();
    const on = await toggleFullscreen();
    if (on) toast(canLockEscape() ? 'VOLLBILD. ESC BLEIBT IM SPIEL – ZUM VERLASSEN ESC GEDRÜCKT HALTEN ODER F.' : 'VOLLBILD. DEIN BROWSER VERLÄSST ES MIT ESC – NIMM Q STATT ESC, F BEENDET ES.');
    return on;
  }

  private closePause(): void {
    this.paused = false;
    closeModal();
  }

  // ---- First-run tutorial: one hint at a time, each cleared by doing it ----------------

  private static readonly TUTORIAL = [
    'KLICK INS BILD UND SIEH DICH MIT DER MAUS UM. LAUF MIT <kbd>WASD</kbd> ZUM ROULETTETISCH UND DRÜCK <kbd>E</kbd>.',
    'KLICK AUF EIN FELD, UM DEN GEWÄHLTEN JETON ZU SETZEN. RECHTS STEHEN QUOTEN, CHANCEN UND DAS TISCHLIMIT.',
    '<kbd>LEER</kbd> DREHT DAS RAD. GEWINN = SUMME × MULT.',
    'DER BALKEN OBEN ZEIGT DEINE RATE. NACH 3 DREHS WIRD SIE FÄLLIG – ZAHL AN DER KASSE HINTER DEM TISCH.',
    'DIE VITRINE GEGENÜBER DEM TISCH (DREH DICH UM) VERKAUFT TALISMANE FÜR GLÜCKSMARKEN ◆. ZEIG DRAUF, KLICK KAUFT.',
  ];

  /** Shows the current tutorial hint, if any. */
  private showHint(): void {
    const step = this.profile.tutorial;
    const el = $('hint');
    const text = (this.mode === 'room' || this.mode === 'table') && !modalOpen() && step < Game.TUTORIAL.length ? Game.TUTORIAL[step] : '';
    el.classList.toggle('hidden', !text);
    if (text && el.innerHTML !== text) el.innerHTML = text;
  }

  /** Marks tutorial step `n` done (and all before it). */
  private tutorialDone(n: number): void {
    if (this.profile.tutorial > n) return;
    this.profile.tutorial = n + 1;
    saveProfile(this.profile);
    this.showHint();
  }
  private dragLook = false;
  private hintTick = -1;

  /** Captures the mouse for first-person look. Some embeds refuse; then dragging still works. */
  private capturePointer(): void {
    const canvas = this.world.renderer.domElement;
    if (document.pointerLockElement === canvas) return;
    try {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => undefined);
    } catch {
      // Pointer lock unavailable: drag to look.
    }
  }

  private releasing = false;

  private releasePointer(): void {
    this.dragLook = false;
    if (document.pointerLockElement) {
      this.releasing = true;
      document.exitPointerLock();
    }
  }
  private last = performance.now();
  /** Largest simulated step per frame; raised by automated tests on slow software renderers. */
  maxDt = 0.05;

  constructor(container: HTMLElement) {
    this.world = new World(container);
    this.profile = loadProfile();
    this.run = new Run({ locked: lockedIds(this.profile) });
    this.world.wheel.onTick = (s) => sfx.tick(s);
    this.world.wheel.onKnock = (s) => sfx.knock(s);
    this.world.onStep = () => sfx.step();
    this.world.sensitivity = this.profile.mouse / 5;

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      // First person: mouse look while the pointer is captured, or while dragging without capture.
      if (this.mode === 'room' && !modalOpen() && (document.pointerLockElement === canvas || this.dragLook)) {
        this.world.look(e.movementX, e.movementY);
      }
    });
    canvas.addEventListener('mouseup', () => (this.dragLook = false));
    canvas.addEventListener('mousedown', (e) => {
      sfx.unlock();
      if (this.mode === 'room' && !modalOpen()) {
        this.dragLook = true;
        this.capturePointer();
        return;
      }
      if (this.mode === 'vitrine' && !modalOpen()) {
        if (e.button === 0) this.clickShop();
        return;
      }
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
    // Esc also frees the mouse without a key event reaching the page: treat losing it like Esc.
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && !this.releasing && this.mode === 'room' && !modalOpen()) this.openPause();
      this.releasing = false;
    });
    // The browser dropped out of fullscreen by itself (Esc in Safari): pause like Esc would.
    watchFullscreen(() => {
      if (this.mode === 'room' && !modalOpen()) this.openPause();
      toast('VOLLBILD VERLASSEN – <kbd>F</kbd> FÜR VOLLBILD, <kbd>Q</kbd> STATT ESC.');
    }, () => this.world.resize());
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
      fullscreen: () => this.toggleFs(),
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
    this.recordShown = false;
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
    // The Baron's voice-over opens every tape.
    openModal(storyView(BARON.intro.map((l) => l.replace('{SUMME}', DEBTS.reduce((a, b) => a + b, 0).toLocaleString('de-DE'))), () => {
      closeModal();
      toast('GEH AN DEN ROULETTETISCH UND DRÜCK <kbd>E</kbd>.');
    }), 'black');
  }

  /** Pushes run state that the 3D scene shows: talismans, showcase, wheel, marquee, special chips. */
  private syncWorld(): void {
    const r = this.run;
    this.chanceCache = undefined;
    this.world.setItems(r.items, r.perks.slots);
    this.world.setShowcase(r.shop, (i) => r.canBuy(i));
    this.world.refreshWheel(r.wheel, undefined, r.visions);
    this.world.markCells = new Set(r.visions.map((i) => `n${r.wheel[i].number}`));
    this.world.setMarquee(r.history, r.debt, r.round, r.cycleRounds);
    this.world.blockedField = r.blocked;
    this.world.setSpecials(r.placedSpecials, SPECIAL_CHIPS);
    this.world.setNews(r.news ? `${NEWS[r.news].headline} · ${NEWS[r.news].desc.toUpperCase()}` : '');
    this.world.setRival(r.duel);
    this.osdDirty = true;
  }

  private checkUnlocks(): void {
    for (const a of checkAchievements(this.profile, this.run)) {
      sfx.win(true);
      toast(`◆ ERFOLG: ${a.name.toUpperCase()}${a.rewards.length ? ` – FREIGESCHALTET: ${a.rewards.map(rewardName).join(', ').toUpperCase()}` : ''}`, 'unlock');
    }
  }

  // ---- Modes -------------------------------------------------------------------

  private enterRoom(): void {
    this.mode = 'room';
    this.dragLook = false;
    this.osdDirty = true;
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
    this.releasePointer();
    if (this.run.phase === 'betting') this.tutorialDone(0);
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
    this.betWait = 2.5;
    floater('FAITES VOS JEUX', window.innerWidth / 2, window.innerHeight * 0.22, '#fff', 40);
    this.renderTable();
    if (this.run.duel?.name === 'Der Baron') toast(`DER BARON SPERRT ${FIELD_BY_ID[this.run.blocked!].label.toUpperCase()} UND SETZT AUF ${FIELD_BY_ID[this.run.duel.fieldId].label.toUpperCase()}. SCHLAG IHN!`, 'boss');
    else if (this.run.duel) toast(`DUELL: ${this.run.duel.name.toUpperCase()} SPIELT GEGEN DICH. GEWINN MEHR ALS ER!`, 'boss');
    else if (this.run.doubleNext) toast('ZWEI KUGELN LIEGEN BEREIT: DIESER DREH ROLLT DOPPELT.', 'unlock');
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
    if (this.profile.tutorial >= 4) this.tutorialDone(4);
    this.mode = 'vitrine';
    this.world.cameraMode = 'vitrine';
    this.world.standAt('vitrine');
    this.releasePointer();
    setPrompt();
    setHelp('');
    this.renderShopBar();
  }

  /** The bar under the showcase: marks, reroll, your own talismans, back. */
  private renderShopBar(): void {
    const bar = $('shopbar');
    bar.classList.remove('hidden');
    const r = this.run;
    const btn = (html: string, fn: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.innerHTML = html;
      b.disabled = disabled;
      b.onclick = fn;
      return b;
    };
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = `KURIOSITÄTEN · <span class="marks">◆ ${r.marks} GLÜCKSMARKEN</span>`;
    const hint = document.createElement('div');
    hint.className = 'hintline';
    hint.textContent = r.shop.some((x) => !x.sold) ? 'ZEIG MIT DER MAUS AUF EIN STÜCK – KLICK KAUFT ES' : 'AUSVERKAUFT – LASS NEU BESTÜCKEN';
    const btns = document.createElement('div');
    btns.className = 'btns';
    btns.append(
      btn(`<kbd>R</kbd> NEU BESTÜCKEN ◆${r.rerollCost}`, () => this.rerollShop(), r.marks < r.rerollCost || !r.cashierOpen),
      btn(`<kbd>T</kbd> DEINE TALISMANE ${r.items.length}/${r.perks.slots}`, () => this.openOwned()),
      btn('<kbd>ESC</kbd> ZURÜCK', () => this.closePanel()),
    );
    bar.replaceChildren(title, hint, btns);
  }

  private hideShop(): void {
    $('shopbar').classList.add('hidden');
    renderShopTip(this.run, undefined);
    this.world.hoverShowcase = undefined;
  }

  private frameVitrine(presses: string[]): void {
    this.world.movePlayer(0, new THREE.Vector2(), false);
    for (const k of presses) {
      if (k === 'Escape' || k === 'KeyE') {
        this.closePanel();
        return;
      }
      if (k === 'KeyR') this.rerollShop();
      if (k === 'KeyT') {
        this.openOwned();
        return;
      }
    }
    const i = this.mouse.x >= 0 ? this.world.pickShowcase(this.mouse.x, this.mouse.y) : undefined;
    if (i !== this.world.hoverShowcase && i !== undefined) sfx.select();
    this.world.hoverShowcase = i;
    // The card sits still above the piece instead of chasing the pointer.
    const at = i === undefined ? undefined : this.world.showcaseAnchor(i);
    renderShopTip(this.run, at ? i : undefined, at?.x, at?.y);
  }

  private clickShop(): void {
    const i = this.world.hoverShowcase;
    if (i === undefined) return;
    const it = this.run.shop[i];
    if (!it || it.sold) return;
    if (!this.run.canBuy(i)) {
      sfx.error();
      return;
    }
    if (it.kind !== 'item') {
      renderShopTip(this.run, undefined);
      this.useUpgrade(i);
      return;
    }
    const gold = !!it.fuse;
    if (this.run.buy(i)) {
      sfx.cash();
      toast(gold ? `${ITEMS[it.def].name.toUpperCase()} IST JETZT GOLDEN.` : `${ITEMS[it.def].name.toUpperCase()} STEHT JETZT AUF DEINEM TISCH.`);
      this.world.hoverShowcase = undefined;
      this.afterShop();
    }
  }

  private rerollShop(): void {
    if (!this.run.reroll()) {
      sfx.error();
      return;
    }
    sfx.select();
    this.world.distort(0.3);
    this.afterShop();
  }

  private openOwned(): void {
    renderShopTip(this.run, undefined);
    const back = () => {
      closeModal();
      this.renderShopBar();
    };
    openModal(ownedView(this.run, {
      sell: (uid) => {
        if (this.run.sellItem(uid)) {
          sfx.cash();
          this.syncWorld();
          this.openOwned();
        }
      },
      move: (uid, dir) => {
        if (this.run.moveItem(uid, dir)) {
          sfx.select();
          this.syncWorld();
          this.openOwned();
        }
      },
      close: back,
    }), 'vcr', back);
  }

  private afterShop(): void {
    this.syncWorld();
    this.checkUnlocks();
    if (this.mode === 'vitrine') this.renderShopBar();
  }

  private useUpgrade(i: number): void {
    openModal(wheelView(this.run, () => {
      closeModal();
      this.renderShopBar();
    }, {
      tool: this.run.shop[i].def as PocketToolId,
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
        closeModal();
        this.afterShop();
      },
    }), 'vcr');
  }

  private closePanel(): void {
    closeModal();
    this.hideShop();
    if (this.mode === 'kasse' || this.mode === 'vitrine' || this.mode === 'smokes') this.enterRoom();
  }

  private pay(): void {
    const n = this.run.cycle + 1;
    if (!this.run.pay()) return;
    this.tutorialDone(3);
    sfx.cash();
    this.world.dismissThugs();
    this.rushLeft = undefined;
    this.shownCash = this.run.cash;
    toast(`RATE ${n} BEZAHLT. +◆${this.run.lastPayMarks} GLÜCKSMARKEN. DIE HERREN ZIEHEN AB – VORERST.`);
    if (this.run.rule) setTimeout(() => toast(`NEUE HAUSREGEL: ${RULES[this.run.rule!].name.toUpperCase()} – ${RULES[this.run.rule!].desc}`), 800);
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
    } else if (this.run.draft.length) {
      this.openDraft(this.run.paidRates);
    } else {
      this.renderKasse();
    }
  }

  // ---- The Baron's cards after every rate ----------------------------------------------------

  private openDraft(paid: number): void {
    const line = BARON.afterRate[Math.min(BARON.afterRate.length - 1, paid - 1)];
    sfx.threat();
    const after = () => {
      this.syncWorld();
      this.checkUnlocks();
      if (this.run.freeTool) {
        this.openFreeTool();
        return;
      }
      this.afterDraft();
    };
    openModal(draftView(this.run, line, (i) => {
      const id = this.run.draft[i];
      const msg = this.run.chooseCard(i);
      if (!msg) return;
      sfx.cash();
      if (id) toast(`KARTE: ${msg}`, 'unlock');
      after();
    }, () => {
      this.run.skipDraft();
      sfx.pickup();
      toast('DU LÄSST DIE KARTEN LIEGEN. +◆2.');
      after();
    }), 'clear');
  }


  /** A wheel card: pick the pocket for the free upgrade. */
  private openFreeTool(): void {
    const tool = this.run.freeTool!;
    openModal(wheelView(this.run, () => undefined, {
      tool,
      free: true,
      apply: (pocket, num) => {
        if (!this.run.applyFreeTool(pocket, num)) return;
        sfx.cash();
        this.world.refreshWheel(this.run.wheel, pocket, this.run.visions);
        const p = this.run.wheel[pocket];
        toast(`FACH ${p.number}: ${tool === 'kopie' ? 'SEINE NACHBARN SIND JETZT KOPIEN.' : tool === 'pinsel' ? 'NEUE ZAHL.' : `${(p.lvl ?? 1) > 1 ? `STUFE ${p.lvl}` : 'NEUER EFFEKT'}.`}`);
        setTimeout(() => this.world.refreshWheel(this.run.wheel, undefined, this.run.visions), 2500);
        this.afterDraft();
      },
    }), 'vcr');
  }

  private afterDraft(): void {
    this.syncWorld();
    if (this.run.bossRate) {
      toast(BARON.bossArrives, 'boss');
      setTimeout(() => toast(BARON.bossRule, 'boss'), 1200);
    }
    this.renderKasse();
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
    if (!list.includes(this.chip) || this.chip > this.run.betLimit) {
      const fits = list.filter((v) => v <= this.run.betLimit);
      this.chip = fits.length ? fits[Math.max(0, fits.length - 3)] : list[0];
    }
  }

  private selectChip(v: number): void {
    if (v > this.run.betLimit) return;
    this.chip = v;
    sfx.select();
    this.renderTable();
  }

  /** Special chip picked from the case, waiting to be laid on a field. */
  private special?: number;

  private placeChip(): void {
    if (!this.hover) return;
    if (this.special !== undefined) {
      const uid = this.special;
      if (!this.run.placeSpecial(uid, this.hover)) {
        sfx.error();
        toast('SPEZIALJETONS KOMMEN AUF EIN FELD, AUF DEM SCHON EIN EINSATZ LIEGT.');
        return;
      }
      this.special = undefined;
      sfx.chip();
      const c = this.run.chips.find((x) => x.uid === uid)!;
      toast(`${SPECIAL_CHIPS[c.def].name.toUpperCase()} AUF ${FIELD_BY_ID[this.hover].label.toUpperCase()}: ${SPECIAL_CHIPS[c.def].desc}`);
      this.world.setSpecials(this.run.placedSpecials, SPECIAL_CHIPS);
      this.renderTable();
      return;
    }
    if (!this.run.placeBet(this.hover, this.chip)) {
      sfx.error();
      if (this.chip <= this.run.cash) {
        const room = this.run.fieldRoom(this.hover);
        toast(room > 0
          ? `HIER PASSEN NUR NOCH ${fmt(room)} HIN – NIMM EINEN KLEINEREN JETON.`
          : this.run.betLimit === 0
            ? `TISCHLIMIT ERREICHT: HÖCHSTENS ${fmt(this.run.tableMax)} PRO DREH.`
            : `DIESES FELD IST VOLL: HÖCHSTENS ${fmt(this.run.fieldMax(this.hover))}.`);
      }
      return;
    }
    this.world.placeChip(this.hover, this.chip);
    this.tutorialDone(1);
    sfx.chip();
    this.confirmEmpty = false;
    this.shownCash = this.run.cash;
    if (this.chip > this.run.betLimit) this.clampChip();
    this.renderTable();
  }

  private takeChip(): void {
    if (!this.hover) return;
    if (this.special !== undefined) {
      this.special = undefined;
      this.renderTable();
      return;
    }
    if (!this.run.removeBet(this.hover)) return;
    this.world.pickChip(this.hover);
    this.world.setSpecials(this.run.placedSpecials, SPECIAL_CHIPS);
    sfx.pickup();
    this.shownCash = this.run.cash;
    this.renderTable();
  }

  /** Picks a special chip from the case, or takes it back off the felt. */
  private pickSpecial(uid: number): void {
    if (this.run.placed[uid]) {
      this.run.removeSpecial(uid);
      this.special = undefined;
      sfx.pickup();
      this.world.setSpecials(this.run.placedSpecials, SPECIAL_CHIPS);
    } else if (this.special === uid) {
      this.special = undefined;
    } else {
      this.special = uid;
      sfx.select();
      const c = this.run.chips.find((x) => x.uid === uid)!;
      toast(`${SPECIAL_CHIPS[c.def].name.toUpperCase()}: KLICK AUF EIN FELD MIT EINSATZ.`);
    }
    this.renderTable();
  }

  private toggleMagnet(): void {
    if (!this.run.toggleMagnet()) {
      sfx.error();
      toast('DER MAGNET ZIEHT NUR AN PLEINS – SETZ ERST AUF EINE ZAHL.');
      return;
    }
    if (this.run.cheatMagnet) {
      sfx.threat();
      toast(`MAGNET UNTERM TISCH: DEINE PLEINS ZIEHEN DOPPELT. VERDACHT +${Math.round(14 * this.run.magnetCost)}.`, 'boss');
    } else sfx.pickup();
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

  /** Seconds until the croupier takes the next spin: time to place bets, and no rapid-fire spinning. */
  private betWait = 0;

  private spin(force = false): void {
    if (this.mode !== 'table' || this.run.phase !== 'betting') return;
    if (this.betWait > 0 && !force) {
      toast('EINEN MOMENT – DER CROUPIER NIMMT NOCH EINSÄTZE AN.');
      return;
    }
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
    this.streakBefore = this.run.stats.winStreak;
    this.tutorialDone(2);
    const r = this.run.spin();
    this.special = undefined;
    this.nudgeState = r.stake > 0 && !r.hop ? 'ready' : 'off';
    this.nudged = false;
    if (this.run.caught) {
      sfx.caught();
      this.world.distort(1.5);
      this.world.shake(1);
      this.world.clearChips();
      toast('DER SAALCHEF HAT DICH ERWISCHT! DEINE EINSÄTZE SIND WEG, DIE RATE STEIGT UM 25 %.', 'boss');
      this.nudgeState = 'off';
    } else if (bribed && !this.run.bribePaid) {
      toast('FÜR DIE BESTECHUNG FEHLT DIR DAS GELD. DER CROUPIER WIRFT GANZ NORMAL.');
    } else if (bribed) {
      this.world.croupierNod();
    }
    if (r.second) {
      floater('ZWEI KUGELN!', window.innerWidth / 2, window.innerHeight * 0.3, '#ffd24a', 52);
      sfx.coin();
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
    this.world.wheel.spin(r.hop ? r.hop.from : r.pocket.index, 6.5, r.hop?.to, r.second?.pocket.index);
    sfx.spin();
    // A lot riding on this one: heartbeat and slow motion at the end.
    const riding = r.stake + this.run.riskStake;
    this.tension = this.run.highRisk || !!this.run.duel || riding >= 0.4 * (this.run.cash + riding) || riding >= this.run.debt * 0.5;
    this.heartT = 0;
    sfx.duckMusic(this.tension ? 0.9 : 0.5);
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
      const text = this.nudged ? `ANGESTOSSEN! SIE ROLLT AUF ${lucky.number}!` : good ? `GLÜCK! SIE HÜPFT AUF ${lucky.number}!` : `PECH! SIE HÜPFT AUF ${lucky.number}!`;
      floater(text, s2.x, s2.y - 70, good ? 'var(--luck)' : 'var(--rec)', 38);
    }, 450);
  }

  private onLanded(): void {
    const r = this.run.lastResult!;
    this.run.settle();
    sfx.land();
    sfx.roll(0);
    this.nudgeState = 'off';
    $('qte').classList.add('hidden');
    this.world.refreshWheel(this.run.wheel, r.pocket.index);
    this.world.setDolly(r.pocket.number);
    const col = (c: string) => (c === 'red' ? '#ff5a64' : c === 'black' ? '#eee' : '#4fe08a');
    const s = this.world.project(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()));
    floater(`${r.pocket.number}`, s.x, s.y - 40, col(r.pocket.color), 72);
    if (r.second) {
      const s2 = this.world.project(this.world.wheel.ball2.getWorldPosition(new THREE.Vector3()));
      floater(`${r.second.pocket.number}`, s2.x, s2.y - 40, col(r.second.pocket.color), 64);
      if (r.doubleHit) setTimeout(() => floater('DOPPELTREFFER! ×1,5', window.innerWidth / 2, window.innerHeight * 0.3, '#ffd24a', 56), 400);
    }
    // A flash in the winning pocket, and a spray of sparks when it pays.
    const pays = r.anyWin || !!r.second?.anyWin;
    if (pays) {
      this.world.burst(this.world.wheel.ball.getWorldPosition(new THREE.Vector3()), 0xffe08a, 24, 0.012);
      this.world.shake(0.25);
    }
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
    // The second ball scores on its own, after a short beat.
    const s2 = r.second;
    if (s2) {
      q(pace + 0.5, () => {
        floater(`ZWEITE KUGEL: ${s2.pocket.number}`, window.innerWidth / 2, window.innerHeight * 0.34, '#ffd24a', 42);
        this.world.pulseFields = new Set(s2.bets.filter((b) => b.won).map((b) => b.fieldId));
        this.score = { sum: 0, mult: 1, lines: [] };
        sum = 0;
        mult = 1;
        renderScore(this.score);
      });
      let j = 0;
      for (const l of s2.lines) {
        const idx = j++;
        q(pace, () => this.scoreLine(l, idx, (v) => (sum = v), () => sum, (v) => (mult = v), () => mult));
      }
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

  private finishScoring(r0: SpinResult): void {
    const total = Run.totalPayout(r0);
    const r = { ...r0, payout: total };
    const net = total - r.stake;
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
    // Beating the best single win ever, once per run.
    if (net > 0 && this.profile.bestWin > 0 && net > this.profile.bestWin && !this.recordShown) {
      this.recordShown = true;
      setTimeout(() => {
        sfx.win(true);
        toast(`NEUER REKORD! ${fmt(net)} – DEIN BISHER GRÖSSTER GEWINN WAR ${fmt(this.profile.bestWin)}.`, 'unlock');
      }, 900);
    }
    const streak = this.run.stats.winStreak;
    if (r.stake > 0 && net > 0 && streak >= 2) {
      setTimeout(() => {
        sfx.mult(streak + 2);
        floater(`SERIE ${streak}! NÄCHSTER GEWINN +${fmtMult(streakBonus(streak))} MULT`, window.innerWidth / 2, window.innerHeight * 0.34, '#ffb040', 40);
      }, 500);
    } else if (r.stake > 0 && net <= 0 && this.streakBefore >= 2) {
      setTimeout(() => toast(`SERIE GERISSEN NACH ${this.streakBefore} GEWINNEN.`), 500);
    }
    if (r.stake > 0 && r.payout === 0 && !r.nearMiss.length) {
      const colour = r.pocket.color === 'red' ? 'ROT' : r.pocket.color === 'black' ? 'SCHWARZ' : 'GRÜN';
      setTimeout(() => toast(`${r.pocket.number} ${colour} – KEINE DEINER WETTEN LAG DARAUF.`), 300);
    }
    if (r.nearMiss.length) {
      floater(`KNAPP! DIE ${r.nearMiss[0]} LAG DIREKT DANEBEN.`, window.innerWidth / 2, window.innerHeight * 0.42, '#ffb0a0', 34);
    }
    if (this.run.lastInterest > 0) setTimeout(() => toast(`ZINSEN AUF DEINE EINZAHLUNG: +${fmt(this.run.lastInterest)}`), 400);
    this.shownCash = this.run.cash;
  }

  private tension = false;
  private heartT = 0;
  private streakBefore = 0;
  private recordShown = false;

  private endSpin(): void {
    this.tension = false;
    sfx.duckMusic(0);
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
      const baron = d.name === 'Der Baron';
      if (d.outcome === 'won') toast(baron ? `DU SCHLÄGST DEN BARON (${fmt(d.playerNet ?? 0)} ZU ${fmt(d.rivalNet ?? 0)}): DIE RATE SINKT UM 10 % AUF ${fmt(this.run.debt)}.` : `DUELL GEWONNEN GEGEN ${d.name.toUpperCase()} (${fmt(d.playerNet ?? 0)} ZU ${fmt(d.rivalNet ?? 0)}): +◆3 UND ${fmt(d.stake)}.`, 'unlock');
      else if (d.outcome === 'lost') toast(baron ? `DER BARON GEWINNT DIESEN DREH (${fmt(d.rivalNet ?? 0)} ZU ${fmt(d.playerNet ?? 0)}).` : `DUELL VERLOREN GEGEN ${d.name.toUpperCase()} (${fmt(d.playerNet ?? 0)} ZU ${fmt(d.rivalNet ?? 0)}): DIE RATE STEIGT UM 15 %.`, 'boss');
      else toast(`DUELL UNENTSCHIEDEN GEGEN ${d.name.toUpperCase()}.`);
    }
    if (this.run.lastBroken.length) toast(`KLIRR – ${this.run.lastBroken.length > 1 ? `${this.run.lastBroken.length} GLASJETONS SIND` : 'DEIN GLASJETON IST'} ZERBROCHEN.`);
    if (this.run.suspicion >= 100) toast('DER SAALCHEF KOMMT AUF DICH ZU … BEIM NÄCHSTEN DREH IST ES SO WEIT.', 'boss');
    else if (this.run.suspicion >= 70) toast(`VERDACHT ${this.run.suspicion}/100 – DER SAALCHEF BEOBACHTET DICH.`, 'boss');
    // The bonus wheel first, then the ladder, then back into the room.
    if (this.run.bonusPending > 0 && this.run.phase !== 'shark') {
      this.openBonus(() => this.afterSpinChoices());
      return;
    }
    this.afterSpinChoices();
  }

  /** After a win with spins left: let it ride, or take the money. */
  private afterSpinChoices(): void {
    if (this.run.canRide) {
      sfx.threat();
      this.modalEscape = () => this.cashOut();
      openModal(rideView(this.run, () => this.ride(), () => this.cashOut()), 'clear');
      return;
    }
    if (this.run.rideStep > 0 && !this.run.riding && this.run.rideFrom === undefined && this.run.phase === 'betting' && this.run.lastResult && Run.totalPayout(this.run.lastResult) > this.run.lastResult.stake) {
      toast('OBEN AUF DER LEITER: DAS GELD GEHÖRT DIR.', 'unlock');
      this.run.cashOut();
    }
    this.leaveAfterSpin();
  }

  private modalEscape?: () => void;

  private ride(): void {
    this.modalEscape = undefined;
    closeModal();
    if (!this.run.letItRide()) {
      this.leaveAfterSpin();
      return;
    }
    sfx.chip();
    this.world.syncChips(this.run.bets);
    this.syncWorld();
    toast(`LIEGEN LASSEN – STUFE ${this.run.rideStep}/3: +${String(this.run.rideStep * this.run.ridePerStep).replace('.', ',')} MULT. <kbd>LEER</kbd> DREHT.`, 'boss');
    // Straight back to the wheel: no walking between the steps of the ladder.
    this.mode = 'room';
    this.enterTable();
    this.betWait = 0.8;
  }

  private cashOut(): void {
    this.modalEscape = undefined;
    closeModal();
    this.run.cashOut();
    sfx.cash();
    this.leaveAfterSpin();
  }

  // ---- Bonus wheel ---------------------------------------------------------------------

  private openBonus(done: () => void): void {
    sfx.win(true);
    const n = this.run.bonusPending;
    const view = bonusWheelView(n, () => this.run.spinBonus(), () => sfx.tick(0.6), (seg, text) => {
      if (seg.id === 'niete') sfx.lose();
      else {
        sfx.win(seg.id.startsWith('x'));
        if (seg.id === 'x10') {
          bigWin('JACKPOT!', text);
          this.world.coinShower(60);
        }
      }
      this.shownCash = this.run.cash;
      this.osdDirty = true;
      this.syncWorld();
    }, () => {
      this.bonusSpin = undefined;
      closeModal();
      this.checkUnlocks();
      done();
    });
    this.bonusSpin = (view as HTMLElement & { spin?: () => void }).spin;
    openModal(view, 'clear');
    floater('BONUSRAD!', window.innerWidth / 2, window.innerHeight * 0.2, '#ffd24a', 60);
  }

  private bonusSpin?: () => void;

  /** Back into the room after a spin (or to the loan shark, or to the collectors). */
  private leaveAfterSpin(): void {
    const next = this.run.duel;
    if (next && !this.run.lastDuel && next.name !== 'Der Baron') setTimeout(() => toast(`EIN STAMMGAST SETZT SICH AN DEN TISCH: ${next.name.toUpperCase()} WILL EIN DUELL.`, 'boss'), 900);
    if (this.run.doubleNext && this.run.phase === 'betting') setTimeout(() => toast('DER CROUPIER LEGT EINE ZWEITE KUGEL BEREIT: NÄCHSTER DREH MIT ZWEI KUGELN!', 'unlock'), 1500);
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
      special: (uid) => this.pickSpecial(uid),
      magnet: () => this.toggleMagnet(),
    }, this.mode === 'spinning', this.special);
    renderSlip(this.run, this.mode === 'table');
    this.osdDirty = true;
  }

  private renderOsdNow(): void {
    renderOsd(this.run, Math.round(this.shownCashValue), this.tape, this.mode === 'room');
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

    if (presses.includes('KeyF')) void this.toggleFs();
    if (presses.includes('KeyM')) {
      sfx.muted = !sfx.muted;
      toast(sfx.muted ? 'TON AUS' : 'TON AN');
    }

    if (!modalOpen()) this.overview = false;
    if (modalOpen()) {
      for (const k of presses) navModal(k);
      if (this.bonusSpin && (presses.includes('Space') || presses.includes('Enter'))) {
        this.bonusSpin();
      } else if (this.modalEscape && presses.includes('Escape')) {
        this.modalEscape();
      } else if (presses.some((k) => k === 'Digit1' || k === 'Digit2' || k === 'Digit3') && document.querySelector('#modal .card')) {
        const k = presses.find((x) => x.startsWith('Digit'))!;
        document.querySelectorAll<HTMLButtonElement>('#modal .card')[Number(k.slice(5)) - 1]?.click();
      } else if (this.paused && performance.now() - this.pausedAt < 300) {
        // Same Esc that opened the pause (mouse release and key press can both arrive).
      } else if (this.overview && (presses.includes('Escape') || presses.includes('Tab'))) this.toggleOverview();
      else if (this.paused && (presses.includes('Escape') || presses.includes('KeyP'))) this.closePause();
      else if (presses.includes('Escape')) {
        if (this.mode === 'vitrine') {
          closeModal();
          this.renderShopBar();
        } else if (this.mode === 'kasse' || this.mode === 'smokes') this.closePanel();
        else if (this.mode === 'room' || this.mode === 'table') closeModal();
        else if (this.mode === 'start') this.showStart();
      }
      if (this.mode !== 'start') this.world.movePlayer(dt, new THREE.Vector2(), false);
    } else {
      switch (this.mode) {
        case 'room':
          if (presses.includes('Escape') || presses.includes('KeyP')) this.openPause();
          else this.frameRoom(dt, presses);
          break;
        case 'table': this.frameTable(dt, presses); break;
        case 'vitrine': this.frameVitrine(presses); break;
        case 'spinning': this.frameSpinning(dt, presses); break;
        case 'caught': this.frameCaught(dt); break;
        default: break;
      }
    }

    $('crosshair').classList.toggle('hidden', !(this.mode === 'room' && !modalOpen()));
    renderGoal(this.run, this.mode === 'room' && !modalOpen());
    if (Math.floor(this.tape * 2) !== this.hintTick) {
      this.hintTick = Math.floor(this.tape * 2);
      this.showHint();
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

    let speed = this.mode === 'spinning' && this.input.isDown('Space') ? 2 : 1;
    if (this.tension && this.mode === 'spinning' && this.spinStage === 'rolling') {
      const k = this.world.wheel.progress;
      if (k > 0.55) {
        this.heartT -= dt;
        if (this.heartT <= 0) {
          sfx.heartbeat();
          this.heartT = 0.95 - k * 0.45;
        }
      }
      // The last turns in slow motion, speed-up ignored.
      if (k > 0.82) speed = 0.55;
    }
    const ev = this.world.wheel.update(dt, speed);
    if (ev === 'landed') this.onFirstLanding();
    if (ev === 'done' && this.mode === 'spinning' && this.spinStage === 'rolling') this.onLanded();
    this.world.update(dt);
  }

  private frameRoom(dt: number, presses: string[]): void {
    const a = this.input.axis();
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    // Arrow keys turn the view (for players without a mouse, or without pointer capture).
    const turn = (this.input.isDown('ArrowLeft') ? 1 : 0) - (this.input.isDown('ArrowRight') ? 1 : 0);
    if (turn) this.world.look(-turn * dt * 900, 0);
    this.world.movePlayer(dt, new THREE.Vector2(a.x, a.y), sprint);

    const spot = this.world.focus();
    $('crosshair').classList.toggle('on', !!spot);
    const due = this.run.phase === 'due';
    switch (spot) {
      case 'kasse': setPrompt(`<kbd>E</kbd> KASSE${due ? ' – RATE BEZAHLEN' : ''}`); break;
      case 'vitrine': setPrompt('<kbd>E</kbd> VITRINE'); break;
      case 'smokes': setPrompt('<kbd>E</kbd> ZIGARETTENAUTOMAT'); break;
      case 'table': setPrompt(due ? 'DIE RATE IST FÄLLIG – ERST ZUR KASSE!' : '<kbd>E</kbd> AN DEN TISCH'); break;
      default: setPrompt();
    }
    if (presses.includes('KeyE')) {
      if (spot === 'kasse') this.openKasse();
      else if (spot === 'vitrine') this.openVitrine();
      else if (spot === 'smokes') this.openSmokes();
      else if (spot === 'table') this.enterTable();
    }
    if (presses.includes('KeyV')) this.showWheel();
    if (presses.includes('Tab')) this.toggleOverview();
    this.hoverItems();
  }

  private hoverItems(): void {
    // In the room you look with the crosshair; at the table you point with the mouse.
    const fp = this.mode === 'room';
    const x = fp ? window.innerWidth / 2 : this.mouse.x;
    const y = fp ? window.innerHeight / 2 : this.mouse.y;
    const uid = x >= 0 ? this.world.pickItem(x, y) : undefined;
    renderItemTip(this.run, uid, x, y);
  }

  private frameTable(dt: number, presses: string[]): void {
    if (this.betWait > 0) this.betWait -= dt;
    this.world.movePlayer(dt, new THREE.Vector2(), false);
    const list = availableChips(this.run.moneyBefore);
    for (const k of presses) {
      if (k.startsWith('Digit') && Number(k.slice(5)) <= 6) {
        const v = list[Number(k.slice(5)) - 1];
        if (v) this.selectChip(v);
      }
      if (k === 'Digit7' || k === 'Digit8' || k === 'Digit9') this.useSmoke(Number(k.slice(5)) - 7);
      if (k === 'KeyB') this.bribe();
      if (k === 'KeyG') this.toggleMagnet();
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
    this.world.setGhost(field && this.chip <= this.run.fieldRoom(field) ? this.chip : undefined, field);
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

  /** Nudging the ball: a timing bar while it drops into the pockets. */
  private nudgeState: 'off' | 'ready' | 'done' = 'off';
  private nudged = false;

  private frameNudge(presses: string[]): void {
    const qte = $('qte');
    const p = this.world.wheel.progress;
    const from = 0.6, to = 0.86;
    if (this.nudgeState !== 'ready' || p < from || p > to) {
      qte.classList.add('hidden');
      if (this.nudgeState === 'ready' && p > to) this.nudgeState = 'done';
      return;
    }
    const pos = (p - from) / (to - from);
    const zone = this.run.nudgeZone;
    qte.classList.remove('hidden');
    qte.style.setProperty('--pos', `${pos * 100}%`);
    qte.style.setProperty('--zone', `${zone * 100}%`);
    qte.style.setProperty('--center', '70%');
    if (!presses.includes('KeyN')) return;
    this.nudgeState = 'done';
    qte.classList.add('hidden');
    const res = this.run.nudge(Math.abs(pos - 0.7));
    if (res.ok && res.to !== undefined) {
      this.nudged = true;
      this.world.wheel.queueHop(res.to);
      sfx.knock(1);
      floater('ANGESTOSSEN!', window.innerWidth / 2, window.innerHeight * 0.3, 'var(--luck)', 44);
    } else if (res.ok) {
      floater('SAUBER – ABER SIE LIEGT SCHON GUT.', window.innerWidth / 2, window.innerHeight * 0.3, '#ddd', 34);
    } else {
      sfx.error();
      floater('DANEBEN! DER CROUPIER SCHAUT RÜBER.', window.innerWidth / 2, window.innerHeight * 0.3, 'var(--rec)', 40);
    }
    this.osdDirty = true;
  }

  private frameSpinning(dt: number, presses: string[]): void {
    this.world.movePlayer(dt, new THREE.Vector2(), false);
    if (this.spinStage === 'rolling') {
      this.frameNudge(presses);
      sfx.roll(this.world.wheel.roll);
    }
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
      openModal(gameOverView(this.run, this.profile, () => {
        closeModal();
        this.world.distort(1.5);
        sfx.rewind();
        this.newRun(this.profile.lastKit, this.profile.lastStage, this.profile.lastBall);
      }, () => this.rewind()), 'black');
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
