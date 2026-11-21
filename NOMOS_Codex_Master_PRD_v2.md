# NOMOS — The Analog Brain for AI
## Master Product Requirements Document and Autonomous Build Specification

**Version:** 2.0 — Genuine Nomographic Resurrection  
**Date:** 21 November 2026  
**Status:** Build-ready MVP specification  
**Audience:** Codex / autonomous software-engineering agent, hackathon team, technical reviewers  
**Product category:** Mathematically authentic nomographic computing + evidence-based ML deployment calibration  
**Tagline:** *We brought back the computer that ran on geometry.*

---

# 0. READ THIS FIRST — INSTRUCTIONS TO CODEX

You are the lead full-stack engineer, ML engineer, designer, test engineer and release engineer for NOMOS. Build the **working end-to-end application** described in this document, not a marketing landing page, static prototype, or nonfunctional dashboard.

**Execution contract:**
1. Inspect the repository and existing tooling before making changes. If empty, scaffold the project.
2. Implement the critical path first: reproducible dataset -> evaluated operating points -> constraint solver -> interactive instrument -> export -> tests.
3. Use **real computations** on supplied or generated synthetic labeled data. Do not hardcode displayed performance metrics as if measured. Seeded synthetic data is acceptable for the demo if labeled clearly as synthetic.
4. Distinguish measured metrics, estimated metrics, and illustrative/demo metrics in the UI and exported artifacts.
5. The AI mission parser must produce a validated schema; deterministic code, not the LLM, decides feasibility and Pareto optimality.
6. **NONNEGOTIABLE V2 CHANGE:** Implement real calibrated alignment nomograms whose intersection coordinates compute derived quantities. The F1 reciprocal-scale nomogram and a cost multiplication nomogram are P0. Never substitute a decorative line whose answer is calculated elsewhere. Arbitrary four-objective empirical surfaces still cannot be represented by one exact straightedge.
7. Prioritize a reliable, polished, interactive 3-minute judge demo. Include graceful fallback when no LLM API key is configured.
8. Run tests, lint, typecheck, and a production build. Fix failures before declaring completion.
9. Include README, environment template, seed data, reproducible commands, architecture notes, and a demo script.
10. Do not ask for clarification on nonblocking design choices. Document reasonable assumptions in `docs/DECISIONS.md`.
11. If a feature cannot be implemented in the available environment, ship a functional deterministic fallback, clearly document the limitation, and never represent it as complete.
12. After each phase, record what was implemented, commands run, and outstanding blockers in `docs/BUILD_LOG.md`.

**Definition of success:** A judge can directly manipulate a *mathematically calibrated* straightedge to calculate F1 and total inference cost geometrically, compare each geometry-derived result against an independently implemented numerical reference, connect the instruments to evaluated model operating points, change mission constraints, see feasible and infeasible configurations, and export a reproducible decision. The experience must work offline without an LLM key.

---

# 1. EXECUTIVE SUMMARY — VERSION 2

NOMOS resurrects **nomography as a working computing method**, not just an interface style. Pre-digital alignment nomograms encode equations as carefully calibrated graphical scales: place a straightedge through two known values, and the intersection with a third scale produces the unknown value. NOMOS rebuilds this mechanism as an interactive SVG instrument, validates it against independent arithmetic, and connects it to real machine-learning evaluation data.

The initial use case is binary fraud classification. Model predictions and ground-truth labels yield precision and recall for each candidate model/threshold. A **genuine three-axis reciprocal-scale F1 nomogram** computes F1 from those measured inputs. A second **genuine logarithmic cost nomogram** computes total inference expense from requests and per-request cost. A separate deterministic constraint solver checks recall, precision, p95 latency and cost; it does **not** pretend that one line can exactly solve an arbitrary four-objective optimization.

**Three product layers:** (1) Empirical ML evaluator (measure inputs); (2) Resurrected nomographic computing engine (calculate derived outputs through geometric intersections); (3) Mission and envelope engine (decide which evaluated operating points meet requirements). An optional LLM parses human instructions into confirmed structured constraints.

**Primary demo:** choose model and threshold -> observe precision/recall endpoints -> read F1 at the straightedge's central crossing -> verify geometric/numeric agreement -> set monthly requests and unit price -> read total cost on a second instrument -> tighten latency -> see safe candidates disappear or reappear -> export the chosen configuration and calculation provenance.

**Product honesty:** A working F1 nomogram is not by itself a defensible commercial product. The value proposition is the combination of transparent graphical calculation, empirical evidence, constraint navigation, and an unforgettable tactile demo. Treat broader commercial claims as hypotheses to validate.

# 2. PROBLEM, AUDIENCE AND VALUE

## 2.1 Problem statement

ML deployment decisions are distributed across model evaluation plots, experiment trackers, configuration files and operational requirements. Engineers can misinterpret trade-offs, select dominated configurations, overlook latency or cost requirements, and struggle to explain why a particular threshold/model was chosen.

## 2.2 Primary users

- **ML engineer:** Selects a model and decision threshold meeting technical constraints.
- **ML platform engineer:** Verifies latency/cost limits and exports deployment configuration.
- **Product/risk owner:** Expresses business requirements in plain language and inspects their consequences.
- **Hackathon judge:** Operates the instrument and witnesses a visible feasible-to-infeasible transition.

## 2.3 Jobs to be done

- “Given precision >= 0.80, recall >= 0.90, p95 latency <= 100 ms, and cost <= $5/1k, show feasible options.”
- “Which options are Pareto-efficient, and why is the current selection dominated?”
- “What happens if the latency budget tightens to 50 ms?”
- “If nothing satisfies the mission, tell me which constraints block feasibility and what trade-offs could restore it.”
- “Export a selected configuration and its evidence for review.”

## 2.4 Out of scope for MVP

Live production traffic routing; automated deployment to cloud infrastructure; autonomous changes to production models; claims of regulatory compliance; generic support for all ML tasks; real-time drift detection; actual aircraft/ballistics operation; medical decisions; arbitrary equation-to-nomogram compilation; physical hardware integration.

