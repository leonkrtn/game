import * as THREE from 'three';
import { BOSSES, CHIPS, TALISMANS } from './game/content';
import { Run, RUSH_SECONDS } from './game/run';
import type { SpinResult } from './game/scoring';
import { sfx } from './audio';
import { Input } from './input';
import { $, fmt } from './ui/dom';
import { chipPickerView, gameOverView, kasseView, startView, victoryView, wheelView } from './ui/screens';
import {
  closeModal, floater, hideResult, modalOpen, openModal, renderFieldInfo, renderTableBar, renderTalismans,
  renderTopbar, setBanner, setHelp, setPrompt, showResult, toast,
} from './ui/ui';
import { COIN_SPOTS } from './world/layout';
import { World } from './world/world';

type Mode = 'start' | 'room' | 'table' | 'spinning' | 'kasse' | 'caught' | 'over';

export class Game {
  private world: World;
  private input = new Input();
  private run: Run;
  private mode: Mode = 'start';
  private selected = 0;
  private hover?: string;
  private mouse = { x: -1, y: -1 };
  private rushLeft?: number;
  private confirmEmptySpin = false;
  private spinStage: 'rolling' | 'landed' | 'showing' = 'rolling';
  private stageTimer = 0;
  private cancelResult?: () => void;
  private caughtTimer = 0;
  private last = performance.now();
  /** Largest simulated step per frame; raised by automated tests on slow software renderers. */
  maxDt = 0.05;

  constructor(container: HTMLElement) {
    this.world = new World(container);
    this.run = this.newRun();
    this.world.wheel.onTick = (s) => sfx.tick(s);

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mousedown', (e) => {
      sfx.unlock();
      if (this.mode === 'table') {
        if (e.button === 0) this.placeSelected();
        if (e.button === 2) this.pickUp();
      } else if (this.mode === 'spinning' && this.spinStage === 'showing') {
        this.stageTimer = 0;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (this.mode !== 'table' || !this.run.hand.length) return;
      const n = this.run.hand.length;
      this.select((this.selected + (e.deltaY > 0 ? 1 : -1) + n) % n);
    }, { passive: true });
    window.addEventListener('keydown', () => sfx.unlock(), { once: true });

