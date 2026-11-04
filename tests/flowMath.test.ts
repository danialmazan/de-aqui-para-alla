import { describe, expect, it } from 'vitest';
import {
  bezierLength, chooseUnit, controlPoint, dotsFor, hourBlend, radicalInverse, valueAt,
} from '../src/map/flowMath.ts';

describe('hour interpolation', () => {
  const hours = Array.from({ length: 24 }, (_, h) => h * 10);

  it('holds the hour value for the first 65% of the hour', () => {
    expect(valueAt(hours, 8)).toBe(80);
    expect(valueAt(hours, 8.6)).toBe(80);
  });

  it('reaches the next hour exactly at the boundary and morphs monotonically', () => {
    expect(valueAt(hours, 8.999999)).toBeCloseTo(90, 3);
    const samples = [8.7, 8.8, 8.9].map((t) => valueAt(hours, t));
    expect(samples[0]).toBeLessThan(samples[1]);
    expect(samples[1]).toBeLessThan(samples[2]);
  });

  it('wraps 23h into 0h', () => {
    expect(hourBlend(23.99).h1).toBe(0);
    expect(hourBlend(24.5).h0).toBe(0);
  });
});

describe('unit ladder', () => {
  it('picks the smallest unit within budget', () => {
    expect(chooseUnit(9_000, 10_000)).toBe(1);
    expect(chooseUnit(150_000, 10_000)).toBe(20);
  });

  it('dot count is linear in trips', () => {
    expect(dotsFor(2000, 300, 100)).toBeCloseTo(2 * dotsFor(1000, 300, 100));
    expect(dotsFor(100, 240, 100)).toBeCloseTo(10);
  });
});

describe('stratified ranks', () => {
  it('any prefix of half the slots is evenly spread', () => {
    const ranks = Array.from({ length: 64 }, (_, k) => radicalInverse(k));
    const visible = ranks.map((r, k) => (r < 0.5 ? k : -1)).filter((k) => k >= 0);
    expect(visible).toHaveLength(32);
    expect(visible.every((k) => k % 2 === 0)).toBe(true);
  });
});

describe('arc geometry', () => {
  it('bends to the right of travel so opposite directions separate', () => {
    const ab = controlPoint([0, 0], [10, 0]);
    const ba = controlPoint([10, 0], [0, 0]);
    expect(ab[1]).toBeGreaterThan(0); // y down: right of eastward travel is south
    expect(ba[1]).toBeLessThan(0);
  });

  it('length is slightly longer than the chord', () => {
    const len = bezierLength([0, 0], controlPoint([0, 0], [100, 0]), [100, 0]);
    expect(len).toBeGreaterThan(100);
    expect(len).toBeLessThan(110);
  });
});
