/** Keyboard state plus a queue of key presses for the current frame. */
export class Input {
  private down = new Set<string>();
  private pressed: string[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Returns and clears this frame's key presses. */
  takePresses(): string[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  /** Movement from WASD / arrows as screen-relative x (right) and y (towards the viewer). */
  axis(): { x: number; y: number } {
    let x = 0, y = 0;
    // Arrow left/right turn the view in first person; A/D step sideways.
    if (this.isDown('KeyA')) x -= 1;
    if (this.isDown('KeyD')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }
}
