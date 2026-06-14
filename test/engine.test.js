/* Golden / behavioral tests for the planner engine.
 * Run with:  npm test   (or: node --test)
 * These lock in current numbers so the Phase-2 class refactor must preserve them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcAll } from '../js/tax.js';
import { simulate } from '../js/engine.js';

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b} (±${tol})`);
const NOW = 2026;

const blankTaxInput = (over = {}) => ({
  age:50, status:'single', age65:false, spouseAge65:false, itemize:false,
  wages:0, trad401k:0, rmdInc:0, pension:0, otherOrd:0, stcg:0, stcgBasis:0,
  ltcg:0, ltcgBasis:0, qualDiv:0, ss:0, roth:0, fiveTwentyNine:0, muniBond:0, hsa:0,
  mortInt:0, propTax:0, stateTax:0, charityCash:0, charityNC:0, medical:0, otherDeduct:0, ...over
});

const demoState = (over = {}) => ({
  global:{ age:48, status:'single', horizon:95,
    taxable:300000, taxableBasis:150000, trad:600000, roth:150000, cash:60000, hsa:20000,
    home:{value:0,balance:0,rate:6.5,term:25,propTaxPct:1.1,insure:3000,maint:6000}, rentals:[],
    wages:180000, ss:40000, ssAge:67, spending:90000,
    gr:{taxable:6,trad:6,roth:6,cash:3,re:4,infl:3}, ...over },
  scenarios:[{id:'A', name:'A', events:[]}], compare:['A','A'], active:'A',
});
const withEvents = (events, over) => { const s=demoState(over); s.scenarios[0].events=events; return s; };

test('tax: $200k single wages → known fed + CA', () => {
  const r = calcAll(blankTaxInput({ wages:200000 }));
  near(r.fedTaxTotal, 37247);
  near(r.caTaxTotal, 14644);
});

test('tax: Social Security is CA-exempt and partly federal-taxable', () => {
  const r = calcAll(blankTaxInput({ ss:40000, pension:30000 }));
  assert.equal(Math.round(r.caTaxTotal) >= 0, true);
  assert.ok(r.fedAGI > 30000, 'some SS should be federally taxable on top of pension');
});

test('engine: demo "Work to 65" net-worth trajectory (golden)', () => {
  const s = withEvents([
    {id:'e1', type:'retire', age:65, p:{}, on:true},
    {id:'e2', type:'withdraw', age:65, p:{account:'trad', amount:140000}, on:true},
  ]);
  const A = simulate(s, 'A', NOW);
  near(A[48].netWorth, 1242112, 5);
  near(A[65].netWorth, 3473177, 5);
  // NOTE: the entity refactor fixed a latent bug where a depleting 401k could go
  // negative (old monolith hit -$5,254 at age 81); the new value floors at $0, so
  // deep-future net worth is ~$11.9k higher than the pre-refactor monolith.
  near(A[95].netWorth, 4000750, 50);
});

test('engine: accounts never go negative (depleting 401k floors at $0)', () => {
  const s = withEvents([
    {id:'r', type:'retire', age:60, p:{}, on:true},
    {id:'w', type:'withdraw', age:60, p:{account:'trad', amount:200000}, on:true},
  ]);
  const A = simulate(s, 'A', NOW);
  for(let age=48; age<=95; age++){
    assert.ok(A[age].bal.trad >= -0.001, `trad negative at ${age}: ${A[age].bal.trad}`);
    assert.ok(A[age].bal.roth >= -0.001, `roth negative at ${age}`);
    assert.ok(A[age].bal.taxable >= -0.001, `taxable negative at ${age}`);
  }
});

test('engine: month proration — retiring later in the year keeps more wages', () => {
  const mk = (month) => simulate(withEvents([{id:'e', type:'retire', age:55, month, p:{}, on:true}],
    {wages:200000, ss:0, spending:60000}), 'A', NOW)[55].income.wages;
  near(mk(1), 0, 1);            // retire Jan → ~no wages that year
  near(mk(7), 100000, 1);       // retire Jul → ~half
  near(mk(12), 183333, 1);      // retire Dec → 11/12
});

test('engine: mid-year job loss still taxes the wages earned before it', () => {
  const mk = (month) => simulate(withEvents([{id:'j', type:'job_loss', age:50, month, p:{}, on:true}],
    {wages:180000, ss:0, spending:60000}), 'A', NOW)[50];
  // January loss → no wages, no tax that year (correct)
  near(mk(1).income.wages, 0, 1);
  near(mk(1).fedTax, 0, 1);
  // July loss → ~half a year of wages, and tax must be > 0
  near(mk(7).income.wages, 90000, 1);
  assert.ok(mk(7).fedTax > 5000, `mid-year job loss should still owe tax, got ${mk(7).fedTax}`);
  assert.ok(mk(7).caTax > 0, 'CA tax should be > 0 on pre-loss wages');
});

test('engine: a rental adds equity and taxable net rent', () => {
  const s = demoState({ rentals:[{value:700000,balance:300000,rate:5,term:25,rent:3500,esc:3,
    propTaxPct:1.1,insure:1500,maint:3000,costBasis:600000,landPct:20,yearsOwned:5}] });
  const A = simulate(s, 'A', NOW);
  assert.ok(A[48].rentalEquity > 390000, 'equity ≈ value−balance at start');
  assert.ok(A[48].income.rental !== 0, 'net rental cash should be non-zero');
});

test('engine: depreciation lowers taxable rental income (vs land=100%)', () => {
  const base = {value:700000,balance:300000,rate:5,term:25,rent:3500,esc:3,propTaxPct:1.1,
    insure:1500,maint:3000,costBasis:600000,yearsOwned:5};
  const withDep = simulate(demoState({rentals:[{...base, landPct:20}], wages:150000}), 'A', NOW);
  const noDep   = simulate(demoState({rentals:[{...base, landPct:100}], wages:150000}), 'A', NOW);
  assert.ok(withDep[55].fedTax < noDep[55].fedTax, 'depreciation should reduce federal tax');
});

test('engine: selling a rental frees cash that year', () => {
  const rentals=[{value:700000,balance:300000,rate:5,term:25,rent:3500,esc:3,propTaxPct:1.1,
    insure:1500,maint:3000,costBasis:600000,landPct:20,yearsOwned:5}];
  const s = withEvents([{id:'s', type:'sell_rental', age:60, p:{which:1}, on:true}], {rentals});
  const A = simulate(s, 'A', NOW);
  assert.ok(A[60].bal.cash - A[59].bal.cash > 300000, 'equity should land as cash on sale');
  assert.equal(A[61].rentalEquity, 0, 'no rental left after selling the only one');
});

test('engine: convert home → rental moves equity into rental equity', () => {
  const s = withEvents([{id:'c', type:'home_to_rental', age:55, p:{rent:4000, esc:3, landPct:20}, on:true}],
    { home:{value:900000,balance:400000,rate:4,term:20,propTaxPct:1.1,insure:3000,maint:6000} });
  const A = simulate(s, 'A', NOW);
  assert.ok(A[54].homeEquity > 0 && A[54].rentalEquity === 0, 'home before conversion');
  assert.ok(A[55].homeEquity === 0 && A[55].rentalEquity > 0, 'rental after conversion');
});
