import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowedUrl } from '../src/hosts.js';
import { analyze } from '../src/pipeline.js';
import { decide } from '../src/decide.js';
import { parseListing } from '../src/extract.js';
import type { Comp, Profile } from '../src/types.js';

interface W { url?: string; err?: string; price: number; p: Profile; comps: Comp[]; d?: ReturnType<typeof decide>; html?: string; L?: ReturnType<typeof parseListing> }

Given('an asking price of {int} with {int}% deposit at {float}% over {int} years', function (this: W, price: number, dep: number, rate: number, term: number) {
  this.price = price; this.comps = [];
  this.p = { buyer: 'first-time', depositPct: dep, rate, termYears: term };
});
Given('comparable sales of {}', function (this: W, list: string) {
  this.comps = list.split(/,| and /).map(s => ({ price: Number(s.trim()) }));
});
Given('a gross monthly income of {int}', function (this: W, inc: number) { this.p.grossIncome = inc; });
When('I run the decision engine', function (this: W) {
  this.d = decide({ url: 'x', price: this.price, rates: (this as any).rates, titleType: 'freehold', features: [], src: {} }, this.p, this.comps);
});
Then('the monthly bond is {float}', function (this: W, v: number) { assert.equal(Math.round(this.d!.bond * 100) / 100, v); });
Then('the transfer duty is {int}', function (this: W, v: number) { assert.equal(this.d!.duty, v); });
Then('the status is {string}', function (this: W, s: string) { assert.equal(this.d!.status, s); });

Given('a listing page saying {string}', function (this: W, t: string) { this.html = `<html><title>${t.split('.')[0]}</title><body>${t}</body></html>`; });
When('I parse the listing', function (this: W) { this.L = parseListing(this.html!, this.url ?? 'https://example.com/x'); });
Then('the price is {int}', function (this: W, v: number) { assert.equal(this.L!.price, v); });
Then('the erf size is {int}', function (this: W, v: number) { assert.equal(this.L!.erfSqm, v); });
Then('the floor size is not found', function (this: W) { assert.equal(this.L!.floorSqm, undefined); });
Then('the levy is not found', function (this: W) { assert.equal(this.L!.levy, undefined); });

Given('a Cape Town listing with rates of {int} a month', function (this: W & { rates: number }, r: number) { this.p.city = 'ct'; this.rates = r; });
Then('the implied municipal value is between {int} and {int}', function (this: W, lo: number, hi: number) {
  const i = this.d!.implied!; assert.ok(i.low >= lo && i.high <= hi, `${i.low}-${i.high}`);
});
Then('the price must rise by more than {int}% to break even', function (this: W, n: number) { assert.ok(this.d!.uplift > n / 100); });

Given('the saved listing {string} at {string}', function (this: W, f: string, url: string) { this.html = readFileSync(`features/fixtures/${f}`, 'utf8'); this.url = url; });
Then('these fields are extracted: {string}', function (this: W, spec: string) {
  const L = this.L as any, alias: Record<string, unknown> = { floor: L.floorSqm, erf: L.erfSqm, type: L.propertyType, title: L.titleType, listing: L.listing ?? 'sale', rent: L.rent };
  for (const kv of spec.split(';')) {
    const [k, v] = kv.split('='), got = k in alias ? alias[k] : L[k];
    assert.equal(got === undefined ? '-' : String(got), v, k);
  }
});
Then('the URL {string} is {word}', function (u: string, verdict: string) { assert.equal(allowedUrl(u) ? 'allowed' : 'rejected', verdict); });
When('I analyse the page {string}', async function (this: W, html: string) {
  try { await analyze('https://www.property24.com/x', { html }); this.err = ''; } catch (e) { this.err = (e as Error).message; }
});
Then('the error mentions {string}', function (this: W, s: string) { assert.ok(this.err?.includes(s), `got: ${this.err}`); });
