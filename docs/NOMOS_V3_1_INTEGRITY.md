# NOMOS 3.1: statistical integrity and real-world readiness

This release makes NOMOS state only what its evidence supports. A point estimate that clears a limit is no longer reported as a pass. Users can evaluate their own scored data locally. The audited bugs are fixed with regression tests, and the deployment surface is hardened.

## 1. Uncertainty-aware feasibility

### What is estimated

Every classification limit depends on two measured rates. TPR is `tp / (tp + fn)`, estimated from the positive records, and FPR is `fp / (fp + tn)`, estimated from the negative records. Expected precision at prevalence π is a function of both, `π·TPR / (π·TPR + (1 − π)·FPR)`. Latency, cost and throughput are not estimated from classification data. They are checked as point values with their stated provenance (see Limitations).

### Interval method

- **Clopper–Pearson exact binomial intervals** (`src/core/statistics.ts`). Coverage is at least the nominal level for every true rate and sample size. That includes zero-event (`0/n`) and all-event (`n/n`) samples, where Wald intervals collapse and Wilson can under-cover. The method is conservative, which is the right direction for a feasibility claim. The quantile is found by bisection on the regularized incomplete beta function, which cannot miss the root because the function is monotone. Both edges use exact closed forms.
- **Simultaneous coverage.** A verdict uses the TPR and FPR intervals together, so NOMOS applies a Bonferroni adjustment. Two intervals at 1 − α/2 (97.5% each for 95%) give at least 95% joint coverage of the rectangle `[TPR_lo, TPR_hi] × [FPR_lo, FPR_hi]`. Bonferroni needs no independence assumption. (TPR and FPR come from disjoint records, so the guarantee is conservative.)
- **Optional family-wide coverage.** Selecting *All configurations together* widens the family to `2 × N` intervals, 54 for the demo. Coverage then holds simultaneously across every configuration, which protects against picking the luckiest of many thresholds. The default is per-configuration, and every record states which scope applied.
- **Precision bounds by monotonicity.** For π ∈ (0, 1), precision strictly increases in TPR and strictly decreases in FPR. Its extremes over the rectangle are therefore at two corners: the worst at `(TPR_lo, FPR_hi)` and the best at `(TPR_hi, FPR_lo)`. The precision range inherits the rectangle's joint coverage without spending more of the error budget. It uses the existing `precisionReference`, which is underflow-safe.

### Classification

Each limit gets a pessimistic and an optimistic value. For a configuration:

| Status | Rule |
|---|---|
| **Robustly feasible** | Every limit holds at its pessimistic value. Deterministic limits hold at their known values. |
| **Passes on estimate only** | Every point estimate passes, but at least one pessimistic value fails. |
| **Misses on estimate, could pass** | Some estimate fails, but every limit holds at its optimistic value. |
| **Fails the mission** | Some limit fails even at its optimistic value, or a known deterministic value fails. |
| **Evidence unavailable** | Nothing fails definitively, but some limit has no evidence (for example, latency on imported data, or a one-class sample). |

Point-estimate feasibility is kept as its own result (`feasibleIds`, `pointEstimateFeasible`). The recommendation prefers robust configurations. When it falls back to an estimate, it says so (`recommendedBasis: 'estimate'`, button text *Select the best estimate*).

### The audit case

| Balanced / 0.45 at 10% prevalence | Estimate | 95% simultaneous range | Limit | Verdict |
|---|---|---|---|---|
| Expected precision | 55.32% | 48.79% – 61.83% | ≥ 55% | not confirmed |
| Recall | 98.29% | 95.70% – 99.54% | ≥ 95% | confirmed |
| False-positive rate | 8.82% | 6.83% – 11.16% | ≤ 10% | not confirmed |

These come from 293 fraud and 907 legitimate records. The configuration is now **Passes on estimate only**, and the demo reads **0 / 27 robustly feasible · 1 passes on estimate**. It no longer receives an unconditional pass. The same rates measured on 100× the data would be robust (see `uncertainty.test.ts`).

### Where users see it

