# CA Tax Calculator — taxcalcca.com

Free California + Federal income tax calculator covering retirement, capital gains, 401k/Roth IRA, Social Security, deductions, and expense planning.

---

## Infrastructure

### Domain
- **Registrar:** Namecheap
- **Domain:** `taxcalcca.com`
- **Nameservers:** Delegated to Netlify DNS
  ```
  dns1.p02.nsone.net
  dns2.p02.nsone.net
  dns3.p02.nsone.net
  dns4.p02.nsone.net
  ```
- **To manage DNS:** Log in to namecheap.com → Domain List → Manage → Advanced DNS

### Hosting
- **Platform:** Netlify (free tier)
- **Site name:** `ca-tax-calculator`
- **Site ID:** `96d78a66-44aa-495d-bd00-13db7c09de22`
- **Live URLs:**
  - Primary: https://taxcalcca.com
  - Netlify fallback: https://ca-tax-calculator.netlify.app
- **Admin dashboard:** https://app.netlify.com/projects/ca-tax-calculator
- **SSL:** Auto-provisioned by Netlify via Let's Encrypt (renews automatically)

### Analytics
- **Platform:** Google Analytics 4
- **Measurement ID:** `G-EYW9ZRLN1N`
- **Dashboard:** https://analytics.google.com

### Advertising
- **Platform:** Google AdSense (auto-ads enabled)
- **Publisher ID:** `ca-pub-5681396352688184`
- **ads.txt:** Deployed at `taxcalcca.com/ads.txt`
- **Dashboard:** https://adsense.google.com
- **Manual ad slots:** 3 placements in `index.html` — slot IDs are placeholders (`1111111111`, `2222222222`, `3333333333`). Replace with real slot IDs from AdSense → Ads → By ad unit once approved.

---

## How to Update & Deploy

### Prerequisites
- Netlify CLI v17 installed (`npm install -g netlify-cli@17`)
- Netlify auth token stored at `~/Library/Preferences/netlify/config.json` (run `netlify login` once if missing)
- GitHub CLI authenticated (`gh auth status`)

### Files
| File | Purpose |
|---|---|
| `index.html` | Entire calculator — HTML, CSS, and JS in one file |
| `privacy-policy.html` | Required for AdSense approval |
| `ads.txt` | AdSense publisher verification |

### Deploy command
```bash
cd ~/Desktop/ca-tax-site

# Deploy to Netlify
netlify deploy --dir . --prod \
  --auth $(python3 -c "import json; d=json.load(open('/Users/taha_kowsari/Library/Preferences/netlify/config.json')); k=list(d['users'].keys())[0]; print(d['users'][k]['auth']['token'])") \
  --site 96d78a66-44aa-495d-bd00-13db7c09de22
```

### Full update workflow
```bash
cd ~/Desktop/ca-tax-site

# 1. Edit index.html (or other files)

# 2. Commit to GitHub
git add .
git commit -m "describe your change"
git push

# 3. Deploy to Netlify
netlify deploy --dir . --prod --site 96d78a66-44aa-495d-bd00-13db7c09de22
```

### Updating tax brackets each year
All tax logic is in `index.html` inside the `const P = { ... }` object near the top of the `<script>` block. Update:
- `fedBrackets` — federal ordinary income brackets
- `ltcgBrackets` — federal long-term capital gains brackets
- `caBrackets` — California income brackets
- `fedStd` / `caStd` — standard deduction amounts
- `fedStdAge65` — additional standard deduction for 65+
- `niitThresh` — NIIT income threshold
- The page title's tax year label updates automatically from `new Date().getFullYear()`

---

## Calculator Features