# 3. HISTORICAL FOUNDATION AND RESURRECTION STANDARD

Nomograms are graphical calculators: mathematical functions are encoded in the geometry of scales so a straightedge can yield a result. NOMOS resurrects the **mechanism**, not just the aesthetic. A calculator panel that computes F1 in JavaScript and draws a coincident line afterward **does not satisfy** the resurrection requirement.

**Required proof:** given endpoint coordinates, the app must derive the intersection with the third axis and invert the calibrated scale to obtain the answer; an independent reference formula is used *only for verification and error display*. Show a switchable “GEOMETRY / NUMERICAL CHECK” panel. Users can inspect the equation, axis transforms, actual intersection coordinate, calculated value and tolerance.

**Historical caveats:** do not conflate nomograms with the Delisle scale or Wheatstone cryptographic instruments. Do not invent a specific inventor or historical provenance. For a factual historical sidebar, source and verify claims before publication. Refer to authentic alignment nomography and separately to analog flight computers as design inspiration.

**Two modes:** (A) **Free Instrument Mode** lets the judge drag precision/recall independently to learn the mathematics; values are educational and not claimed to be achievable by a model. (B) **ML-linked Mode** constrains precision/recall endpoints to real measured model/threshold combinations; moving the threshold or selecting a model drives both endpoints. Label these modes prominently.

# 4. PRODUCT EXPERIENCE AND USER JOURNEYS

## 4.1 Primary journey: the 3-minute demo

**0:00–0:20 — Mission briefing.** Open the app to a dramatic, readable control room showing an initial mission: precision >= 80%, recall >= 90%, p95 latency <= 100 ms, inference cost <= $5/1k. Display a conspicuous “SYNTHETIC DEMO DATA” indicator if appropriate.

**0:20–0:55 — Navigate.** Move the hairline / operating-point selector across evaluated configurations. All four metric gauges, feasible status, constraint margins and trade-off explanations update from the same underlying record. No fake interpolation between discrete candidate points.

**0:55–1:25 — Tighten the mission.** Change max p95 latency to 50 ms. Previously feasible candidates become invalid; the safe envelope shrinks. If no feasible point exists, explicitly show “NO FEASIBLE CONFIGURATION” and list binding constraints.

**1:25–1:55 — Ask for a rescue.** Enter “Keep recall at least 90%, but prioritize latency under 50 ms.” Mission Compiler parses constraints; if impossible, solver proposes quantified, data-backed relaxations (e.g., lower recall floor to a measured attainable value or relax latency). Never fabricate a viable candidate.

**1:55–2:25 — Inspect evidence.** Click an operating point to see its model ID, threshold, confusion matrix, sample counts, confidence interval estimates, latency measurement provenance, cost assumptions, Pareto status and failed/passed constraints.

**2:25–3:00 — Export.** Restore a feasible mission, select a feasible candidate, and export `nomos-decision.json` and `nomos-config.yaml` containing the exact configuration and validation provenance. Show the Kiro spec/test evidence if the hackathon rewards Kiro usage.

## 4.2 Secondary journeys

- Compare two candidates side by side with signed metric deltas and dominance status.
- Reset the mission to defaults without reloading.
- Switch between overview and detailed data table.
- Navigate using keyboard and screen-reader-friendly controls.
- View a “How the instrument works” panel explaining which geometries are metaphors and which values are measured.

# 5. FUNCTIONAL REQUIREMENTS

Priority codes: **P0 = must ship**, **P1 = valuable stretch**, **P2 = future**.

| ID | Priority | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-01 | P0 | Load seeded evaluated candidates | UI shows >= 3 model variants and >= 15 total threshold/configuration points |
| FR-02 | P0 | Interactive point selection | Selecting any point updates every metric and explanation consistently |
| FR-03 | P0 | Mission constraints | Numeric controls support min precision/recall and max latency/cost |
| FR-04 | P0 | Feasibility engine | Feasible iff all required measured metrics satisfy typed constraints |
| FR-05 | P0 | Empty feasible set | Clear no-solution state with binding failures; no fake recommendation |
| FR-06 | P0 | Pareto engine | Non-dominated points identified under consistent metric directions |
| FR-07 | P0 | Instrument visualization | Geometric cursor, calibrated axes, points and constraint overlays function |
| FR-08 | P0 | Candidate evidence drawer | Displays metrics, confusion counts, provenance and constraint margins |
| FR-09 | P0 | Natural-language mission parser | Strict validated JSON schema, deterministic fallback when offline |
| FR-10 | P0 | Export decision | JSON + YAML include exact model, threshold, metrics, constraints, provenance |
| FR-11 | P0 | Reproducible evaluation | Seeded script regenerates points from predictions and labels |
| FR-12 | P0 | Correctness tests | Unit/property/integration tests cover solver, metrics and export |
| FR-13 | P0 | Responsive usable UI | Desktop-first, functional at 1280px and mobile fallback without clipping |
| FR-14 | P0 | Demo reliability | Entire core flow works without API key or internet |
| FR-15 | P1 | Bootstrap uncertainty | Show interval method and sample size, not unsupported certainty |
| FR-16 | P1 | Side-by-side comparison | Delta table and dominance explanation |
| FR-17 | P1 | Minimal-relaxation suggestions | Derived from available evaluated candidates, clearly qualified |
| FR-18 | P1 | Evaluation upload | CSV import with validation and explicit schema |
| FR-19 | P1 | Replayable scenario presets | One-click initial, tight-latency and impossible missions |
| FR-20 | P2 | Live model benchmark adapter | Extensible evaluation of user-provided models |

# 6. DATA MODEL AND EVALUATION SCIENCE

## 6.1 Candidate configuration

A candidate is a **specific model variant plus threshold and inference settings**. A change in threshold on a fixed full-inference model changes classification outcomes but ordinarily does **not** change model inference latency or cost. Model variant, early exit, cascade routing, batching or other inference settings may change latency/cost. Never synthesize threshold-dependent latency without an actual threshold-dependent execution mechanism.

