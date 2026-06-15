/* ============================================================================
 * engine.js — the year-by-year projection. Orchestrates the account and
 * property entities and the event registry. Pure: simulate(state, scenarioId)
 * takes state in and returns rows[age] = snapshot. No DOM, no globals.
 * ========================================================================== */
import { calcAll } from './tax.js';
import { applyEvent } from './events.js';
import { TaxableAccount, TraditionalAccount, RothAccount, HSAAccount } from './accounts.js';
import { homeFromGlobal, rentalsFromGlobal } from './property.js';

// IRS Uniform Lifetime Table divisors (RMDs), age → divisor.
export const RMD_DIV = {73:26.5,74:25.5,75:24.6,76:23.7,77:22.9,78:22.0,79:21.1,80:20.2,81:19.4,82:18.5,83:17.7,84:16.8,85:16.0,86:15.2,87:14.4,88:13.7,89:12.9,90:12.2,91:11.5,92:10.8,93:10.1,94:9.5,95:8.9,96:8.4,97:7.8,98:7.3,99:6.8,100:6.4};
export function rmdDivisor(age){ if(age<73) return 0; return RMD_DIV[Math.min(age,100)] || 6.4; }

export function simulate(state, scenarioId, now = new Date().getFullYear()){
  const g = state.global, gr = g.gr;
  const rmdStartAge = (now - g.age) >= 1960 ? 75 : 73; // simplified SECURE 2.0

  // entities
  const acct = {
    taxable: new TaxableAccount(g.taxable, g.taxableBasis, gr.taxable),
    trad:    new TraditionalAccount(g.trad, gr.trad),
    roth:    new RothAccount(g.roth, gr.roth),
    hsa:     new HSAAccount(g.hsa, gr.taxable),   // HSA modeled at stock growth rate
  };
  let cash = g.cash;

  // recurring "rate" config mutated by events
  const flows = {
    wages:g.wages, pension:0, ss:g.ss, ssActive:false, spending:g.spending,
    contribTrad:0, contribRoth:0, contribTaxable:0, wdTrad:0, wdRoth:0, wdTaxable:0, rothConvert:0,
    college:null, stateTaxOn:true,
  };
  // the mutable world events operate on
  const world = { flows, home: homeFromGlobal(g), rentals: rentalsFromGlobal(g), one:null, g, age:0 };

  const sc = (state.scenarios||[]).find(s=>s.id===scenarioId) || {events:[]};
  const events = (sc.events||[]).filter(e=>e.on).slice().sort((a,b)=>a.age-b.age);
  const rows = [];

  for(let age=g.age; age<=g.horizon; age++){
    const k = age - g.age;
    const inflF = Math.pow(1+gr.infl/100, k);
    const one = {ordIncome:0, taxFree:0, expense:0, ltcg:0, ltcgBasis:0, cashOut:0};
    world.one = one; world.age = age;

    // apply events in month order; pro-rate continuous "rate" flows across the year
    const yearEvents = events.filter(e=>e.age===age).sort((a,b)=>((a.month||1)-(b.month||1)));
    let ei=0, aWages=0,aPension=0,aSS=0,aSpend=0,aContribT=0,aContribR=0,aContribTax=0,aWdTrad=0,aWdRoth=0,aWdTaxable=0,aConvert=0,aCollege=0;
    for(let m=1;m<=12;m++){
      while(ei<yearEvents.length && Math.max(1,Math.min(12,yearEvents[ei].month||1))===m){ applyEvent(yearEvents[ei], world); ei++; }
      const fr=1/12;
      aWages    += flows.wages*fr;        aPension += flows.pension*fr;
      aSS       += ((flows.ssActive||age>=g.ssAge)?flows.ss:0)*fr;
      aSpend    += flows.spending*inflF*fr;
      aContribT += flows.contribTrad*fr;  aContribR += flows.contribRoth*fr;  aContribTax += flows.contribTaxable*fr;
      aWdTrad   += flows.wdTrad*fr;        aWdRoth  += flows.wdRoth*fr;  aWdTaxable += flows.wdTaxable*fr;
      aConvert  += flows.rothConvert*fr;
      if(flows.college && age>=flows.college.startAge && age<flows.college.startAge+flows.college.years) aCollege += flows.college.annual*inflF*fr;
    }
    while(ei<yearEvents.length){ applyEvent(yearEvents[ei], world); ei++; }  // safety

    // forced RMD on start-of-year traditional balance
    let rmd = 0;
    if(age >= rmdStartAge && acct.trad.balance>0) rmd = acct.trad.balance / rmdDivisor(age);

    // income pieces (month-pro-rated annual totals), capped to start-of-year balances
    const ssThisYear = aSS;
    const contribTrad = Math.min(aContribT, Math.max(0,aWages));
    const contribRoth = aContribR;
    const contribTaxable = aContribTax;
    const taxableWages = Math.max(0, aWages - contribTrad);

    const wdTaxable = Math.min(aWdTaxable, Math.max(0, acct.taxable.balance));
    const gainFrac = acct.taxable.gainFraction();
    const taxGain = wdTaxable*gainFrac + one.ltcg;
    const basisBack = wdTaxable*(1-gainFrac) + one.ltcgBasis;
    const wdTrad = Math.min(aWdTrad, Math.max(0, acct.trad.balance));
    const wdRoth = Math.min(aWdRoth, Math.max(0, acct.roth.balance));
    const convert = Math.min(aConvert, Math.max(0, acct.trad.balance - wdTrad - rmd));

    // primary home: deductible mortgage interest + property tax (uses current value)
    const ownsHome = world.home && world.home.type==='own';
    const mortInt = ownsHome ? world.home.yearInterest() : 0;
    const propTax = ownsHome ? world.home.propertyTax() : 0;

    // rentals: advance the year (mutates), collect net cash + taxable rent
    let rentalCash=0, rentalTaxable=0;
    for(const rt of world.rentals){ const {cash:c, taxable:t} = rt.advanceYear(age, gr.re); rentalCash+=c; rentalTaxable+=t; }

    const inp = {
      age, status:g.status, age65:age>=65, spouseAge65:false, itemize:ownsHome,
      wages:taxableWages, trad401k:wdTrad, rmdInc:rmd, pension:aPension,
      otherOrd:convert + one.ordIncome + rentalTaxable,
      stcg:0, stcgBasis:0, ltcg:taxGain, ltcgBasis:basisBack, qualDiv:0,
      ss:ssThisYear, roth:wdRoth, fiveTwentyNine:0, muniBond:0, hsa:0,
      mortInt, propTax, stateTax:0, charityCash:0, charityNC:0, medical:0, otherDeduct:0,
    };
    const r = calcAll(inp);
    const fedTax = r.fedTaxTotal;
    const caTax  = flows.stateTaxOn ? r.caTaxTotal : 0;
    const tax = fedTax + caTax;

    // expenses
    const living = aSpend;
    let housingCost = 0;
    if(world.home){
      if(world.home.type==='rent'){ const h=world.home; housingCost = h.monthly*12*Math.pow(1+h.esc/100, age-h.startAge); }
      else if(ownsHome){ housingCost = world.home.housingCost(propTax); }
    }
    const collegeCost = aCollege;
    const expenses = living + housingCost + collegeCost + one.expense + one.cashOut;

    // cash flow
    const spendableInflow = taxableWages + aPension + ssThisYear + wdTrad + rmd + wdRoth + wdTaxable + rentalCash + one.taxFree;
    const netCashIncome = spendableInflow + one.ordIncome - tax;
    const cashFlow = netCashIncome - expenses - contribRoth - contribTaxable;

    // apply balance flows (withdrawals/contributions/conversion), then growth
    acct.trad.withdraw(wdTrad); acct.trad.withdraw(rmd); acct.trad.withdraw(convert); acct.trad.contribute(contribTrad);
    acct.roth.withdraw(wdRoth); acct.roth.contribute(convert); acct.roth.contribute(contribRoth);
    acct.taxable.sell(wdTaxable);   // identical gain/basis math; already reflected in tax above
    acct.taxable.invest(contribTaxable);   // post-tax investing: adds to balance + basis
    cash += cashFlow;

    if(ownsHome){ world.home.amortizeYear(); world.home.appreciate(gr.re); }

    acct.taxable.grow(); acct.trad.grow(); acct.roth.grow(); acct.hsa.grow();
    if(cash>0) cash *= (1 + gr.cash/100);

    const homeEquity = ownsHome ? world.home.equity() : 0;
    const rentalEquity = world.rentals.reduce((s,rt)=>s+rt.equity(), 0);
    const netWorth = cash + acct.taxable.balance + acct.trad.balance + acct.roth.balance + acct.hsa.balance + homeEquity + rentalEquity;
    const shortfall = cash < -1;

    rows[age] = {
      age, year:now+k,
      bal:{cash, taxable:acct.taxable.balance, basis:acct.taxable.basis, trad:acct.trad.balance, roth:acct.roth.balance, hsa:acct.hsa.balance},
      homeEquity, rentalEquity, netWorth, shortfall,
      income:{wages:taxableWages, ss:ssThisYear, pension:aPension, wdTrad, rmd, wdRoth, wdTaxable, convert, taxGain, rental:rentalCash},
      fedTax, caTax, tax, stateTaxOn:flows.stateTaxOn,
      expenses, living, housingCost, collegeCost, oneoff:one.expense+one.cashOut,
      cashFlow, grossIncome:r.grossIncome, marg:r.combMargOrd,
    };
  }
  return rows;
}
