/* ============================================================================
 * property.js — real-estate entities. A Property handles mortgage
 * amortization + appreciation. Home adds primary-residence sale rules;
 * Rental adds rent income and straight-line depreciation.
 * ========================================================================== */

export class Property {
  constructor({ value, balance, rate, payment, propTaxPct, insure, maint, price, priorDep = 0 }){
    Object.assign(this, { value, balance, rate, payment, propTaxPct, insure, maint, price, priorDep });
  }
  // Mortgage interest paid over the next 12 months on the current balance (no mutation).
  yearInterest(){
    const r = this.rate / 100 / 12, pay = this.payment;
    let b = this.balance, sum = 0;
    for (let m = 0; m < 12 && b > 0; m++){ const i = b * r; sum += i; b = Math.max(0, b - (pay - i)); }
    return sum;
  }
  propertyTax(){ return this.value * this.propTaxPct / 100; }
  amortizeYear(){
    const r = this.rate / 100 / 12;
    let b = this.balance;
    for (let m = 0; m < 12 && b > 0; m++){ const i = b * r; b = Math.max(0, b - (this.payment - i)); }
    this.balance = b;
  }
  appreciate(rePct){ this.value *= (1 + rePct / 100); }
  equity(){ return Math.max(0, this.value - this.balance); }

  // Build a payment from price/down/rate/term (for buy events).
  static payment(loan, ratePct, termYears){
    const mr = ratePct / 100 / 12, n = Math.max(1, termYears) * 12;
    return (loan > 0 && mr > 0) ? loan * mr / (1 - Math.pow(1 + mr, -n)) : (loan > 0 ? loan / n : 0);
  }
}

export class Home extends Property {
  constructor(o){ super(o); this.type = 'own'; }
  housingCost(propTax){ return this.payment * 12 + (propTax ?? this.propertyTax()) + this.insure + this.maint; }
  // Sale: §121 exclusion plus recapture of any depreciation taken while it was a rental.
  sale(status){
    const excl = status === 'mfj' ? 500000 : 250000;
    const gain = Math.max(0, (this.value - this.price) - excl) + (this.priorDep || 0);
    return { proceeds: this.equity(), gain };
  }
}

export class Rental extends Property {
  constructor(o){
    super(o);
    this.type = 'rental';
    this.rent = o.rent; this.esc = o.esc; this.startAge = o.startAge;
    this.costBasis = o.costBasis; this.depAnnual = o.depAnnual;
    this.depYearsLeft = o.depYearsLeft; this.accumDep = o.accumDep;
  }
  rentYear(age){ return this.rent * 12 * Math.pow(1 + this.esc / 100, age - this.startAge); }
  depreciation(){ return this.depYearsLeft > 0 ? this.depAnnual * Math.min(1, this.depYearsLeft) : 0; }
  // Process one year: returns {cash, taxable}; mutates balance/value/depreciation state.
  advanceYear(age, rePct){
    const rentYr = this.rentYear(age);
    const intSum = this.yearInterest();
    const opEx = this.propertyTax() + this.insure + this.maint;
    const dep = this.depreciation();
    const cash = rentYr - (this.payment * 12 + opEx);      // depreciation is non-cash
    const taxable = rentYr - (intSum + opEx + dep);        // incl. depreciation deduction
    this.accumDep += dep; this.depYearsLeft = Math.max(0, this.depYearsLeft - 1);
    this.amortizeYear(); this.appreciate(rePct);
    return { cash, taxable };
  }
  // Sale: gain over depreciation-adjusted basis (recapture approximated as LTCG).
  sale(){
    const adjBasis = Math.max(0, this.costBasis - this.accumDep);
    return { proceeds: this.equity(), gain: Math.max(0, this.value - adjBasis) };
  }
  // Build a Rental from a home being converted to a rental.
  static fromHome(home, { rent, esc, landPct }, age){
    const costBasis = home.price > 0 ? home.price : home.value;
    const depAnnual = costBasis * (1 - (landPct || 0) / 100) / 27.5;
    const prior = home.priorDep || 0;
    return new Rental({
      value: home.value, balance: home.balance, rate: home.rate, payment: home.payment,
      propTaxPct: home.propTaxPct, insure: home.insure, maint: home.maint,
      rent, esc, startAge: age, costBasis, depAnnual,
      depYearsLeft: depAnnual > 0 ? Math.max(0, 27.5 - prior / depAnnual) : 0, accumDep: prior,
    });
  }
}

// Build the initial owned-home (or null) from the global "current home" inputs.
export function homeFromGlobal(g){
  if (!(g.home && g.home.value > 0)) return null;
  const h = g.home;
  const payment = Property.payment(h.balance, h.rate, h.term);
  return new Home({ value: h.value, price: h.value, balance: h.balance, rate: h.rate,
                    payment, propTaxPct: h.propTaxPct, insure: h.insure, maint: h.maint });
}

// Build the initial rental list from the global rentals inputs.
export function rentalsFromGlobal(g){
  return (g.rentals || []).filter(r => r.value > 0).map(r => {
    const payment = Property.payment(r.balance, r.rate, r.term);
    const costBasis = r.costBasis > 0 ? r.costBasis : r.value;
    const depAnnual = costBasis * (1 - (r.landPct || 0) / 100) / 27.5;
    const owned = r.yearsOwned || 0;
    return new Rental({ value: r.value, balance: r.balance, rate: r.rate, payment,
      rent: r.rent, esc: r.esc, propTaxPct: r.propTaxPct, insure: r.insure, maint: r.maint,
      startAge: g.age, costBasis, depAnnual,
      depYearsLeft: Math.max(0, 27.5 - owned), accumDep: depAnnual * Math.min(owned, 27.5) });
  });
}
