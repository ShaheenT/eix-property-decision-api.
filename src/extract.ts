import type { Listing, Src } from './types.js';
import { readSignals } from './signals.js';
import { provinceOf } from './places.js';

/** Layer 1: render the page in a real browser (portals are JS-heavy and bot-sensitive). */
export async function render(url: string, allow?: (u: string) => boolean): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: process.env.PW_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const ctx = await browser.newContext({ locale: 'en-ZA', userAgent: process.env.USER_AGENT || undefined });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // Property24 adds points of interest, the bond calculator and recent sales with JavaScript as they scroll into view
    for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(300); }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => /\d(?:\.\d+)?\s*km/.test(document.body.innerText) || /Monthly Repayment:?\s*[Rr]\s*\d/.test(document.body.innerText), undefined, { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (allow && !allow(page.url())) throw new Error('The page redirected to a host that is not allowed.');
    return await page.content();
  } finally { await browser.close(); }
}

export const toText = (h: string) => h
  .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&sup2;/g, '²').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const n = (s?: string) => { const v = s ? Number(s.replace(/[,.]\d{1,2}$/, '').replace(/[^\d]/g, '')) : NaN; return v > 0 ? v : undefined; };
/** Agents enter placeholders such as "Levies R 1"; treat anything under R50 as not stated. */
const min50 = (v?: number) => (v && v >= 50 ? v : undefined);
const MONEY = String.raw`R\s?(\d{1,3}(?:[\s,]\d{3})+|\d+)`;