- **Map:** points are coloured by status, and an amber dashed ring marks *estimate only*. The selected point draws its confidence rectangle and a red **worst case** corner. The rule is visual: robust means the whole box sits inside the shaded region. *All ranges* draws every point's box.
- **Rail:** *Confidence check* gives a one-sentence justification (`src/core/explain.ts`). For example: *"The measured expected precision of 55.32% meets the minimum of 55.00%, but the evaluation sample cannot rule out 48.79%. 1 other limit is also unconfirmed."* The expandable detail shows a range bar (range, estimate, limit, failing side), the estimate, range, requirement and worst case for each limit, plus sample sizes, method, per-interval level and assumptions. Confidence (90/95/99%) and coverage scope are adjustable.
- **Evidence drawer and export:** the point-estimate check and the statistical verdict are reported separately. The export schema is now `3.1`. The ambiguous `feasible` field is removed and replaced by `pointEstimateFeasible`, `robustlyFeasible`, `statisticalStatus`, `unconfirmed` and an `uncertainty` block.

## 2. Browser CSV import

`src/core/csv.ts` and `src/components/ImportDialog.tsx`.

- **Columns:** a label (`0/1`, `true/false`) and a probability in [0, 1] are required. A model identifier (long format) and a row identifier are optional. Common column names are detected, and every mapping can be changed.
- **Validation, with line numbers:**
  - empty files, header-only files and non-UTF-8 files
  - single-column files caused by the wrong delimiter (comma, semicolon, tab and pipe are auto-detected and selectable)
  - empty or duplicate header names, and the same column mapped to two roles
  - rows with the wrong field count, plus malformed or unclosed quotes
  - invalid labels and invalid probabilities, with a hint for logits and percentages
  - empty model or row identifiers, and duplicate row identifiers (per model)
  - one-class datasets or models
  - files over 20 MB, 500,000 rows or 12 models

  Exact duplicate rows without an ID column, and classes under 30 records, produce warnings.
- **Flow:** choose a file, review the delimiter, mapping, first five rows, errors, warnings and per-model class counts, then confirm. Evaluation runs only after confirmation.
- **Evaluation** uses the existing `evaluateOperatingPoint` / `calculateConfusionMatrix` at 19 thresholds (0.05–0.95). A test converts the bundled fixture to long format and imports it. It reproduces the Python evaluator's confusion counts exactly for all 27 fixture configurations.
- **No fabrication.** Imported candidates have `p95LatencyMs: null`, `costPer1kUsd: null`, no performance data, and `unknown` provenance for latency and cost. No target prevalence is set; precision uses each model's sample prevalence, and the UI labels it *Sample … · no target set*. By default, the confirmation step turns off latency, cost and throughput limits. If they are kept, they resolve to *Evidence unavailable* and never to a pass.
- **Local only.** The file is read, hashed (Web Crypto, with a tested portable SHA-256 fallback) and evaluated in the tab. The import code performs no network I/O, and an e2e test asserts the import journey makes no non-GET request. Exports record the file name, size, mapping and SHA-256.

## 3. Audit bugs: reproduction and fixes

Each bug was reproduced before it was fixed. The parser and export bugs were reproduced with a Vitest probe, and the keyboard bugs in Chromium with Playwright.

| Bug | Reproduction | Fix | Regression tests |
|---|---|---|---|
| `$3,500` rejected | Probe threw *Unrecognized requirement* | Number grammar accepts complete thousands groups; `35,00` is still rejected | `mission.test.ts`, e2e compiler test |
| "catch 95% of fraud" rejected | Probe threw | Comparator optional for catch/detect/flag … of (all) fraud (cases/transactions) | `mission.test.ts` |
| "latency under 0.05 s" rejected | Probe threw | `s`/`sec`/`seconds` converted to ms without binary noise; the conversion is announced in the preview | `mission.test.ts`, e2e |
| Precision handle arrows reversed | Chromium: ArrowRight moved the handle from x = 556 to 546 (left) | Arrows follow on-screen motion; Up/Down follow the value (`keyDirection`) | e2e map test |
| Requests marker stuck | Chromium: two ArrowUps from 2 stayed at 2 | `stepCount` moves at least one unit and steps up from 0 | `instruments.test.ts` (property), e2e |
| Daily volume exported as `monthlyRequests` | Probe: `{"monthlyRequests":1000000,…}` | Always `requestsPerDay` | `export.test.ts` |
| Missing-prevalence defaults (App 10%, map 0%) | Code inspection: two different fallbacks | One resolver, `resolvePrevalence`: target, otherwise the evaluation's sample prevalence, labelled as such | `uncertainty.test.ts` |
| Inconsistent tolerances (1e-9 absolute vs 64 ulp; `<` vs `<=`) | Code inspection | One `limitTolerance` rule for every gate and mode; instrument verification uses `<=` | `uncertainty.test.ts` |