Recommended types:

```ts
type MetricProvenance = "measured" | "estimated" | "synthetic-demo";
type Candidate = {
  id: string;
  modelId: string;
  modelVersion: string;
  threshold: number;              // 0..1
  inferenceProfile: string;
  datasetId: string;
  evaluationRunId: string;
  tp: number; fp: number; tn: number; fn: number;
  precision: number | null;
  recall: number | null;
  p95LatencyMs: number | null;
  costPer1kUsd: number | null;
  metricProvenance: {
    classification: MetricProvenance;
    latency: MetricProvenance;
    cost: MetricProvenance;
  };
  sampleCount: number;
  evaluatedAt: string;
  datasetSha256: string;
  evaluationCodeVersion: string;
};
type Mission = {
  minPrecision: number;           // 0..1
  minRecall: number;              // 0..1
  maxP95LatencyMs: number;        // > 0
  maxCostPer1kUsd: number;        // >= 0
};
```

## 6.2 Evaluation formulas

For labels `y_i in {0,1}` and model scores `s_i in [0,1]`, predicted positive is `s_i >= threshold`. Compute TP, FP, TN and FN from these predictions. `precision = TP/(TP+FP)` if denominator > 0; `recall = TP/(TP+FN)` if denominator > 0. **Do not silently substitute precision = 1 when there are no predicted positives**; represent undefined values as `null` and treat them as failing a required minimum unless an explicitly documented policy says otherwise. Recall is undefined if no positives exist. Calculate false-positive rate `FP/(FP+TN)` when defined.

For inference latency samples, p95 is an explicitly defined empirical percentile (document the quantile method). Do not infer p95 from average latency. Cost per 1k requests must use a documented rate/measurement model and be labeled estimated when not directly measured. Avoid implying cloud costs are observed if calculated from assumptions.

## 6.3 Dataset and demo design

Ship a deterministic synthetic fraud-like dataset with at least 500 labeled records and at least 3 distinct prediction-score columns representing model variants (e.g. `lite`, `balanced`, `high_recall`). Use a fixed random seed. Each model must have a genuinely different score distribution, and threshold sweeps must compute metrics from individual labeled rows. Provide an evaluation script producing >= 15 operating points and a manifest with dataset hash and generation parameters.

For latency and cost, create a clearly labeled **synthetic benchmark fixture** per inference profile (or measured local benchmarks if available). Show the fixture origin in UI. Design the seeded candidates so at least one point satisfies the default mission and no point satisfies the 50 ms tightened mission at the default precision/recall requirements; **verify this with an automated test** rather than assuming it.

## 6.4 Data contracts and validation

- Validate schema with Zod (TypeScript) or Pydantic (Python); reject NaN, Infinity, out-of-range scores, duplicate IDs and negative confusion counts.
- Verify `TP+FP+TN+FN = sampleCount` for each evaluated point.
- Require consistent dataset ID/hash when comparing points on the same chart; do not silently compare incomparable datasets.
- Store score data, labels and generated candidate metrics in versioned files with explicit provenance.
- Never mark a missing latency/cost metric as feasible. Display `Unknown` and require evidence.

# 7. FEASIBILITY, PARETO AND RECOMMENDATION LOGIC

## 7.1 Feasibility

A candidate is feasible only when all four metrics exist and satisfy:

`precision >= minPrecision AND recall >= minRecall AND p95LatencyMs <= maxP95LatencyMs AND costPer1kUsd <= maxCostPer1kUsd`.

Use consistent floating-point tolerance (e.g. 1e-9 for computational comparisons) and preserve full precision internally. Display rounded numbers only; never decide feasibility based on rounded UI labels.

## 7.2 Pareto dominance

Maximize precision and recall; minimize p95 latency and cost. A dominates B iff A is no worse than B on all four metrics and strictly better on at least one (subject to documented numerical tolerance). Compute the frontier over comparable, complete candidates. Distinguish **global Pareto frontier** from **feasible Pareto frontier**.

## 7.3 Candidate ranking

Do not conflate Pareto efficiency with a single universally optimal point. Offer explicit ranking policies, e.g. `min_latency`, `min_cost`, `max_recall`, `max_precision`, or user-chosen weighted score. Default to a transparent policy such as minimum latency among feasible candidates, tie-break by cost, then ID. Show the ranking policy in UI/export.

## 7.4 No-feasible-solution handling

When no candidates satisfy the mission:
1. State that no evaluated configuration meets all requirements; do not imply mathematical impossibility across all potential models.
2. Display the most common failed constraints and closest evaluated alternatives.
3. Compute exact per-candidate constraint violations and show proposed relaxations **only to values demonstrated by measured candidate data**.
4. Explain that relaxation proposals are trade-offs, not recommendations to violate business requirements.

## 7.5 Uncertainty (P1)

Use bootstrap resampling of labeled examples to estimate intervals for precision and recall at fixed model/threshold. Clearly label method, iterations, confidence level and sample size. For latency p95, use bootstrap over latency samples only when raw samples exist. No fake error bars. Optional robust-feasibility mode requires conservative interval bounds (e.g. lower CI for minimum metrics, upper CI for maximum metrics); visually distinguish nominal vs robust feasibility.

# 8. REAL NOMOGRAPHIC INSTRUMENTS — REQUIRED DESIGN

## 8.1 Instrument 01: Reciprocal-scale F1 nomogram (P0)

Inputs: precision P and recall R, each in (0,1]. Output: F1 = 2PR/(P+R). Equivalent: 1/F1 = (1/P + 1/R)/2.

Draw three vertical, **equally spaced** parallel axes at xL, xM=(xL+xR)/2, xR. Define a shared vertical reciprocal coordinate transform `y(v) = yTop + K*(1/v - 1)` for v in [vMin,1], with K>0. Precision point is `(xL,y(P))`; recall point `(xR,y(R))`. The straightedge is the line segment between those points. Its intersection at xM is `yI=(y(P)+y(R))/2`. Invert the scale: `vI = 1/(1+(yI-yTop)/K)`. Algebra guarantees `vI=2PR/(P+R)`.

