/* ============================================================================
 * events.js — the life-event catalog. Each entry is self-contained:
 *   { icon, label, fields, apply(world, params) }
 * `apply` mutates the simulation `world` for the year the event fires:
 *   world = { flows, home, rentals, one, g, age }
 *     flows  — recurring "rate" config (wages, spending, withdrawals, …)
 *     home   — Home instance | {type:'rent',…} | null
 *     rentals— Rental[]
 *     one    — this-year one-offs { ordIncome, taxFree, expense, ltcg, cashOut }
 * Adding a new event = adding one entry here.
 * ========================================================================== */
import { fmt } from './tax.js';
import { Home, Rental, Property } from './property.js';

export const EVENTS = {
  salary: { icon:'💼', label:'Salary change / raise', fields:[['amount','New annual salary ($)',180000]],
    apply:(w,p)=>{ w.flows.wages = +p.amount||0; } },

  job_loss: { icon:'📉', label:'Job loss', fields:[],
    apply:(w)=>{ w.flows.wages = 0; w.flows.contribTrad = 0; w.flows.contribRoth = 0; w.flows.contribTaxable = 0; } },

  retire: { icon:'🏖️', label:'Retire (stop wages)', fields:[],
    apply:(w)=>{ w.flows.wages = 0; w.flows.contribTrad = 0; w.flows.contribRoth = 0; w.flows.contribTaxable = 0; } },

  ss_start: { icon:'🏛️', label:'Start Social Security', fields:[['amount','Annual benefit ($)',40000]],
    apply:(w,p)=>{ w.flows.ss = +p.amount||0; w.flows.ssActive = true; } },

  pension_start: { icon:'🏦', label:'Start pension', fields:[['amount','Annual pension ($)',30000]],
    apply:(w,p)=>{ w.flows.pension = +p.amount||0; } },

  spending: { icon:'🛒', label:'Change spending level', fields:[['amount','Annual living expenses ($)',90000]],
    apply:(w,p)=>{ w.flows.spending = +p.amount||0; } },

  contribute: { icon:'💵', label:'Set yearly contribution / investing', fields:[['account','Account|trad,roth,taxable',''],['amount','Amount ($/yr)',23000]],
    apply:(w,p)=>{ const a = +p.amount||0;
      if(p.account==='trad') w.flows.contribTrad = a;
      else if(p.account==='taxable') w.flows.contribTaxable = a;
      else w.flows.contribRoth = a; } },

  withdraw: { icon:'🏧', label:'Set yearly withdrawal', fields:[['account','Account|taxable,trad,roth',''],['amount','Amount ($/yr)',60000]],
    apply:(w,p)=>{ if(p.account==='trad') w.flows.wdTrad = +p.amount||0;
      else if(p.account==='roth') w.flows.wdRoth = +p.amount||0; else w.flows.wdTaxable = +p.amount||0; } },

  roth_convert: { icon:'🔄', label:'Roth conversion (per yr)', fields:[['amount','Convert trad→Roth ($/yr)',40000]],
    apply:(w,p)=>{ w.flows.rothConvert = +p.amount||0; } },

  college: { icon:'🎓', label:'College tuition', fields:[['annual','Cost ($/yr)',40000],['years','Number of years',4]],
    apply:(w,p)=>{ w.flows.college = {annual:+p.annual||0, years:+p.years||0, startAge:w.age}; } },

  move_state: { icon:'✈️', label:'Move state', fields:[['state','State|CA,no-tax','']],
    apply:(w,p)=>{ w.flows.stateTaxOn = (p.state==='CA'); } },

  rent: { icon:'🏘️', label:'Rent a home', fields:[['monthly','Rent ($/mo)',3500],['esc','Annual increase (%)',3]],
    apply:(w,p)=>{ w.home = {type:'rent', monthly:+p.monthly||0, esc:+p.esc||0, startAge:w.age}; } },

  oneoff_expense: { icon:'💸', label:'One-off expense', fields:[['amount','Amount ($)',30000]],
    apply:(w,p)=>{ w.one.expense += +p.amount||0; } },

  oneoff_income: { icon:'🎁', label:'One-off income', fields:[['amount','Amount ($)',50000],['taxable','Taxable?|yes,no','']],
    apply:(w,p)=>{ if(p.taxable==='yes') w.one.ordIncome += +p.amount||0; else w.one.taxFree += +p.amount||0; } },

  buy_house: { icon:'🏠', label:'Buy a house',
    fields:[['price','Price ($)',900000],['downPct','Down payment (%)',20],['rate','Mortgage rate (%)',6.5],['term','Term (years)',30],['propTaxPct','Property tax (%/yr)',1.1],['insure','Insurance + HOA ($/yr)',3000],['maint','Maintenance ($/yr)',6000]],
    apply:(w,p)=>{
      const price=+p.price||0, downPct=+p.downPct||0, rate=+p.rate||0, term=+p.term||30;
      const down = price*downPct/100, loan = price - down;
      w.one.cashOut += down;
      w.home = new Home({ value:price, price, balance:loan, rate, payment:Property.payment(loan,rate,term),
        propTaxPct:+p.propTaxPct||0, insure:+p.insure||0, maint:+p.maint||0 });
    } },

  sell_house: { icon:'🔑', label:'Sell the house', fields:[],
    apply:(w)=>{ if(w.home && w.home.type==='own'){ const {proceeds,gain}=w.home.sale(w.g.status);
      w.one.cashOut -= proceeds; w.one.ltcg += gain; w.home = null; } } },

  sell_rental: { icon:'🏚️', label:'Sell a rental property', fields:[['which','Which rental # (0 = all)',1]],
    apply:(w,p)=>{
      const which = +p.which||0;
      const sell = rt => { const {proceeds,gain}=rt.sale(); w.one.cashOut -= proceeds; w.one.ltcg += gain; };
      if(which<=0){ w.rentals.forEach(sell); w.rentals.length=0; }
      else if(w.rentals[which-1]){ sell(w.rentals[which-1]); w.rentals.splice(which-1,1); }
    } },

  home_to_rental: { icon:'🔁', label:'Convert home → rental',
    fields:[['rent','Rent you will collect ($/mo)',3500],['esc','Rent increase (%/yr)',3],['landPct','Land % (not depreciable)',20]],
    apply:(w,p)=>{ if(w.home && w.home.type==='own'){
      w.rentals.push(Rental.fromHome(w.home, {rent:+p.rent||0, esc:+p.esc||0, landPct:+p.landPct||0}, w.age));
      w.home = null; } } },

  rental_to_home: { icon:'🔂', label:'Convert rental → primary home', fields:[['which','Which rental # (1, 2, …)',1]],
    apply:(w,p)=>{ const i=(+p.which||1)-1, rt=w.rentals[i];
      if(rt){ w.home = new Home({ value:rt.value, price:rt.costBasis, balance:rt.balance, rate:rt.rate,
        payment:rt.payment, propTaxPct:rt.propTaxPct, insure:rt.insure, maint:rt.maint, priorDep:rt.accumDep });
        w.rentals.splice(i,1); } } },
};