## 4. Security and deployment

- **Mission endpoint** (`server/mission.mjs`):
  - It is off unless a key and model are configured. `NOMOS_PUBLIC_DEMO=1` turns it off.
  - It is also off when listening beyond loopback, unless the operator sets `NOMOS_LLM_ALLOW_REMOTE=1`.
  - It requires `Content-Type: application/json` (415), rejects bodies over 8 KiB by declared length and by bytes actually received (413), and parses paths so query strings cannot bypass routing.
  - Limits: 6 requests per minute per client and 200 per day per server (429 with `Retry-After`), at most 2 provider calls at once, and `max_tokens` on the provider request.
  - These are **cost controls, not authentication**. NOMOS does not use CORS or Origin as access control. The client shows a warning and falls back to the offline parser on 429.
- **Public static demo:** `npm run build:static` bakes in `VITE_NOMOS_OFFLINE_ONLY=1`. The fetch path is removed at build time, and `npm run check:static` fails if `/api/mission/parse` appears in the bundle.
- **Headers:**
  - `server/start.mjs` and `public/_headers` (for Netlify and Cloudflare Pages) send a strict CSP with no inline scripts or styles, plus `frame-ancestors 'none'`, nosniff, `Referrer-Policy: no-referrer`, a Permissions-Policy, COOP and CORP.
  - Hashed `/assets/*` files are `immutable` for a year. HTML is `no-cache`. API and 404 responses are `no-store`.
  - The e2e suite checks the headers and fails on any CSP console violation.
- **CI:** Ubuntu, Windows and macOS run the full `npm run check` and `check:static`. A container job builds the image and checks headers and the disabled endpoint. Pixel snapshots are compared on Windows only, where they were recorded; every functional and accessibility assertion runs everywhere.

## 5. Verification

`npm run check`:
- data fixture regeneration (byte-identical)
- ESLint and TypeScript
- 84 Vitest tests in 12 files: interval math against exact binomial tails, published tables and exact coverage enumeration; status semantics as properties; CSV import; server hardening
- production build
- 13 Chromium journeys, including import, validation, the audit regressions, headers and three axe passes

`npm run check:static` verifies the offline-only bundle. Results are in the release notes for this change.

## 6. Limitations and remaining risks

- **Representativeness.** Intervals quantify sampling error only. They assume evaluation records are independent and drawn from the deployment population, conditional on class. They cannot detect label noise, leakage, temporal drift or a shift in the class-conditional rates. The prevalence adjustment assumes those rates transfer (`RATE_STABILITY`).
- **Threshold selection.** The default per-configuration coverage does not account for choosing one configuration out of many after looking at the data. Use *All configurations together* for that guarantee. It is conservative: Bonferroni ignores the strong correlation between neighbouring thresholds.
- **Conservatism.** Clopper–Pearson plus Bonferroni over-covers. With small samples, robust feasibility is hard to reach by design. A *Passes on estimate only* verdict means the evidence is insufficient, not that the configuration is bad.
- **Deterministic limits.** P95 latency, cost and throughput have no uncertainty model. The demo latency is synthetic and the prices are assumptions. A *robustly feasible* verdict covers the classification rates only, and the UI and the export both say so.
- **Imported thresholds** are a fixed 0.05 grid. Scores must already be probabilities in [0, 1]; calibration is not checked. Imports are capped at 20 MB, run on the main thread, and can pause the tab briefly on large files.
- **The fixture** is still synthetic (1,200 records). Its demo story is now "the estimate passes but is not proven", not "it passes".
- **Rate limiting** is in-memory and per process. It resets on restart and is not shared across replicas. Behind a proxy, set `NOMOS_TRUST_PROXY=1` only if the proxy overwrites `X-Forwarded-For`. Anyone who can reach an enabled endpoint can spend its budget up to those limits. For anything public, use the static build or `NOMOS_PUBLIC_DEMO=1`.