**Do not compute the instrument output from `2*P*R/(P+R)` in the rendering path.** Compute it by (a) geometry endpoints, (b) line/axis intersection, (c) inverse calibration. Separately calculate numerical reference to display absolute error and run tests. Render calibrated nonlinear ticks at 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, optionally minor ticks. For a value below display minimum, auto-expand range or display an explicit out-of-range state; never clamp silently.

**Direct manipulation:** drag left endpoint to set P and right endpoint to set R in Free Instrument Mode, with pointer capture, keyboard arrow adjustment, touch support, snapping optional, and responsive SVG coordinate conversion. Dragging the straightedge body may translate endpoints only when the resulting values remain in range; otherwise explain why it is locked. In ML-linked Mode, dragging the threshold control selects a measured operating point; endpoints follow data and must not suggest independent feasibility.

**Example invariant:** P=0.80, R=0.90 yields F1=0.8470588235294118, within tolerance. `y(F1)` must equal the straightedge's middle-axis crossing within 1e-9 model-coordinate units (before raster rounding). Handle P=0 or R=0: by definition F1=0 when either is zero (with a chosen explicit zero-zero convention), but reciprocal coordinates are singular; show a zero-domain badge / boundary readout rather than divide by zero or draw a false finite intersection.

## 8.2 Instrument 02: Three-axis logarithmic cost nomogram (P0)

Inputs: N = number of requests, c = dollars per request, T = N*c dollars. For positive inputs, log(T)=log(N)+log(c). Construct a three-parallel-axis alignment nomogram with left axis `yL(N)=y0 + K*log10(N/N0)`, right axis `yR(c)=y0 + K*log10(c/c0)`, and center axis `yM(T)=y0 + (K/2)*log10(T/(N0*c0))`. **Important:** these transforms do not align on a straightedge as written unless the center crossing is the average of the two endpoint coordinates; with the given transforms, the correct center coordinate is `y0 + (K/2)*(log10(N/N0)+log10(c/c0))`, which equals `yM(T)`. Therefore the middle-axis inverse is `T = N0*c0*10**(2*(yI-y0)/K)`.

Use axis orientation, offsets and physical ranges chosen so endpoints and intersection remain within view for the supported demo values. Clearly show unit conversion: if source metric is dollars per 1,000 requests, set c = costPer1k / 1000 before calculating. Use `N0=1_000_000`, `c0=0.001` as convenient calibration constants; show a concrete check: N=1,000,000 and c=$0.003 -> T=$3,000. Support accessible number inputs and direct marker dragging. Show numerical verification independently.

**Important:** both F1 and cost instruments must compute via geometric intersection first, not simply display a formula result. Use a reusable `AlignmentNomogram` rendering and interaction component, but separate calibrated transforms for each equation.

## 8.3 Instrument 03: Little's Law throughput computer (P1 stretch)

If time permits, implement L=lambda*W (average concurrent work = arrival throughput * mean time in system) as a third logarithmic alignment nomogram. Only display as valid under steady-state/stability assumptions and consistent units; it does **not** infer p95 latency or model speed from the classification threshold. Label it P1, not essential for MVP acceptance.

## 8.4 ML operating-envelope explorer (P0, distinct from nomograms)

Show empirically evaluated candidates with precision, recall, F1, p95 latency and cost. Feasible region and Pareto frontier are computed by a deterministic solver, not by fake geometric alignment. A projection (e.g. recall vs latency) can show constraints and candidates, while the authentic nomogram panel computes derived metrics for the selected candidate. Make the visual distinction explicit: **calculation instrument** vs **empirical decision map**.

## 8.5 Design direction

Premium scientific instrument aesthetic: warm off-white chart paper, charcoal engraved scales, restrained oxidized brass/copper accents, dark technical labels, hairline glow on interaction, etched tick marks, tactile drag cursor, fine graph-paper grid, analog motion with reduced-motion support. Avoid generic neon cyberpunk, unnecessary 3D, fake physics, unreadable microtext, or an AI-generated-looking dashboard. The first screen must visibly feature the real nomogram and a “why the line computes” disclosure.

## 8.6 Accessibility and reliability

Keyboard and touch operation, clear numeric inputs as alternative to drag, high-contrast labels, focus indicators, readable error messages, screen-reader descriptions, responsive viewport transforms, no animation dependence, `prefers-reduced-motion` compliance, and correct values on resize/zoom.

# 9. MISSION COMPILER (AI FEATURE)

## 9.1 Purpose

Convert natural-language deployment instructions into a typed `Mission` object. The LLM must **not** calculate model performance, claim feasibility, or fabricate metrics. Its only trusted role is proposing structured constraints and optionally explaining deterministic solver outputs.

## 9.2 Pipeline

1. Receive text instruction and current mission.
2. Parse with a structured-output LLM if credentials are configured; otherwise deterministic grammar/regex fallback for supported commands.
3. Validate with strict schema, allowed units and numerical ranges.
4. Show proposed changes as a reviewable diff. User explicitly applies the mission.
5. Recompute feasibility and Pareto results in deterministic engine.
6. Render a concise explanation grounded exclusively in computed results.

## 9.3 Examples

Input: `Recall must be at least 90 percent, precision at least 80 percent, p95 under 100 milliseconds, cost below $5 per thousand.`

Output:
```json
{
  "minRecall": 0.90,
  "minPrecision": 0.80,
  "maxP95LatencyMs": 100,
  "maxCostPer1kUsd": 5
}
```

Input: `Keep the other constraints, but make latency under 50 ms.` -> patch only `maxP95LatencyMs`, retaining other values.

Input: `Make it safe and cheap.` -> ask for clarification or propose a nonbinding draft; do not invent numeric thresholds.

## 9.4 Safety and failure modes

- Never execute code supplied through mission text.
- Never trust free-form LLM JSON without schema validation.
- Handle malformed outputs, missing credentials, rate limits, timeouts and prompt injection.
- UI always allows manual mission editing.
- Explain exactly which constraints were parsed and which remain unchanged.

