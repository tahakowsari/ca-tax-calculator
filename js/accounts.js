/* ============================================================================
 * accounts.js — financial account entities. Each knows its balance, growth
 * rate, and how money moves in/out. Tax treatment of a withdrawal is decided
 * by the engine (which aggregates all income and calls the tax module once).
 * ========================================================================== */

export class Account {
  constructor(balance = 0, rate = 0){ this.balance = balance; this.rate = rate; }
  grow(){ this.balance *= (1 + this.rate / 100); }
  // Largest amount actually available to take out this step.
  available(amount){ return Math.min(amount, Math.max(0, this.balance)); }
}

// Brokerage / taxable: withdrawals return basis tax-free, only the gain is taxed.
export class TaxableAccount extends Account {
  constructor(balance = 0, basis = 0, rate = 0){ super(balance, rate); this.basis = basis; }
  gainFraction(){
    return this.balance > 0 ? Math.max(0, Math.min(1, (this.balance - this.basis) / this.balance)) : 0;
  }
  // Reduce by `amount` of proceeds; returns the taxable gain and tax-free basis returned.
  sell(amount){
    const a = this.available(amount);
    const gf = this.gainFraction();
    const gain = a * gf, basisBack = a * (1 - gf);
    this.balance -= a;
    this.basis = Math.max(0, this.basis - basisBack);
    return { amount: a, gain, basisBack };
  }
  // Invest post-tax cash: adds to balance and (dollar-for-dollar) to basis.
  invest(amount){ this.balance += amount; this.basis += amount; }
  // basis does not grow with the market
  grow(){ this.balance *= (1 + this.rate / 100); }
}

// Pre-tax 401k / IRA: withdrawals are ordinary income (penalty handled by tax module via age).
export class TraditionalAccount extends Account {
  withdraw(amount){ const a = this.available(amount); this.balance -= a; return a; }
  contribute(amount){ this.balance += amount; }
}

// Roth: contributions and qualified withdrawals are tax-free.
export class RothAccount extends Account {
  withdraw(amount){ const a = this.available(amount); this.balance -= a; return a; }
  contribute(amount){ this.balance += amount; }
}

// HSA: grows tax-free (modeled at the stock growth rate by the engine).
export class HSAAccount extends Account {}

// Margin loan: borrowed against the brokerage. Proceeds are NOT taxable income
// (it's debt). Interest accrues onto the balance each year and is deductible as
// investment-interest expense. A liability — reduces net worth.
export class MarginLoan {
  constructor(balance = 0, rate = 0){ this.balance = balance; this.rate = rate; }
  // Accrue one year of interest onto the balance; returns the interest amount.
  accrueYear(){ const i = this.balance * this.rate / 100; this.balance += i; return i; }
}