### Income types supported
| Income Type | Federal Treatment | CA Treatment |
|---|---|---|
| Wages / Salary | Ordinary brackets | Ordinary brackets |
| Traditional 401k / IRA withdrawals | Ordinary brackets + 10% penalty if < 59.5 | Ordinary + 2.5% CA penalty if < 59.5 |
| Required Minimum Distributions (RMDs) | Ordinary brackets | Ordinary brackets |
| Pension / Annuity | Ordinary brackets | Ordinary brackets |
| Short-Term Capital Gains | Ordinary brackets | Ordinary brackets |
| Long-Term Capital Gains | 0 / 15 / 20% preferential | Ordinary (no CA preferential rate) |
| Qualified Dividends | 0 / 15 / 20% preferential | Ordinary |
| Social Security | 0–85% taxable (income-based) | Exempt |
| Roth IRA distributions | Tax-free | Tax-free |
| 529 / Education savings | Tax-free (qualified) | Tax-free (qualified) |
| Municipal bond interest | Tax-free | Tax-free |
| HSA distributions | Tax-free (qualified) | Tax-free (qualified) |

### Capital gains: cost basis support
Enter sale proceeds + cost basis separately. The calculator:
- Taxes only the gain (proceeds − basis)
- Adds the basis return as tax-free cash in the coverage analysis
- Shows full proceeds as spendable cash

### Deductions
- Standard deduction (2025 amounts, auto-selected if higher)
- Itemized: mortgage interest, SALT (federal cap $10K, no CA cap), charitable, medical (7.5% AGI floor auto-applied)
- Age 65+ additional standard deduction
- Live comparison showing which deduction wins

### Expense coverage analysis
Enter monthly/annual expenses (mortgage, college, cost of living, travel, etc.) and the calculator shows:
- Total cash needed (expenses + taxes)
- Surplus or deficit
- Gross income required from each source (wages, LTCG, 401k) to cover any deficit, using current marginal rates

### Age-aware planning timeline
- **Age < 59.5:** 401k/IRA locked — 10% federal + 2.5% CA early withdrawal penalty applied automatically
- **Age 59.5:** Penalty-free withdrawals unlocked
- **Age 75:** RMDs required (SECURE 2.0 — for those born after 1960)
- Visual timeline displayed on the results page

### Other
- NIIT (3.8% surtax on investment income above $200K single / $250K MFJ)
- California Mental Health Services Tax (1% on income > $1M)
- Social Security taxable portion calculator (provisional income method)
- Filing status: Single, MFJ, Head of Household
- Bracket-level tax breakdown for both federal and CA

---

## Monetization Plan

### Active
- **Google AdSense auto-ads** — publisher ID live, ads.txt deployed. Ads will appear once Google crawls and activates the account (typically within days of approval).
- **3 manual ad placements** — top leaderboard (728×90), sidebar rectangle (300×250), footer banner. Slot IDs need replacing with real IDs from AdSense dashboard.

### Phase 2 — Affiliate links (high priority, high ROI)
AdSense CPCs for tax terms run $1–5. Affiliates pay far more per conversion. Target placements: after the coverage analysis results.

| Partner | Estimated Payout | Program |
|---|---|---|
| TurboTax | $15–30 / referral | Impact.com / CJ Affiliate |
| H&R Block | $15–25 / referral | CJ Affiliate |
| Personal Capital (Empower) | $50–150 / qualified lead | Direct program |
| SmartAsset (advisor matching) | $30–80 / lead | Direct |
| Betterment / Wealthfront | $50–100 / account open | Direct |

### Phase 3 — State expansion
Each state = new SEO keyword cluster at near-zero marginal cost. Same framework, new tax brackets. Priority order:

1. New York / NYC (high income, high taxes, city tax layer)
2. New Jersey (high taxes, dense NYC commuter base)
3. Texas / Florida (no income tax — huge search volume, trivial to add)
4. Washington (new capital gains tax, trending searches)
5. Massachusetts
6. Illinois

### Phase 4 — Premium features ($9–19 one-time or /year)
- Multi-year tax projection with account balance inputs
- Roth conversion optimizer (minimize lifetime tax across years)
- PDF export of results
- Side-by-side scenario comparison

### Phase 5 — Email capture
"Email me my results" → PDF delivery → own the list → tax season affiliate campaigns.

### Phase 6 — Exit
Tax tool sites sell for 30–40× monthly revenue on Flippa / Empire Flippers.

---

## Disclaimer
This calculator is for informational purposes only and does not constitute tax, legal, or financial advice. Always consult a qualified CPA or financial advisor.