# 10. TECHNICAL ARCHITECTURE

## 10.1 Recommended stack

**Frontend:** Next.js App Router + React + TypeScript + Tailwind CSS + SVG (D3 scales optional) + Zustand or React state. **Backend:** Python FastAPI + Pydantic + NumPy/Pandas/scikit-learn for evaluation; optional SciPy for intervals. **Storage:** Versioned JSON/CSV demo assets and local SQLite for evaluation metadata if needed. **Testing:** pytest + Hypothesis, Vitest, Playwright. **Deployment:** frontend on Vercel or container; API on a compatible Python host; local Docker Compose for judges.

Simpler acceptable alternative: implement the deterministic evaluator/solver in TypeScript and run everything in a single Next.js project, provided the metrics are computed from actual score/label arrays, reproducibility and tests are preserved. Prefer the Python evaluator for clearer scientific provenance and export a static evaluated manifest consumed by the frontend so the demo works offline.

## 10.2 Logical architecture

```text
Synthetic labeled dataset + per-model prediction scores
                     |
             Python evaluator
                     |
      Evaluated candidates + provenance manifest
                     |
              Typed API / static JSON
                     |
      +--------------+----------------+
      |              |                |
 Mission Compiler  Envelope Solver  Evidence/Export
      |              |                |
      +--------------+----------------+
                     |
        React Flight Envelope Instrument
                     |
       Selection / Mission / Comparison UI
```

## 10.3 Suggested repository structure

```text
nomos/
  apps/web/
    app/                 # dashboard, API route proxies
    components/          # instrument, mission panel, evidence drawer
    lib/                 # schemas, solver, formatting, export
    public/data/         # generated candidate manifest
    tests/               # unit and Playwright tests
  services/evaluator/
    nomos_eval/          # dataset generation, metrics, evaluation, provenance
    tests/               # pytest and Hypothesis
    pyproject.toml
  data/
    synthetic/           # generated inputs and benchmark fixtures
  specs/
    requirements.md
    design.md
    tasks.md
  docs/
    ARCHITECTURE.md
    DECISIONS.md
    BUILD_LOG.md
    DEMO_SCRIPT.md
    METRIC_PROVENANCE.md
  .env.example
  docker-compose.yml
  README.md
```

## 10.4 API contracts

- `GET /api/health` -> service status and data manifest version.
- `GET /api/datasets` -> available dataset IDs and provenance.
- `GET /api/candidates?datasetId=...` -> validated candidate array.
- `POST /api/mission/parse` body `{text, currentMission}` -> `{proposedMission, changes, warnings, source: "llm"|"fallback"}`.
- `POST /api/envelope` body `{datasetId, mission, rankingPolicy}` -> `{feasibleIds, globalParetoIds, feasibleParetoIds, selectedId, violationsById, summary}`.
- `POST /api/export` body `{candidateId, mission, datasetId, rankingPolicy}` -> reproducible decision record, validated server-side.

If implementing a static-first frontend, the envelope calculation can run client-side from the manifest; keep the same pure functions and schemas, and document that APIs are logical contracts rather than mandatory network services.

## 10.5 Export format

```json
{
  "schemaVersion": "1.0",
  "decisionId": "generated-uuid",
  "generatedAt": "ISO-8601 timestamp",
  "candidateId": "balanced-t075",
  "modelId": "balanced",
  "modelVersion": "demo-1",
  "threshold": 0.75,
  "inferenceProfile": "balanced-cpu",
  "mission": {
    "minPrecision": 0.8,
    "minRecall": 0.9,
    "maxP95LatencyMs": 100,
    "maxCostPer1kUsd": 5
  },
  "metrics": {"precision": 0.84, "recall": 0.91, "p95LatencyMs": 62, "costPer1kUsd": 2.8},
  "feasible": true,
  "datasetId": "fraud-demo-v1",
  "datasetSha256": "actual-generated-hash",
  "evaluationRunId": "actual-run-id",
  "metricProvenance": {"classification": "synthetic-demo", "latency": "synthetic-demo", "cost": "synthetic-demo"},
  "rankingPolicy": "min_latency"
}
```

Values above are **schema examples**, not observed measurements. Actual exports must use live selected candidate values and actual hashes. If selected candidate is infeasible, disable deployment-ready export or label the artifact `review_only` and clearly list violations.

# 11. NONFUNCTIONAL REQUIREMENTS

- **Performance:** Selecting a candidate or changing constraints should feel immediate (< 100 ms on seeded dataset on ordinary laptop); no network call required for core filtering.
- **Reliability:** No uncaught errors on empty candidates, missing metrics, or malformed mission text.
- **Reproducibility:** Dataset generator and evaluator deterministic under fixed seed; manifests include hashes.
- **Security:** No user-provided code execution; API input validation; environment secrets never sent to browser; no hidden production credentials.
- **Privacy:** Demo data entirely synthetic; no real fraud customer data; upload feature (if built) warns about sensitive data and processes locally where practical.
- **Observability:** Meaningful error messages and basic structured logs; no noisy debug output in demo.
- **Portability:** One documented local start command; production build succeeds.
- **Accessibility:** Keyboard and reduced-motion support; textual table mirrors chart.

# 12. KIRO / CODEX DEVELOPMENT INTEGRATION

NOMOS should be developed with **spec-driven implementation**, regardless of whether the coding agent is Codex or Kiro. Provide `specs/requirements.md`, `specs/design.md` and `specs/tasks.md`. When Kiro-specific capabilities are available, optionally add compatible steering instructions, hooks and MCP interfaces; do not invent proprietary file formats or claim integrations were tested if they were not.

**Suggested MCP tools (optional):** `list_candidates`, `evaluate_mission`, `explain_candidate`, `compare_candidates`, `export_decision`. Tools must call the same deterministic solver as the UI and return structured results.

**Automated development checks:** On evaluation manifest change, run dataset schema validation, metrics recomputation, feasibility properties and export consistency tests. On UI changes, run typecheck, component tests and Playwright happy path.

