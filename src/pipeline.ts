import { render, parseListing, toText, llmFill } from './extract.js';
import { decide } from './decide.js';
import { renderReport } from './report.js';
import type { Comp, Listing, Profile } from './types.js';

/** Prime after the SARB's 23 Jul 2026 hold. Update DEFAULT_RATE after each MPC meeting. */
export const defaultRate = () => Number(process.env.DEFAULT_RATE ?? 10.5);
const BLOCK = /just a moment|cf-chl|access denied|captcha|attention required|are you a robot/i;
export const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !Number.isNaN(v))) as Partial<T>;

export interface Opts {
  html?: string; comps?: unknown; allow?: (u: string) => boolean;
  profile?: Partial<Profile>;
  overrides?: Partial<Record<'price' | 'floorSqm' | 'erfSqm' | 'levy' | 'rates', number>>;
}

export function cleanComps(x: unknown): { comps: Comp[]; dropped: number } {
  const arr = Array.isArray(x) ? x : [];
  const pos = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined);
  const comps = arr.filter((c: any) => c && Number(c.price) >= 100_000)
    .map((c: any) => ({ price: Number(c.price), floorSqm: pos(c.floorSqm), erfSqm: pos(c.erfSqm), beds: Number.isInteger(c.beds) ? c.beds : undefined, propertyType: c.propertyType, kind: c.kind, date: c.date, address: c.address }));
  return { comps, dropped: arr.length - comps.length };
}

export async function analyze(url: string, o: Opts = {}) {
  let html = o.html;
  if (html === undefined) {
    try { html = await render(url, o.allow); }
    catch (e) { throw new Error(`Could not load the page (${(e as Error).message}). Save it from your browser and supply the page HTML instead.`); }
  }
  if (html.length < 8000 && BLOCK.test(html)) throw new Error('The site blocked automated access. Save the page from your browser and supply the page HTML instead.');
  const L = await llmFill(parseListing(html, url), toText(html));
  const { d, dropped } = decideFor(L, o);
  return { d, html: renderReport(d), dropped };
}

export function decideFor(L: Listing, o: Opts) {
  for (const [k, v] of Object.entries(clean(o.overrides ?? {}))) if ((v as number) > 0) { (L as any)[k] = v; L.src[k] = 'user'; }
  if (L.price && (L.price < 50_000 || L.price > 200_000_000)) throw new Error(`Extracted price R${L.price} looks wrong. Supply the price manually.`);
  const p: Profile = { buyer: 'first-time', depositPct: 10, rate: defaultRate(), termYears: 20, city: L.city === 'Cape Town' ? 'ct' : undefined, ...clean(o.profile ?? {}) };
  if (!(p.depositPct >= 0 && p.depositPct < 100) || !(p.rate > 0 && p.rate < 30) || !(p.termYears >= 1 && p.termYears <= 30)) throw new Error('Deposit must be 0 to 99%, rate 0 to 30% and term 1 to 30 years.');
  const { comps, dropped } = cleanComps(o.comps);
  const d = decide(L, p, comps);
  return { d, dropped };
}