    openModal(startView(() => {
      sfx.unlock();
      closeModal();
      this.enterRoom();
      toast('Tipp: Geh an den <b>Roulettetisch</b> und drück <kbd>E</kbd>.');
    }));
    this.renderHud();
    this.world.renderer.setAnimationLoop(() => this.frame());
  }

  private newRun(): Run {
    const run = new Run();
    run.coinSpots = COIN_SPOTS;
    run.coins = [];
    this.world.refreshWheel(run.wheel);
    this.world.setCoins(run.coins);
    return run;
  }

  // ---- Mode changes ------------------------------------------------------

  private enterRoom(): void {
    this.mode = 'room';
    this.world.cameraMode = 'room';
    this.world.standAtTable(false);
    this.world.hoverField = undefined;
    this.world.setGhost(undefined, undefined);
    $('tablebar').classList.add('hidden');
    $('fieldinfo').classList.add('hidden');
    $('timer').classList.add('hidden');
    hideResult();
    setHelp('<span><kbd>WASD</kbd> laufen</span><span><kbd>Shift</kbd> rennen</span><span><kbd>E</kbd> benutzen</span><span><kbd>V</kbd> Rad</span><span><kbd>M</kbd> Ton</span>');
    this.renderHud();
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
    hideResult();
    $('tablebar').classList.remove('hidden');
    setHelp('');
    if (this.run.rule === 'eile' && this.rushLeft === undefined) this.rushLeft = RUSH_SECONDS;
    this.renderHud();
  }

  private openKasse(): void {
    this.mode = 'kasse';
    this.world.cameraMode = 'kasse';
    this.world.standAtKasse();
    setPrompt();
    hideResult();
    this.renderKasse();
  }

  private renderKasse(): void {
    openModal(kasseView(this.run, {
      pay: () => this.pay(),
      surrender: () => {
        this.run.surrender();
        closeModal();
        this.startCaught();
      },
      buy: (i) => {
        const item = this.run.shop[i];
        if (this.run.buy(i)) {
          sfx.cash();
          toast(item.kind === 'chip' ? `<b>${CHIPS[item.def].name}</b> liegt jetzt in deinem Beutel.` : `<b>${TALISMANS[item.def].name}</b> gehört jetzt dir.`);
          this.afterPurchase();
        }
      },
      target: (i) => this.targetItem(i),
      reroll: () => {
        if (this.run.reroll()) {
          sfx.select();
          this.afterPurchase();
        }
      },
      sell: (uid) => {
        if (this.run.sellTalisman(uid)) {
          sfx.cash();
          this.afterPurchase();
        }
      },
      close: () => this.closeKasse(),
    }), () => this.closeKasse());
  }

  private afterPurchase(): void {
    this.renderHud();
    if (this.run.phase === 'gameover') {
      closeModal();
      this.startCaught();
    } else {
      this.renderKasse();
    }
  }

  private targetItem(i: number): void {
    const item = this.run.shop[i];
    if (item.kind === 'service') {
      openModal(chipPickerView(this.run, () => this.renderKasse(), (uid) => {
        const name = CHIPS[this.run.bag.find((c) => c.uid === uid)!.def].name;
        if (this.run.applyItem(i, uid)) {
          sfx.cash();
          toast(`${name} entfernt.`);
        }
        this.afterPurchase();
      }));
      return;
    }
    openModal(wheelView(this.run, () => this.renderKasse(), {
      index: i,
      apply: (pocket, num) => {
        const before = this.run.wheel[pocket].number;
        if (this.run.applyItem(i, pocket, num)) {
          sfx.cash();
          this.world.refreshWheel(this.run.wheel, pocket);
          const p = this.run.wheel[pocket];
          toast(num !== undefined ? `Fach <b>${before}</b> ist jetzt die <b>${p.number}</b>.` : `Fach <b>${p.number}</b> wurde umgebaut.`);
          setTimeout(() => this.world.refreshWheel(this.run.wheel), 2500);
        }
        this.afterPurchase();
      },
    }));
  }

  private closeKasse(): void {
    closeModal();
    if (this.mode === 'kasse') this.enterRoom();
  }

  private pay(): void {
    const next = this.run.cycle + 1;
    if (!this.run.pay()) return;
    sfx.cash();
    this.world.dismissThugs();
    setBanner();
    this.world.setCoins(this.run.coins);
    this.rushLeft = undefined;
    const interest = this.run.lastInterest ? ` Sparschwein-Zinsen: +${fmt(this.run.lastInterest)}.` : '';
    toast(`Rate ${next} bezahlt. Die Herren ziehen ab – vorerst.${interest}`);
    if (this.run.rule) {
      const b = BOSSES[this.run.rule];
      setTimeout(() => toast(`Neue Hausregel: <b>${b.name}</b> – ${b.desc}`), 700);
    }
    this.renderHud();
    if (this.run.phase === 'victory') {
      closeModal();
      openModal(victoryView(this.run, () => {
        this.run.continueEndless();
        closeModal();
        this.enterRoom();
      }, () => location.reload()));
      sfx.win(true);
    } else {
      this.renderKasse();
    }
  }

  private startCaught(): void {
    this.mode = 'caught';
    this.caughtTimer = 3.2;
    $('tablebar').classList.add('hidden');
    hideResult();
    setBanner();
    setPrompt();
    this.world.standAtTable(false);
    this.world.thugsAttack();
    this.world.cameraMode = 'caught';
    sfx.caught();
  }

  // ---- Table actions -------------------------------------------------------

  private select(i: number): void {
    if (i < 0 || i >= this.run.hand.length) return;
    this.selected = i;
    sfx.select();
    this.renderTable();
  }

  private placeSelected(): void {
    const chip = this.run.hand[this.selected];
    if (!this.hover || !chip) return;
    if (!this.run.place(chip.uid, this.hover)) return;
    this.world.placeChip(chip.uid, chip.def, this.hover);
    sfx.chip();
    this.confirmEmptySpin = false;
    this.selected = Math.min(this.selected, Math.max(0, this.run.hand.length - 1));
    this.renderTable();
  }

  private pickUp(): void {
    if (!this.hover) return;
    if (!this.run.pickUp(this.hover)) return;
    this.world.pickChip(this.hover);
    sfx.pickup();
    this.renderTable();
  }

  private redraw(): void {
    if (this.run.redraw()) {
      sfx.select();
      this.selected = 0;
      this.renderTable();
    }
  }

  private spin(force = false): void {
    if (this.mode !== 'table' || this.run.phase !== 'betting') return;
    if (this.run.placedCount === 0 && !force && !this.confirmEmptySpin) {
      this.confirmEmptySpin = true;
      toast('Noch nichts gesetzt. <kbd>Leertaste</kbd> nochmal = trotzdem drehen.');
      return;
    }
    this.confirmEmptySpin = false;
    this.rushLeft = undefined;
    $('timer').classList.add('hidden');
    hideResult();
    const r = this.run.spin();
    this.mode = 'spinning';
    this.spinStage = 'rolling';
    this.world.cameraMode = 'wheel';
    this.world.hoverField = undefined;
    this.world.setGhost(undefined, undefined);
    $('fieldinfo').classList.add('hidden');
    this.world.refreshWheel(this.run.wheel);
    this.world.wheel.spin(r.pocket.index, 6.5);
    sfx.spin();
    floater('Rien ne va plus!', window.innerWidth / 2, window.innerHeight * 0.25, 'var(--gold)', 34);
    this.renderTable();
  }

  private onLanded(): void {
    const r = this.run.lastResult!;
    this.run.settle();
    sfx.land();
    this.world.refreshWheel(this.run.wheel, r.pocket.index);
    this.spinStage = 'landed';
    this.stageTimer = 1.1;
    const p = this.world.wheel.ball.getWorldPosition(new THREE.Vector3());
    const s = this.world.project(p);
    floater(`${r.pocket.number}`, s.x, s.y - 40, r.pocket.color === 'red' ? '#ff5a64' : r.pocket.color === 'black' ? '#ddd' : '#4fe08a', 46);
  }

  private showSpinResult(r: SpinResult): void {
    this.world.cameraMode = 'table';
    this.world.resolveChips(r.chips, r.broken);
    const winFields = new Set(r.chips.filter((c) => c.won).map((c) => c.fieldId));
    this.world.pulseFields = winFields;
    for (const fid of winFields) {
      const sum = r.chips.filter((c) => c.won && c.fieldId === fid).reduce((a, c) => a + c.score, 0);
      setTimeout(() => {
        const s = this.world.project(this.world.fieldTopWorld(fid));
        floater(`+${fmt(sum)}`, s.x, s.y, 'var(--sum)');
      }, 250);
    }
    const flashed = new Set<number>();
    this.cancelResult = showResult(r, (l, i) => {
      sfx.line(i);
      if (l.talisman !== undefined) {
        flashed.add(l.talisman);
        renderTalismans(this.run, new Set([l.talisman]));
      }
    });
    const total = r.score + r.money;
    if (total > 0) sfx.win(total >= this.run.debt * 0.5);
    else sfx.lose();
    this.spinStage = 'showing';
    this.stageTimer = 2.2 + r.lines.length * 0.17;
    this.renderHud();
  }

  private finishSpin(): void {
    this.world.clearChips();
    this.world.pulseFields = new Set();
    this.world.refreshWheel(this.run.wheel);
    this.world.setCoins(this.run.coins);
    this.selected = 0;
    if (this.run.phase === 'gameover') {
      this.startCaught();
      return;
    }
    this.mode = 'table';
    this.world.cameraMode = 'table';
    if (this.run.phase === 'due') {
      this.world.summonThugs();
      sfx.threat();
      this.enterRoom();
      this.updateDueBanner();
    } else if (this.run.rule === 'eile') {
      this.rushLeft = RUSH_SECONDS;
    }
    this.renderHud();
  }

  private updateDueBanner(): void {
    if (this.run.phase !== 'due') {
      setBanner();
      return;
    }
    const short = this.run.debt - this.run.money;
    setBanner(short <= 0
      ? `<h3>Die Geldeintreiber sind da.</h3>Geh zur <b>Kasse</b> und bezahle <b>${fmt(this.run.debt)}</b>.`
      : `<h3>Dir fehlen ${fmt(short)}!</h3>Verkaufe Talismane an der <b>Kasse</b>, sonst wird es ungemütlich.`);
  }

  // ---- Rendering -------------------------------------------------------------

  private renderHud(): void {
    renderTopbar(this.run);
    renderTalismans(this.run);
    this.updateDueBanner();
    if (this.mode === 'table' || this.mode === 'spinning') this.renderTable();
  }

  private renderTable(): void {
    renderTableBar(this.run, this.selected, {
      select: (i) => this.select(i),
      spin: () => this.spin(),
      redraw: () => this.redraw(),
      leave: () => this.enterRoom(),
      wheel: () => this.showWheel(),
    }, this.mode === 'spinning');
    renderTopbar(this.run);
  }

  private showWheel(): void {
    openModal(wheelView(this.run, () => closeModal()), () => closeModal());
  }

  // ---- Frame -----------------------------------------------------------------

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
      if (presses.includes('Escape')) {
        if (this.mode === 'kasse') this.closeKasse();
        else if (this.mode !== 'start' && this.mode !== 'caught' && this.mode !== 'over' && this.run.phase !== 'victory') closeModal();
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

    const speed = this.mode === 'spinning' && this.input.isDown('Space') ? 3.5 : 1;
    if (this.world.wheel.update(dt, speed)) this.onLanded();
    this.world.update(dt);
  }

  private frameRoom(dt: number, presses: string[]): void {
    const a = this.input.axis();
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    this.world.movePlayer(dt, new THREE.Vector2(a.x, a.y), sprint);

    for (const id of this.world.coinsNearPlayer()) {
      const mult = this.run.collectCoin(id);
      const at = this.world.collectCoinFx(id);
      if (at) {
        const s = this.world.project(at);
        floater(`+${mult} Mult`, s.x, s.y, 'var(--mult)', 26);
      }
      sfx.coin();
      renderTopbar(this.run);
    }

    const nearTable = this.world.nearTable();
    const nearKasse = this.world.nearKasse();
    if (nearKasse) setPrompt('<kbd>E</kbd> Zur Kasse');
    else if (nearTable) setPrompt(this.run.phase === 'betting' ? '<kbd>E</kbd> An den Tisch treten' : 'Die Rate ist fällig – erst zur Kasse!');
    else setPrompt();

    if (presses.includes('KeyE')) {
      if (nearKasse) this.openKasse();
      else if (nearTable) this.enterTable();
    }
    if (presses.includes('KeyV')) this.showWheel();
  }

  private frameTable(dt: number, presses: string[]): void {
    this.world.movePlayer(dt, new THREE.Vector2(), false);
    for (const k of presses) {
      if (k.startsWith('Digit')) this.select(Number(k.slice(5)) - 1);
      if (k === 'KeyR') this.redraw();
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
      this.world.hoverField = field;
    }
    const chip = this.run.hand[this.selected];
    this.world.setGhost(chip?.def, field);
    renderFieldInfo(this.run, field, this.mouse.x, this.mouse.y - 12);

    if (this.rushLeft !== undefined) {
      this.rushLeft -= dt;
      const t = $('timer');
      t.classList.remove('hidden');
      t.textContent = `⏱ ${Math.max(0, Math.ceil(this.rushLeft))}`;
      if (this.rushLeft <= 0) {
        toast('<b>Rien ne va plus!</b> Der Croupier dreht.');
        this.spin(true);
      }
    }
  }

  private frameSpinning(dt: number, presses: string[]): void {
    this.world.movePlayer(dt, new THREE.Vector2(), false);
    if (this.spinStage === 'rolling') return;
    const skip = presses.includes('Space') || presses.includes('Enter');
    this.stageTimer -= dt * (skip ? 100 : 1);
    if (this.stageTimer > 0) return;
    if (this.spinStage === 'landed') {
      this.showSpinResult(this.run.lastResult!);
    } else {
      this.cancelResult?.();
      this.finishSpin();
    }
  }

  private frameCaught(dt: number): void {
    this.caughtTimer -= dt;
    if (this.caughtTimer <= 0 && this.mode === 'caught') {
      this.mode = 'over';
      openModal(gameOverView(this.run, () => location.reload()));
    }
  }

  /** Debug helper for the console: `game.cheat(5000)`. */
  cheat(money: number): void {
    this.run.money += money;
    this.renderHud();
  }
}