**Judging proof:** Show spec-to-test traceability, automated verification, repeatable dataset generation and an actual failure detected by tests. Kiro tooling is a means of demonstrating engineering rigor, not a replacement for functioning product features.

# 13. ACCEPTANCE TESTS AND CORRECTNESS PROPERTIES

## 13.1 Deterministic unit tests

1. Perfect classifier -> precision=recall=1 at an appropriate threshold.
2. No predicted positives -> precision=null, not silently 1.
3. No actual positives -> recall=null.
4. Equal-to-boundary values satisfy inclusive constraints.
5. Missing required metric -> candidate not feasible.
6. A dominates B only when no worse on all objectives and strictly better on at least one.
7. Identical points do not strictly dominate each other.
8. Tightening a constraint cannot introduce a previously infeasible candidate into the feasible set.
9. Loosening a constraint cannot remove a previously feasible candidate.
10. Pareto result invariant to input order; stable tie behavior.
11. Export candidate ID, metrics, mission and hashes exactly match selected state.
12. Changing threshold on the same fixed-inference model does not alter latency/cost fixture values.
13. All candidate confusion counts sum to sample count.
14. Every UI-selected ID exists in manifest; deleted/filtered selection is handled gracefully.

## 13.2 Property-based tests

- For arbitrary valid confusion matrices, precision/recall stay within [0,1] when defined.
- For arbitrary candidate sets, every feasible result satisfies every constraint.
- For arbitrary candidate sets, no reported Pareto point is strictly dominated by another comparable candidate.
- Permuting candidates leaves feasible/Pareto ID sets unchanged.
- Increasing min recall or reducing max latency produces a subset (or equal set) of previously feasible candidates.
- Serializing and parsing exported decision records preserves all numerical values and IDs.

## 13.3 End-to-end browser tests

- App loads without external API key; initial mission and candidate data visible.
- Select a candidate -> all metric gauges and evidence drawer match manifest.
- Tighten latency -> feasible count decreases; expected no-feasible state appears.
- Restore default -> at least one feasible candidate appears.
- Parse supported mission text offline -> preview diff -> apply -> constraints update.
- Export -> download JSON -> parse -> verify selected candidate, mission and provenance.
- Keyboard navigation and responsive layout smoke test.

## 13.4 Demo fixture invariant

Test the exact seeded demo scenario:
- Default mission yields >= 1 feasible evaluated candidate.
- Tightened 50 ms mission with all other defaults retained yields zero feasible evaluated candidates.
- At least one candidate is globally Pareto-dominated, so the feature can be demonstrated.
- All metrics shown in the UI match regenerated evaluation outputs.

# 14. IMPLEMENTATION PLAN — ORDERED PHASES

## Phase 0 — Repository and decisions

Scaffold monorepo or justified single app. Establish package scripts, lint/typecheck/test/build, `.env.example`, architecture docs and typed schemas. **Gate:** clean install and empty-app build.

## Phase 1 — Geometry engine and proof (V2 priority)

Implement both calibrated nomograms, geometry-first computation, independent reference checks, direct interaction and property-based tests before building the elaborate dashboard. This is a hard gate.

## Phase 1B — Real evaluation pipeline

Generate deterministic labeled data and model scores. Compute threshold-sweep confusion matrices and precision/recall. Attach explicit synthetic latency/cost benchmark fixture per inference profile. Generate validated manifest and hash. **Gate:** scientific unit/property tests and fixture invariants pass.

## Phase 2 — Deterministic envelope engine

Implement feasibility, violation margins, Pareto frontier, transparent ranking and no-solution explanations as pure functions. **Gate:** all solver tests pass; no dependency on LLM.

## Phase 3 — Core flight instrument

Build responsive control room, SVG projection, hairline snapping, linked gauges, constraint overlays, mission editor, evidence drawer and status. **Gate:** user can complete demo journey manually, no API key.

## Phase 4 — Mission Compiler

Implement strict schema, offline deterministic parser for supported mission expressions, optional structured-output LLM adapter, diff preview and apply. **Gate:** invalid input never silently changes mission; offline demo works.

## Phase 5 — Export and evidence

Export JSON/YAML with actual selected values, provenance, evaluation hash and pass/fail status. Implement comparison view if time permits. **Gate:** exported values round-trip and match UI/manifest.

## Phase 6 — Visual polish and presentation

Apply aviation/nomogram design language, meaningful transitions, empty-state drama, tutorial affordances and responsive fallback. **Gate:** polished 3-minute walkthrough with no dead controls.

## Phase 7 — Quality and delivery

Run unit, property, integration, browser tests, lint, typecheck and production build. Fix issues. Record actual commands/results. Provide Docker/local instructions and deployment notes. **Gate:** clean launch from fresh clone, tested demo script.

# 15. DESIGN AND ENGINEERING TRADE-OFFS

- Prefer **correct candidate snapping** to visually smooth but fake interpolation.
- Prefer **small real synthetic dataset** to a giant hardcoded metric table.
- Prefer **offline deterministic mission parsing** to a brittle live LLM dependency.
- Prefer **pure solver functions** to duplicated backend/frontend business logic.
- Prefer **measured/declared provenance** to invented confidence intervals.
- Prefer **usable SVG** to WebGL spectacle that harms accessibility or reliability.
- Prefer **clear no-solution diagnosis** to an AI that always claims to find an answer.

# 16. FAILURE MODES AND MITIGATIONS

| Failure | Mitigation |
|---|---|
| A judge assumes 2D safe region means all four constraints pass | Show separate precision/cost gates; label projection explicitly |
| A fixed model's threshold seems to change latency | Hold latency/cost constant per fixed inference profile |
| Candidate metrics are hardcoded | Regenerate from labels/scores; CI verifies manifest |
| AI hallucinates feasible candidate | LLM only parses; solver decides; schema validation |
| No internet / API credits | Offline deterministic path is fully functional |
| No candidate meets mission | Explicit empty state and measured alternative margins |
| Numerical rounding changes pass/fail | Compare unrounded values with documented tolerance |
| Tiny validation sample overstates certainty | Show sample count and optional bootstrap uncertainty |
| Historic claims are inaccurate | Use precise “inspired by” language, avoid unverified attribution |
| Demo animation breaks | Discrete click/keyboard fallback, minimal animation |
| Export is misleading | Include provenance, assumptions, and infeasibility status |

