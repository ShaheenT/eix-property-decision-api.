import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideFor } from '../src/pipeline.js';
import { buildScorecard } from '../src/scorecard.js';
import { calibrate, spearman } from '../src/calibrate.js';
import { coverage } from '../src/smoke.js';
import { parseListing } from '../src/extract.js';
import type { Comp, Listing } from '../src/types.js';

const RANK: Record<string, number> = { 'BUY': 0, 'PROCEED WITH CAUTION': 1, 'NEGOTIATE': 2, 'WALK AWAY': 3 };
const SALES: Comp[] = [[3000000, 130], [3150000, 135], [3300000, 140], [3250000, 138], [3100000, 132], [3400000, 145]].map(([price, floorSqm]) => ({ price, floorSqm }));
const listing = (price: number): Listing => ({ url: 'x', price, beds: 3, baths: 3, parking: 2, floorSqm: 140, erfSqm: 200, rates: 1318, titleType: 'freehold', propertyType: 'house', city: 'Cape Town', features: [], src: {} });
const run = (price: number, o: { income?: number; comps?: Comp[]; rent?: number } = {}) => {
  const d = decideFor(listing(price), { profile: { grossIncome: o.income, monthlyRent: o.rent }, comps: o.comps ?? SALES }).d, sc = buildScorecard(d);
  return { score: sc.investmentScore.value, risk: sc.riskScore.value, conf: sc.confidence.percent, label: sc.decision.label, sc };
};
type Pt = ReturnType<typeof run>;
interface C { sweep: Pt[]; }
const sweep = (from: number, to: number, step: number, f: (x: number) => Pt) => { const out: Pt[] = []; for (let x = from; x <= to; x += step) out.push(f(x)); return out; };

When('I sweep the asking price from {int} to {int} in steps of {int} for a buyer earning 150000', function (this: C, a: number, b: number, s: number) { this.sweep = sweep(a, b, s, p => run(p, { income: 150000 })); });
When('I sweep the buyer income from {int} to {int} in steps of {int}', function (this: C, a: number, b: number, s: number) { this.sweep = sweep(a, b, s, i => run(3500000, { income: i })); });
Then('the investment score never rises as the price rises', function (this: C) { for (let i = 1; i < this.sweep.length; i++) assert.ok(this.sweep[i].score! <= this.sweep[i - 1].score!, `step ${i}: ${this.sweep[i - 1].score} -> ${this.sweep[i].score}`); });
Then('the decision label never improves as the price rises', function (this: C) { for (let i = 1; i < this.sweep.length; i++) assert.ok(RANK[this.sweep[i].label] >= RANK[this.sweep[i - 1].label], `step ${i}: ${this.sweep[i - 1].label} -> ${this.sweep[i].label}`); });
Then('the score never moves by more than {int} points between steps', function (this: C, n: number) { for (let i = 1; i < this.sweep.length; i++) assert.ok(Math.abs(this.sweep[i].score! - this.sweep[i - 1].score!) <= n, `step ${i}: ${this.sweep[i - 1].score} -> ${this.sweep[i].score}`); });
Then('the score never falls and the risk never rises as income rises', function (this: C) { for (let i = 1; i < this.sweep.length; i++) { assert.ok(this.sweep[i].score! >= this.sweep[i - 1].score!, `score step ${i}`); assert.ok(this.sweep[i].risk! <= this.sweep[i - 1].risk!, `risk step ${i}`); } });
Then('the label spans both a good outcome and a bad outcome', function (this: C) { const r = this.sweep.map(p => RANK[p.label]); assert.ok(Math.min(...r) <= 1 && Math.max(...r) === 3, JSON.stringify(this.sweep.map(p => p.label))); });
Then('raising every comparable by 10 percent never lowers the score', function () { const up = SALES.map(c => ({ ...c, price: c.price * 1.1 })); for (const p of [2800000, 3200000, 3600000, 4000000]) assert.ok(run(p, { income: 150000, comps: up }).score! >= run(p, { income: 150000 }).score!, `price ${p}`); });
Then('adding evidence never lowers confidence', function () { const none = run(3500000, { comps: [] }).conf, comps = run(3500000).conf, income = run(3500000, { income: 150000 }).conf, rent = run(3500000, { income: 150000, rent: 22000 }).conf; assert.ok(none <= comps && comps <= income && income <= rent, `${none} ${comps} ${income} ${rent}`); });
Then('the same input always gives the same scorecard', function () { assert.deepEqual(run(3500000, { income: 150000 }).sc, run(3500000, { income: 150000 }).sc); });
Then('every score and percentage stays within 0 to 100', function () { for (const p of sweep(1000000, 9000000, 500000, x => run(x, { income: 40000 }))) for (const v of [p.score, p.risk, p.conf]) assert.ok(v === null || (v >= 0 && v <= 100 && Number.isInteger(v)), String(v)); });

Given('the calibration cases:', function (this: { rows: string }, doc: string) { this.rows = doc; });
Then('the calibration shows spearman {float}, accuracy {float} and a NEGOTIATE discount of {float} percent', function (this: { rows: string }, sp: number, acc: number, disc: number) {
  const r = calibrate(this.rows.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)));
  assert.equal(r.scoreVsReturn.spearman, sp); assert.equal(r.expertAgreement.accuracy, acc);
  assert.equal(r.discountByLabel.find(x => x.label === 'NEGOTIATE')!.meanDiscountToAskingPercent, disc);
  assert.equal(r.expertAgreement.confusion['BUY']['PROCEED WITH CAUTION'], 1);
  assert.ok(r.warnings.length >= 2);
});
Then('spearman of a perfectly opposite ranking is {int}', function (n: number) { assert.equal(Math.round(spearman([1, 2, 3, 4], [4, 3, 2, 1])!), n); });
Then('the smoke coverage of {string} finds price, bedrooms and city', function (f: string) { const c = coverage(parseListing(readFileSync(`features/fixtures/${f}`, 'utf8'), 'https://property.mg.co.za/x-cape-town')); assert.ok(c.core, JSON.stringify(c)); });
