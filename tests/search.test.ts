import { describe, expect, it } from 'vitest';
import { buildIndex, fold, search } from '../src/lib/search.ts';

const ix = buildIndex({
  name: ['Madrid', 'Madridejos', 'Las Rozas de Madrid', 'Donostia/San Sebastián', 'Ávila', 'San Sebastián', 'Getafe'],
  zone: [0, 1, 2, 3, 4, 3, 5],
  alias: [0, 0, 0, 0, 0, 1, 0],
});
const pop = [3_300_000, 10_000, 95_000, 190_000, 58_000, 0, 185_000];

describe('search', () => {
  it('folds accents and case', () => {
    expect(fold('Ávila')).toBe('avila');
    expect(fold('  DONOSTIA/San ')).toBe('donostia san');
  });
  it('ranks exact before prefix before word matches', () => {
    expect(search(ix, 'madrid', pop).map((h) => h.name)).toEqual(['Madrid', 'Madridejos', 'Las Rozas de Madrid']);
  });
  it('matches either part of a bilingual name, once per zone', () => {
    const hits = search(ix, 'san sebas', pop);
    expect(hits[0].zone).toBe(3);
    expect(hits.filter((h) => h.zone === 3)).toHaveLength(2); // official name and the alias are different names
  });
  it('ignores accents in the query', () => {
    expect(search(ix, 'avila', pop)[0].name).toBe('Ávila');
  });
  it('needs at least two characters', () => {
    expect(search(ix, 'm', pop)).toEqual([]);
  });
});