# 17. SUCCESS METRICS AND JUDGING EVIDENCE

**Functional:** All P0 requirements satisfied; seeded fixture invariants verified; no broken core interactions. **Scientific:** Precision/recall computed from labeled data; correct Pareto dominance; traceable latency/cost assumptions. **Experience:** A first-time user can change a constraint and identify feasibility within 30 seconds. **Demo:** Repeatable 3-minute script works without network. **Engineering:** Clean tests/build, documented assumptions, reproducible data and exports.

Judging alignment:
- **Impact:** Reduces friction in understanding constrained deployment decisions.
- **Technical depth:** Empirical evaluation, Pareto search, uncertainty, provenance, strict schemas and testing.
- **Design:** Historically inspired calibrated instrument, not generic dashboard.
- **Innovation:** Mission-driven AI operating-envelope interaction with honest mathematical grounding.
- **Presentation:** Judge directly triggers an envelope collapse and sees defensible recovery guidance.

# 18. FUTURE ROADMAP (NOT MVP)

Real MLflow/W&B import; ONNX or local inference benchmarking; fairness metrics across cohorts; calibration error and reliability diagrams; multi-model cascades with actual threshold-dependent inference cost; uncertainty-aware robust feasibility; team approval workflows; drift and operating-envelope monitoring; deployment integrations; audited decision history; collaboration; domain-specific mission templates.

# 19. DEMO SCRIPT (VERBATIM GUIDE)

1. “Pilots once used calibrated instruments to understand safe operating limits. AI engineers face their own flight envelopes: accuracy, missed detections, latency and cost.”
2. “This is NOMOS. These are evaluated configurations, not arbitrary slider values.”
3. Select a feasible candidate. “Every metric comes from the same recorded evaluation.”
4. Tighten latency to 50 ms. “Our safe envelope collapses. NOMOS refuses to pretend a solution exists.”
5. Show failures and candidate alternatives. “We can see precisely which constraint blocks deployment and what a relaxation would cost.”
6. Restore a feasible mission, show Pareto/evidence, export. “The final decision is reproducible, with its model, threshold, dataset hash and assumptions attached.”
7. “AI interprets the mission. Mathematics verifies the envelope. Humans remain in control.”

# 20. FINAL DELIVERY CHECKLIST FOR CODEX

- [ ] Functional application (not mockup) and accessible instrument.
- [ ] Synthetic dataset generator with fixed seed and provenance.
- [ ] Real threshold-sweep evaluator and >= 3 model variants.
- [ ] Typed candidate/mission schemas and strict validation.
- [ ] Correct feasibility and Pareto engines.
- [ ] No-solution mission and transparent constraint explanations.
- [ ] Responsive instrument with discrete snapping and all four metrics.
- [ ] Mission parser with offline fallback and reviewable diff.
- [ ] Exported JSON and YAML with real current values and hashes.
- [ ] Unit/property/E2E tests and seeded demo invariants.
- [ ] Working README and one-command local launch.
- [ ] `.env.example`, no committed secrets.
- [ ] `docs/DECISIONS.md`, `docs/BUILD_LOG.md`, `docs/DEMO_SCRIPT.md`.
- [ ] Production build passes; test commands/results recorded honestly.
- [ ] No false claims about exact nomography, benchmark measurement or deployment safety.

---

# 21. V2 IMPLEMENTATION CONTRACT: GEOMETRIC COMPUTATION

## 21.1 Types and APIs

TypeScript interfaces (illustrative, adapt as needed):

```ts
type Point = { x: number; y: number };
type AlignmentResult = {
  left: Point; right: Point; intersection: Point;
  geometryValue: number; referenceValue: number;
  absoluteError: number; units: string;
};
type NomogramMode = 'free' | 'ml-linked';
type NomogramKind = 'f1-reciprocal' | 'inference-cost-log';
type EvaluationPoint = {
  modelId: string; threshold: number;
  tp: number; fp: number; tn: number; fn: number;
  precision: number; recall: number;
  p95LatencyMs: number; costPer1kUsd: number;
  dataSource: 'measured' | 'synthetic' | 'estimated';
};
```

Required pure functions: `reciprocalToY(v, calibration)`, `reciprocalFromY(y, calibration)`, `logToY(v, reference, calibration)`, `logFromY(y, reference, calibration)`, `intersectLineAtX(a,b,x)`, `f1FromGeometry(P,R,calibration)`, `costFromGeometry(N,c,calibration)`, `calculateConfusionMatrix(yTrue,scores,threshold)`, `evaluateOperatingPoint`, `checkConstraints`, `paretoFrontier`, `exportDecision`.

A robust line/axis intersection implementation must interpolate `t=(xTarget-a.x)/(b.x-a.x)` then `y=a.y+t*(b.y-a.y)`. Reject coincident x endpoints or x targets outside supported geometry; do not silently return NaN.

## 21.2 Geometry and numerical test plan

P0 deterministic tests: F1 for (0.8,0.9), (1,1), (0.5,0.5), (0.6,0.95), random positive pairs; line midpoint equals transformed F1; axis round-trip inversion; monotonicity; display range boundaries; precision/recall zero singularity; responsive resizing doesn't change numeric output. Cost tests: 1,000,000 requests x $0.003/request = $3,000; 50,000 x $0.0004 = $20; varying powers of ten; costPer1k conversion; logarithmic axis round-trip; reject N<=0 or c<=0 for logarithmic geometry and show an explicit zero boundary result when zero cost or volume is semantically valid.