// Back-compat alias: the UI reads .icon/.label/.fields off this map.
export const EV = EVENTS;

// Short human-readable description of a configured event (UI only).
export function describe(ev){
  const p = ev.p||{}, L = EVENTS[ev.type].label;
  switch(ev.type){
    case 'salary': return 'Salary → '+fmt(p.amount);
    case 'ss_start': return 'Social Security '+fmt(p.amount)+'/yr';
    case 'pension_start': return 'Pension '+fmt(p.amount)+'/yr';
    case 'spending': return 'Spending → '+fmt(p.amount)+'/yr';
    case 'contribute': return 'Contribute '+fmt(p.amount)+'/yr to '+({trad:'401k/IRA',roth:'Roth',taxable:'brokerage'}[p.account]||p.account);
    case 'withdraw': return 'Withdraw '+fmt(p.amount)+'/yr from '+({taxable:'brokerage',trad:'401k/IRA',roth:'Roth'}[p.account]||p.account);
    case 'roth_convert': return 'Convert '+fmt(p.amount)+'/yr to Roth';
    case 'college': return 'College '+fmt(p.annual)+'/yr × '+p.years;
    case 'buy_house': return 'Buy house '+fmt(p.price)+' ('+p.downPct+'% down, '+p.rate+'%)';
    case 'rent': return 'Rent '+fmt(p.monthly)+'/mo (+'+p.esc+'%/yr)';
    case 'oneoff_income': return 'Income '+fmt(p.amount)+(p.taxable==='yes'?' (taxable)':' (tax-free)');
    case 'oneoff_expense': return 'Expense '+fmt(p.amount);
    case 'sell_rental': return (+p.which>0) ? 'Sell rental #'+p.which : 'Sell all rentals';
    case 'home_to_rental': return 'Convert home → rental ('+fmt(p.rent)+'/mo)';
    case 'rental_to_home': return 'Convert rental #'+(p.which||1)+' → primary home';
    case 'move_state': return 'Move to '+(p.state==='CA'?'California':'no-income-tax state');
    default: return L;
  }
}

// Apply one event to the world (looks up the registry).
export function applyEvent(ev, world){
  const def = EVENTS[ev.type];
  if (def) def.apply(world, ev.p || {});
}
