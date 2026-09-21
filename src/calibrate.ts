import { readFileSync } from 'node:fs';

/** One closed case: what the API said, and what actually happened. Join on the decision id and scoringVersion you stored. */
export interface Row { label: string; score: number | null; confidence: number; askingPrice?: number; outcome?: { soldPrice?: number; expertLabel?: string; realizedReturnPercent?: number } }
const LABELS = ['BUY', 'PROCEED WITH CAUTION', 'NEGOTIATE', 'WALK AWAY'];
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const round = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function ranks(a: number[]) {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]), r = new Array<number>(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
/** Spearman rank correlation (Pearson on average ranks); null when undefined. */
export function spearman(x: number[], y: number[]) {
  if (x.length < 3) return null;
  const a = ranks(x), b = ranks(y), ma = mean(a), mb = mean(b);
  const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0), va = a.reduce((s, v) => s + (v - ma) ** 2, 0), vb = b.reduce((s, v) => s + (v - mb) ** 2, 0);
  return va && vb ? cov / Math.sqrt(va * vb) : null;
}

export function calibrate(rows: Row[]) {
  const ret = rows.filter(r => r.score !== null && r.outcome?.realizedReturnPercent !== undefined);
  const sold = rows.filter(r => r.askingPrice && r.outcome?.soldPrice);
  const labelled = rows.filter(r => r.outcome?.expertLabel);
  const confusion: Record<string, Record<string, number>> = {};
  for (const r of labelled) { (confusion[r.label] ??= {})[r.outcome!.expertLabel!] = ((confusion[r.label] ??= {})[r.outcome!.expertLabel!] ?? 0) + 1; }
  const discountByLabel = LABELS.map(l => { const g = sold.filter(r => r.label === l); return { label: l, n: g.length, meanDiscountToAskingPercent: g.length ? round(mean(g.map(r => ((r.askingPrice! - r.outcome!.soldPrice!) / r.askingPrice!) * 100)), 1) : null }; });
  const warnings: string[] = [];
  if (rows.length < 100) warnings.push(`Only ${rows.length} cases: too few for reliable conclusions (aim for 100+ with sale prices).`);
  if (labelled.length < 30) warnings.push(`Only ${labelled.length} expert-labelled cases (aim for 30+ from at least two reviewers).`);
  if (!sold.length) warnings.push('No sold prices: NEGOTIATE cannot be checked against actual discounts.');
  return {
    n: rows.length,
    scoreVsReturn: { n: ret.length, spearman: round(spearman(ret.map(r => r.score!), ret.map(r => r.outcome!.realizedReturnPercent!))) },
    expertAgreement: { n: labelled.length, accuracy: labelled.length ? round(labelled.filter(r => r.label === r.outcome!.expertLabel).length / labelled.length) : null, confusion },
    discountByLabel, warnings,
  };
}

if (/calibrate\.(ts|js)$/.test(process.argv[1] ?? '')) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: npm run calibrate -- cases.jsonl'); process.exit(1); }
  const rows: Row[] = readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  console.log(JSON.stringify(calibrate(rows), null, 2));
}