Use property-based tests (e.g. fast-check): for P,R in [0.5,1], absolute difference between geometry-derived and independently formula-derived F1 < 1e-10; for N in [1e3,1e7], c in [1e-5,1e-1], relative cost error < 1e-10. The reference formula is allowed **only in tests, validation, and explanatory readouts**, not as the geometric result source. Test pointer coordinates by mapping SVG viewBox to screen positions. Add Playwright drag tests and screenshot assertions.

## 21.3 Dataset and honest performance provenance

Generate a seeded, labeled binary-classification validation dataset with class imbalance, realistic overlapping predicted score distributions, and at least two meaningfully different model variants. Evaluate a threshold grid, derive TP/FP/TN/FN, then precision/recall. Store candidate rows in a deterministic CSV/JSON fixture generated by Python. Provide a command to regenerate the fixture and compare checksums. Do not hardcode the headline numbers in React. Benchmark latency if feasible, otherwise use deterministic **explicitly synthetic** latency and cost metadata per model, not per threshold (unless a real conditional compute policy is implemented). Cost per request may be derived from measured runtime and stated rate assumptions; label estimates. Threshold alone should not be claimed to change fixed-model inference latency or compute cost.

## 21.4 Agent orchestration and directory structure

Recommended repo: `frontend/` (React/Vite/TypeScript/SVG), `backend/` (FastAPI/Python evaluation and mission validation), `packages/nomogram-core/` (pure TS geometric transforms and tests), `data/` (seeded fixtures), `docs/` (DECISIONS, BUILD_LOG, HISTORICAL_NOTES, DEMO_SCRIPT), `tests/e2e/` (Playwright). The frontend must run with committed fixtures if backend is temporarily unavailable; label offline state. The mission compiler must work with deterministic examples if no LLM API key is present.

Suggested API: `GET /api/health`, `GET /api/models`, `GET /api/operating-points`, `POST /api/mission/parse`, `POST /api/mission/evaluate`, `POST /api/decision/export`. The geometric instrument can run entirely in the frontend with pure functions, but server-side Python can independently verify submitted geometry outputs for export.

## 21.5 Detailed user interaction and demo requirements

**Free mode:** user drags the P marker; the straightedge pivots and F1 crossing moves; user drags R marker; the crossing updates; a side panel displays `y(P)`, `y(R)`, `yIntersection`, `inverse(yIntersection)`, numerical reference and error. User can switch to cost instrument, drag N and c markers, and read T from the middle scale. Keyboard inputs achieve the same effect.

**ML-linked mode:** choose model and threshold; confusion matrix updates; P/R endpoints snap to evaluated measurements; nomogram calculates F1; cost instrument uses request volume and the model's per-request cost; mission map updates feasible status; tighten latency from 100ms to 50ms; show exact violated constraints, and show 'none feasible' when warranted; export JSON with model/threshold, dataset ID/seed, confusion matrix, provenance, geometric outputs, independent check, and constraints.

**Three-minute judge script:** 0:00 historical straightedge explanation; 0:25 drag P/R and prove intersection calculation; 0:55 switch to actual model/threshold; 1:20 calculate million-request cost geometrically; 1:50 tighten latency and expose impossible constraints; 2:20 show verification and exported evidence; 2:45 close with historical resurrection claim.

## 21.6 Explicit P0 vs P1

**P0 must ship:** authentic F1 and cost nomograms; direct pointer/keyboard manipulation; pure geometry math; independently verified results; seeded ML evaluation; model/threshold selector; mission feasibility and Pareto; provenance-bearing export; high-quality responsive design; automated tests; README; no-key fallback. **P1 only if P0 passes:** Little's Law nomogram, animated instrument transitions, shareable saved missions, richer AI explanation, uncertainty bootstrap visualization, audio effects, advanced historical storytelling. Never sacrifice correctness for P1 polish.

## 21.7 Completion gates (do not claim done unless all pass)

- A user can obtain the F1 result from **only** line intersection and inverse axis transform, with the reference calculation disabled.
- A user can obtain total cost from **only** logarithmic line intersection and inverse transform, with the reference calculation disabled.
- Both nomograms pass property tests against independently implemented formulas.
- The UI clearly differentiates educational free inputs from actual achievable ML operating points.
- At least two evaluated model variants and multiple thresholds are available.
- Changing threshold updates precision/recall without inventing threshold-driven latency changes.
- Mission constraints and Pareto outcomes are derived from the same candidate data shown on screen.
- No-feasible-solution is supported and demonstrated.
- Export contains exact chosen configuration and source provenance.
- Typecheck, lint, unit tests, e2e tests, and production build pass; document actual commands and results.
- Historical copy does not claim invented provenance or imply arbitrary ML trade-offs are exactly nomographic.

---

# 22. COPY-PASTE PROMPT TO START CODEX

> Read `NOMOS_Codex_Master_PRD.md` completely. You are responsible for implementing NOMOS end to end as a working, testable hackathon product. Start by inspecting the repository, writing a concise phased plan and recording assumptions. Then implement Phases 0–7 in dependency order. Prioritize the scientific evaluator, constraint/Pareto engine, truthful instrument interactions and offline demo reliability over visual gimmicks. Do not use hardcoded model metrics masquerading as evaluation data, do not claim exact four-variable straightedge nomography, and do not allow the LLM to decide feasibility. Create all necessary source code, tests, seed assets, docs, and export features. Run the application and tests, fix failures, and finish with a concise report listing implemented features, commands/tests executed, any limitations, and how to launch and demonstrate the product. Continue autonomously through nonblocking decisions.

**END OF MASTER PRD**


# 23. CHANGELOG FROM V1

V2 changes the historical premise from nomogram-inspired visualization to **actual geometric computation**. Two real nomograms are now mandatory, including inverse coordinate mappings and independent reference tests. The UI has explicit free vs ML-linked modes. The empirical envelope is separated from the equation-solving instruments. The implementation plan prioritizes geometry-first tests, and no agent may pass the project with a decorative straightedge. Sections inherited from V1 describing a linked hairline must be interpreted under the stronger V2 contract above; if requirements conflict, Sections 0, 1, 3, 8, and 21 take precedence.
