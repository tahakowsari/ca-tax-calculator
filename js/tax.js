/* ============================================================================
 * tax.js — pure CA + Federal tax math (2025 brackets). No DOM, no globals.
 * Single source of truth, importable by the browser UI and by node tests.
 * ========================================================================== */

// ─── 2025 TAX PARAMETERS ────────────────────────────────────────────────────
export const P = {
  single:{
    fedStd:15000, fedStdAge65:2000, caStd:5363,
    fedBrackets:[[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
    ltcgBrackets:[[48350,0],[533400,.15],[Infinity,.20]],
    caBrackets:[[10756,.01],[25499,.02],[40245,.04],[55866,.06],[70606,.08],[360659,.093],[432787,.103],[721314,.113],[Infinity,.123]],
    niitThresh:200000, ssT1:25000, ssT2:34000
  },
  mfj:{
    fedStd:30000, fedStdAge65:1600, caStd:10726,
    fedBrackets:[[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    ltcgBrackets:[[96700,0],[600050,.15],[Infinity,.20]],
    caBrackets:[[21512,.01],[50998,.02],[80490,.04],[111732,.06],[141212,.08],[721318,.093],[865574,.103],[1442628,.113],[Infinity,.123]],
    niitThresh:250000, ssT1:32000, ssT2:44000
  },
  hoh:{
    fedStd:22500, fedStdAge65:2000, caStd:10726,
    fedBrackets:[[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
    ltcgBrackets:[[64750,0],[566700,.15],[Infinity,.20]],
    caBrackets:[[21512,.01],[50998,.02],[80490,.04],[111732,.06],[141212,.08],[721318,.093],[865574,.103],[1442628,.113],[Infinity,.123]],
    niitThresh:200000, ssT1:25000, ssT2:34000
  }
};

// ─── FORMAT HELPERS ─────────────────────────────────────────────────────────
export const fmt    = n => '$' + Math.round(Math.abs(n)).toLocaleString();
export const fmtS   = n => (n < 0 ? '-' : '') + fmt(n);
export const fmtPct = n => (n*100).toFixed(1) + '%';

// ─── TAX PRIMITIVES ─────────────────────────────────────────────────────────
export function bracketTax(income, brackets) {
  let tax = 0, prev = 0, detail = [];
  for (const [top, rate] of brackets) {
    if (income <= prev) break;
    const inB = Math.min(income, top === Infinity ? income + 1 : top) - prev;
    tax += inB * rate;
    detail.push({ rate, low: prev, high: top, inB, tax: inB * rate });
    prev = top === Infinity ? income : top;
    if (top === Infinity) break;
  }
  return { tax, detail };
}

export function margRate(income, brackets) {
  let prev = 0;
  for (const [top, rate] of brackets) { if (income <= top) return rate; prev = top; }
  return brackets[brackets.length - 1][1];
}

export function ltcgMargRate(ordIncome, prefIncome, brackets) {
  return margRate(ordIncome + prefIncome, brackets);
}

export function ssTaxable(ss, agi, p) {
  const combined = agi + ss * 0.5;
  if (combined <= p.ssT1) return 0;
  if (combined <= p.ssT2) return Math.min(ss * 0.5, (combined - p.ssT1) * 0.5);
  const a = Math.min(ss * 0.5, (p.ssT2 - p.ssT1) * 0.5);
  const b = Math.min(ss * 0.85 - a, (combined - p.ssT2) * 0.85);
  return Math.min(ss * 0.85, a + b);
}

// ─── FULL FED + CA CALCULATION ──────────────────────────────────────────────
// inp: age, status, age65, spouseAge65, itemize, wages, trad401k, rmdInc,
//   pension, otherOrd, stcg, stcgBasis, ltcg, ltcgBasis, qualDiv, ss, roth,
//   fiveTwentyNine, muniBond, hsa, mortInt, propTax, stateTax, charityCash,
//   charityNC, medical, otherDeduct
export function calcAll(inp) {
  const p = P[inp.status];
  const age = inp.age;
  const canAccess = age >= 59.5;
  const penFed = canAccess ? 0 : 0.10;
  const penCA  = canAccess ? 0 : 0.025;
  const earlyAccts = inp.trad401k + inp.rmdInc;
  const ordIncome = inp.wages + inp.trad401k + inp.rmdInc + inp.pension + inp.stcg + inp.otherOrd;
  const prefIncome = inp.ltcg + inp.qualDiv;
  const taxFreeIncome = inp.roth + inp.fiveTwentyNine + inp.muniBond + inp.hsa;
  const ssT = ssTaxable(inp.ss, ordIncome + prefIncome, p);

  // ─── FEDERAL ───
  const fedAGI = ordIncome + prefIncome + ssT;
  let fedStd = p.fedStd;
  if (inp.age65) fedStd += p.fedStdAge65;
  if (inp.status === 'mfj' && inp.spouseAge65) fedStd += p.fedStdAge65;
  const saltFed = inp.itemize ? Math.min(10000, inp.propTax + inp.stateTax) : 0;
  const medFed  = inp.itemize ? Math.max(0, inp.medical - fedAGI * 0.075) : 0;
  const fedItem = inp.itemize ? inp.mortInt + saltFed + inp.charityCash + inp.charityNC + medFed + inp.otherDeduct : 0;
  const fedDeduct = inp.itemize ? Math.max(fedItem, fedStd) : fedStd;
  const fedTaxOrd  = Math.max(0, ordIncome + ssT - fedDeduct);
  const fedTaxPref = Math.max(0, prefIncome - Math.max(0, fedDeduct - (ordIncome + ssT)));
  const { tax: fedOrdTax } = bracketTax(fedTaxOrd, p.fedBrackets);

  let fedPrefTax = 0, prevT = 0;
  for (const [top, rate] of p.ltcgBrackets) {
    if (fedTaxPref <= 0) break;
    const lo2 = Math.max(prevT, fedTaxOrd);
    const hi2 = Math.min(top === Infinity ? fedTaxOrd + fedTaxPref + 1 : top, fedTaxOrd + fedTaxPref);
    if (hi2 > lo2) fedPrefTax += (hi2 - lo2) * rate;
    prevT = top === Infinity ? fedTaxOrd + fedTaxPref : top;
    if (top === Infinity) break;
  }

  const niitBase = Math.min(prefIncome, Math.max(0, fedAGI - p.niitThresh));
  const niit = niitBase * 0.038;
  const earlyPenFedAmt = penFed * earlyAccts;
  const fedTaxTotal = fedOrdTax + fedPrefTax + niit + earlyPenFedAmt;
  const fedMarg = margRate(fedTaxOrd, p.fedBrackets);

  // ─── CALIFORNIA (cap gains = ordinary; SS exempt) ───
  const caOrd = inp.wages + inp.trad401k + inp.rmdInc + inp.pension + inp.stcg + inp.otherOrd + inp.ltcg + inp.qualDiv;
  const caAGI = caOrd;
  const saltCA   = inp.itemize ? inp.propTax : 0;
  const medCA    = inp.itemize ? Math.max(0, inp.medical - caAGI * 0.075) : 0;
  const caItem   = inp.itemize ? inp.mortInt + saltCA + inp.charityCash + inp.charityNC + medCA + inp.otherDeduct : 0;
  const caDeduct = inp.itemize ? Math.max(caItem, p.caStd) : p.caStd;
  const caTaxInc = Math.max(0, caAGI - caDeduct);
  const { tax: caOrdTax } = bracketTax(caTaxInc, p.caBrackets);
  const caMHST = Math.max(0, caTaxInc - 1000000) * 0.01;
  const earlyPenCAAmt = penCA * earlyAccts;
  const caTaxTotal = caOrdTax + caMHST + earlyPenCAAmt;
  const caMarg = margRate(caTaxInc, p.caBrackets) + (caTaxInc > 1000000 ? 0.01 : 0);

  const combinedTax = fedTaxTotal + caTaxTotal;
  const basisReturn = (inp.ltcgBasis || 0) + (inp.stcgBasis || 0);
  const grossIncome = ordIncome + prefIncome + inp.ss + taxFreeIncome;
  const combMargOrd = fedMarg + caMarg;

  return {
    fedTaxTotal, caTaxTotal, combinedTax, grossIncome,
    fedMarg, caMarg, combMargOrd, niit,
    fedAGI, caAGI, fedDeduct, caDeduct, ssT, basisReturn,
    ordIncome, prefIncome, taxFreeIncome
  };
}
