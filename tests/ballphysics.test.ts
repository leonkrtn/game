import { describe, expect, it } from 'vitest';
import { mulberry, planSpin, planStats, POCKET_R, rotorAngle, sampleAt, STEP } from '../src/world/ballphysics';

describe('ball physics', () => {
  it('lands every ball in its planned pocket, in a realistic time', () => {
    const rnd = mulberry(7);
    const ends: number[] = [];
    let forced = 0; // spins without a single deflector knock
    for (let i = 0; i < 60; i++) {
      const target = Math.floor(rnd() * 37);
      const second = i % 5 === 0 ? Math.floor(rnd() * 37) : undefined;
      const plan = planSpin(rnd() * 6, 0.15, target, second, rnd);
      const b = plan.balls[0];
      expect(b.pocket).toBe(target);
      if (second !== undefined) expect(plan.balls[1].pocket).toBe(second);
      ends.push(b.end);
      // The last sample rests in the pocket, on the rotor.
      const out = [0, 0, 0];
      sampleAt(b, b.end + 1, out);
      const rel = out[0] - rotorAngle(plan.rotor, b.end);
      const k = Math.round(-rel / STEP);
      expect(((k % 37) + 37) % 37).toBe(target);
      expect(Math.abs(rel + k * STEP)).toBeLessThan(0.02);
      expect(Math.abs(out[1] - POCKET_R)).toBeLessThan(0.05);
      if (b.events.filter((e) => e.kind === 'knock').length === 0) forced++;
      // The ball never teleports: consecutive samples stay close.
      for (let j = 3; j < b.samples.length; j += 3) {
        const dx = Math.cos(b.samples[j]) * b.samples[j + 1] - Math.cos(b.samples[j - 3]) * b.samples[j - 2];
        const dz = Math.sin(b.samples[j]) * b.samples[j + 1] - Math.sin(b.samples[j - 3]) * b.samples[j - 2];
        expect(Math.hypot(dx, dz)).toBeLessThan(0.4);
      }
    }
    const avg = ends.reduce((a, b) => a + b, 0) / ends.length;
    // The real physics found the pocket every time; the glide fallback was never needed.
    expect(planStats.forced).toBe(0);
    expect(forced).toBeLessThan(10);
    expect(avg).toBeGreaterThan(5);
    expect(avg).toBeLessThan(9);
  });
});
