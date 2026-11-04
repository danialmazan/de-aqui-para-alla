// Place search over every INE municipality name (search.json). Folds accents and
// case; ranks exact > starts with > a word starts with > contains, then by the
// zone's population. Bilingual names ("Donostia/San Sebastián") match on each part.

export type SearchIndex = { name: string[]; zone: number[]; alias: number[] };
export type Hit = { name: string; zone: number; alias: boolean };

export function fold(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
}

type Entry = { name: string; zone: number; alias: boolean; parts: string[] };

export function buildIndex(ix: SearchIndex): Entry[] {
  return ix.name.map((name, i) => ({
    name, zone: ix.zone[i], alias: ix.alias[i] === 1,
    parts: name.split('/').map(fold).filter(Boolean),
  }));
}

function score(parts: string[], q: string) {
  let best = 0;
  for (const p of parts) {
    if (p === q) return 4;
    if (p.startsWith(q)) best = Math.max(best, 3);
    else if (p.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 2);
    else if (p.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/** Best matches, at most one per zone, ties broken by population. */
export function search(entries: Entry[], query: string, pop: ArrayLike<number>, limit = 8): Hit[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const scored: { e: Entry; s: number }[] = [];
  for (const e of entries) {
    const s = score(e.parts, q);
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || (pop[b.e.zone] ?? 0) - (pop[a.e.zone] ?? 0) || a.e.name.localeCompare(b.e.name, 'es'));
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const { e } of scored) {
    const id = `${e.zone}|${fold(e.name)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ name: e.name, zone: e.zone, alias: e.alias });
    if (out.length >= limit) break;
  }
  return out;
}
