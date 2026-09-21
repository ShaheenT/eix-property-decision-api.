import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

try { process.loadEnvFile(); } catch { /* .env is optional */ }
const { analyze } = await import('./pipeline.js');
const a = process.argv.slice(2);
const flag = (k: string) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
const num = (k: string) => (flag(k) ? Number(flag(k)) : undefined);
const url = a.find(x => x.startsWith('http'));
if (!url) {
  console.error('Usage: npm run analyze -- <listing-url> [--profile first-time|investor|upgrader] [--deposit 10] [--rate 10.5] [--term 20]\n  [--income 60000] [--rent 25000] [--vat] [--city ct] [--comps comps.json] [--price N --floor N --erf N --levy N --rates N] [--html saved-page.html]');
  process.exit(1);
}
try {
  const r = await analyze(url, {
    html: flag('html') ? readFileSync(flag('html')!, 'utf8') : undefined,
    comps: flag('comps') ? JSON.parse(readFileSync(flag('comps')!, 'utf8')) : undefined,
    profile: { buyer: flag('profile') as any, depositPct: num('deposit'), rate: num('rate'), termYears: num('term'), grossIncome: num('income'), monthlyRent: num('rent'), vatSale: a.includes('--vat') || undefined, city: flag('city') === 'ct' ? 'ct' : undefined },
    overrides: { price: num('price'), floorSqm: num('floor'), erfSqm: num('erf'), levy: num('levy'), rates: num('rates') },
  });
  mkdirSync('reports', { recursive: true });
  const slug = new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'listing';
  writeFileSync(`reports/${slug}.html`, r.html);
  writeFileSync(`reports/${slug}.json`, JSON.stringify({ listing: r.d.L, status: r.d.status, readiness: r.d.readiness, bond: r.d.bond, upfront: r.d.upfront, flags: r.d.flags }, null, 2));
  if (r.dropped) console.warn(`${r.dropped} comparable(s) ignored (price missing or under R100,000).`);
  console.log(`${r.d.status} | readiness ${r.d.readiness}/100 | reports/${slug}.html`);
} catch (e) { console.error('Error: ' + (e as Error).message); process.exit(2); }