/** Layer 2: deterministic parsing. Priority: JSON-LD > visible text. Never invents values. */
export function parseListing(html: string, url: string): Listing {
  const L: Listing = { url, features: [], titleType: 'unknown', src: {} };
  const set = (k: string, v: unknown, s: Src) => {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !(v > 0))) return;
    if ((L as any)[k] === undefined) { (L as any)[k] = v; L.src[k] = s; }
  };
  for (const m of html.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o: any): void => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (!o || typeof o !== 'object') return;
        const off = Array.isArray(o.offers) ? o.offers[0] : o.offers;
        set('price', n(String(off?.price ?? '')), 'jsonld');
        set('beds', n(String(o.numberOfBedrooms ?? '')), 'jsonld');
        set('baths', n(String(o.numberOfBathroomsTotal ?? o.numberOfBathrooms ?? '')), 'jsonld');
        set('floorSqm', n(String(o.floorSize?.value ?? '')), 'jsonld');
        set('suburb', o.address?.addressLocality, 'jsonld');
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(m[1]));
    } catch { /* malformed JSON-LD: fall through to text */ }
  }
  const T = toText(html);
  const g = (re: RegExp) => T.match(re)?.[1];
  // Listing coordinates (JSON-LD geo or embedded map data), kept only if they fall inside South Africa
  const lat = Number(html.match(/["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d{1,2}\.\d{3,})/i)?.[1]), lng = Number(html.match(/["']?(?:lng|lon|long|longitude)["']?\s*[:=]\s*["']?(-?\d{1,3}\.\d{3,})/i)?.[1]);
  if (lat <= -21.5 && lat >= -35.5 && lng >= 16 && lng <= 33.5) { L.lat = lat; L.lng = lng; }
  L.image = html.match(/property=["']og:image["'][^>]*content=["'](https?:[^"']+)/i)?.[1];
  L.title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim();
  // Rentals are priced "R 15 000 Per Month" and must never be read as a sale price
  const rentM = T.match(new RegExp(String.raw`${MONEY}\s*(?:per month|p/m|pm|/\s*month|a month)`, 'i')), head = T.slice(0, 600);
  // The headline ("3 Bedroom House to Rent in ...") decides; menus such as "House to Rent in Woodstock" must not
  const kind = T.match(/\b\d+(?:\.\d+)?\s+Bed(?:room)?s?\s+[\w /-]{2,40}?\s+(for sale|to rent|for rent)\s+in\b/i)?.[1];
  const isRent = kind ? /rent/i.test(kind) : !!rentM && !/for sale/i.test(head);
  if (isRent) { L.listing = 'rental'; L.rent = n(rentM?.[1]); }
  const firstBig = [...T.matchAll(new RegExp(String.raw`\b${MONEY}`, 'g'))].map(m => n(m[1])!).find(v => v >= 100_000);
  if (!isRent) set('price', n(g(new RegExp(String.raw`(?:asking price|price)\s*:?\s*${MONEY}`, 'i'))) ?? firstBig, 'text');
  // Portals print "Beds 3 Bathroom 2 parking 1" (label first); titles print "3 Bedroom" (number first). Try label-first, then number-first.
  // Some sites print "Beds 3 Bathroom 2" (label first), others "3 Bedrooms 3.5 Bathrooms" (number first). Detect which.
  const lf = /\bbed(?:room)?s?\s*:?\s*\d+\s+bath/i.test(T), pick = (a: RegExp, b: RegExp) => (lf ? g(a) ?? g(b) : g(b) ?? g(a));
  set('beds', n(pick(/\bbed(?:room)?s?\s*:?\s*(\d+)\b/i, /(\d+)\s*bed(?:room)?s?\b/i)), 'text');
  set('baths', parseFloat(pick(/\bbath(?:room)?s?\s*:?\s*(\d+(?:\.\d)?)\b/i, /(\d+(?:\.\d)?)\s*bath(?:room)?s?\b/i) ?? ''), 'text');
  set('parking', n(pick(/(?:parking|garage|carport)\w*\s*:?\s*(\d+)\b/i, /(\d+)\s*(?:parking|garages?|carports?)\b/i)), 'text');
  set('floorSqm', n(g(/floor\s*(?:size|area)\s*:?\s*(\d[\d\s]*?)\s*m/i)), 'text');
  set('erfSqm', n(g(/(?:erf|land|stand|plot)\s*(?:size|area)\s*:?\s*(\d[\d\s]*?)\s*m/i)), 'text');
  set('levy', min50(n(g(new RegExp(String.raw`levies?\s*:?\s*${MONEY}`, 'i')))), 'text');
  set('rates', min50(n(g(new RegExp(String.raw`rates(?:\s*(?:&|and)\s*taxes)?\s*:?\s*${MONEY}`, 'i')))), 'text');
  set('suburb', L.title?.match(/\bin ([A-Z][\w' -]+?)(?:,|\s[-|]|$)/)?.[1], 'text');
  L.propertyType = (L.title?.match(/\b(house|apartment|flat|townhouse|cluster|duplex|studio|vacant land)\b/i) ?? T.match(/(?:bed(?:room)?s?|type of property|property type)\s+(house|apartment|flat|townhouse|cluster|duplex|studio)\b/i))?.[1]?.toLowerCase();
  // City: URL first, then the text right after "for sale in" (there is also an Observatory in Johannesburg).
  const at = T.search(/(?:for sale|to rent|for rent) in/i), near = at < 0 ? '' : T.slice(at, at + 140);
  L.city = /cape[- ]town|western[- ]cape/i.test(url + ' ' + near) ? 'Cape Town' : /johannesburg|pretoria|durban|gqeberha|bloemfontein|ekurhuleni/i.exec(url + ' ' + near)?.[0];
  L.province = provinceOf(L.city, url);
  L.titleType = (L.levy ?? 0) > 0 || /sectional title|body corporate/i.test(T) || /apartment|flat|townhouse|cluster/.test(L.propertyType ?? '')
    ? 'sectional' : /freehold|free-standing|freestanding/i.test(T) ? 'freehold' : 'unknown';
  L.features = ['garden', 'fibre', 'pool', 'solar', 'inverter', 'generator', 'borehole', 'security', 'alarm', 'electric fence', 'pet friendly', 'balcony', 'braai', 'study', 'fibre-ready', 'victorian', 'fireplace', 'wooden floors', 'sash', 'pressed ceiling']
    .filter(f => new RegExp(f === 'fibre' ? String.raw`\bfibre\b(?![- ]?ready)` : f === 'fibre-ready' ? String.raw`fibre[- ]?ready` : String.raw`\b${f}`, 'i').test(T));
  // ---- Full live-listing capture (Property24 layout). Every field is optional and never guessed.
  if (/\bUnder Offer\b/.test(T)) L.status = 'under_offer';
  L.listingNumber = g(/Listing Number\s*(\d{6,})/i);
  const ld = g(/Listing Date\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i), ldt = ld ? Date.parse(ld + ' UTC') : NaN;
  if (!Number.isNaN(ldt)) L.listedDate = new Date(ldt).toISOString().slice(0, 10);
  L.streetAddress = g(/Street Address\s*\[?(.+?)\]?(?:\(javascript:;\))?\s+(?:Listing Date|Erf Size|Floor Size|Rates and Taxes)/i)?.trim();
  if (L.suburb === undefined && L.streetAddress?.includes(',')) L.suburb = L.streetAddress.split(',').pop()!.trim();
  set('receptionRooms', n(g(/Reception Rooms\s*:?\s*(\d+)/i)), 'text');
  L.agentName = g(/Agent profile for ([A-Z][\w'.-]*(?: [A-Z][\w'.-]*){0,3})/);
  L.agency = (g(/Trading as ([A-Za-z0-9/&' -]+?)(?:,|\.\s|\s+an\s)/i) ?? g(/Property for sale by ([A-Za-z0-9/&' -]+?)(?:\]|\)|"|\s{2})/i))?.trim();
  const poi = T.match(/Points of Interest\s+(.*?)\s+Bond Calculator/i);
  if (poi) {
    L.pois = []; let cat = '';
    for (const part of poi[1].split(/\b(Shopping|Education|Transport and Public Services|Food and Entertainment|Health|Recreation)\b/)) {
      if (/^(Shopping|Education|Transport and Public Services|Food and Entertainment|Health|Recreation)$/.test(part)) { cat = part; continue; }
      for (const x of part.replace(/View more/gi, ' ').matchAll(/(.+?)\s(\d+(?:\.\d+)?)\s*km/g)) L.pois.push({ category: cat, name: x[1].trim(), distanceKm: Number(x[2]) });
    }
  }
  const calc = { monthly: n(g(/Monthly Repayment:?\s*[Rr]\s*([\d\s]+)/)), onceOff: n(g(/Total Once-off Costs:?\s*R\s*([\d\s]+)/i)), minIncome: n(g(/Min Gross Monthly Income:?\s*R\s*([\d\s]+)/i)) };
  if (calc.monthly || calc.onceOff || calc.minIncome) L.portalCalc = calc;
  const rs = T.match(/Recent Sales in and around .*?(?:View more Sold|Trends and Statistics|$)/i)?.[0];
  if (rs) {
    const rows = [...(html.match(/<a[^>]+href="[^"]*property-values\/[^"]+"[^>]*>[^<]+<\/a>/gi) ?? []), ...rs.match(/\[[^\]]+\]\([^)\s]*property-values[^)\s]*\)/g) ?? []];
    L.recentSales = rows.map(r => ({ address: (r.match(/>([^<]+)<\/a>/) ?? r.match(/\[([^\]]+)\]/))![1].trim(), url: (r.match(/href="([^"]+)"/) ?? r.match(/\((https?:[^)\s]+)\)/))?.[1] })).filter(r => /^\d/.test(r.address));
  }
  const sig = readSignals(T, L); L.signals = sig.signals; L.claims = sig.claims;
  return L;
}

/** Layer 3 (optional): Claude reads only the text for fields still missing. Explicit values only. */
export async function llmFill(L: Listing, text: string): Promise<Listing> {
  const key = process.env.ANTHROPIC_API_KEY;
  const need = ['price', 'beds', 'baths', 'floorSqm', 'erfSqm', 'levy', 'rates'].filter(k => (L as any)[k] === undefined);
  if (!key || !need.length) return L;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MODEL || 'claude-sonnet-5', max_tokens: 300,
        messages: [{ role: 'user', content: `From this South African property listing text, return ONLY a JSON object with numeric values (rand or m²) for these keys if explicitly stated: ${need.join(', ')}. Omit any key not stated. Never estimate.\n\n${text.slice(0, 12_000)}` }],
      }),
    });
    const t = (await r.json() as any).content?.[0]?.text ?? '{}';
    const o = JSON.parse(t.replace(/```json|```/g, ''));
    for (const k of need) if (typeof o[k] === 'number' && o[k] > 0) { (L as any)[k] = o[k]; L.src[k] = 'llm'; }
  } catch (e) { console.warn('LLM fallback skipped:', (e as Error).message); }
  return L;
}
