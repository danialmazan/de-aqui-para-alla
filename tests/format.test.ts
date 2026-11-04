import { describe, expect, it } from 'vitest';
import { approx, approxShort, formatHour, percent } from '../src/lib/format.ts';

describe('format', () => {
  it('rounds to two significant figures with local grouping', () => {
    expect(approx(310888, 'es')).toBe('310.000');
    expect(approx(310888, 'en')).toBe('310,000');
    expect(approx(1734, 'es')).toBe('1.700');
    expect(approx(7, 'es')).toBe('7');
  });
  it('writes millions in words, singular when exactly one', () => {
    expect(approx(1_020_000, 'es')).toBe('1 millón');
    expect(approx(3_412_000, 'es')).toBe('3,4 millones');
    expect(approx(3_412_000, 'en')).toBe('3.4 million');
  });
  it('shortens millions for tiles', () => {
    expect(approxShort(1_020_000, 'es')).toBe('1,0 M');
    expect(approxShort(940_000, 'es')).toBe('940.000');
  });
  it('formats percentages per language', () => {
    expect(percent(0.584, 'es')).toBe('58 %');
    expect(percent(0.584, 'en')).toBe('58%');
  });
  it('formats hours on a 24-hour clock', () => {
    expect(formatHour(8.7)).toBe('08:00');
    expect(formatHour(23.99)).toBe('23:00');
  });
});
