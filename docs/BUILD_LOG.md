# Build log

## Phase 0 · Scaffold

The workspace contained the V2 PRD and PDF. Scaffolded a local Vite/React/TypeScript application with npm scripts, environment configuration and an independently runnable Python generator. The initial Vite production build passed.

## Phase 1 · Geometry

Implemented calibrated reciprocal and logarithmic transforms, straightedge intersection and midpoint inversion. Added free pointer and keyboard controls in reusable SVG. Ran `npm test` against the geometry gate before integration. All 12 tests passed, including 1,000 generated comparisons per equation and invalid-domain, round-trip and scaling checks.

## Phase 1B · Evaluation

Ran `python scripts/evaluate.py` to produce 1,200 rows, 27 evaluated points and per-profile benchmark evidence. Added strict manifest validation and a separate TypeScript implementation to recompute every confusion matrix, p95 and rate from the raw fixtures.

## Phase 2 · Envelope

Added the four-gate solver, inclusive margin checks, global and feasible Pareto frontiers, deterministic ranking and closest-candidate explanations. The seeded fixture has two feasible candidates at defaults and zero under a 50 ms cap.

## Phase 3 · Control room

Connected two instrument modes, a model/threshold selector, a snapping recall–latency map, keyboard-accessible data table and evidence drawer. A local Vite server returned HTTP 200. The first Chromium run exposed the threshold selector's accessible name and the Playwright JSON import syntax. Both were corrected.

## Phase 4 · Mission Compiler

Added explicit-unit offline grammar, proposal diff and apply. The optional server adapter validates strict structured output and falls back to the local grammar on failure. A local stub verified valid provider responses and rejection of extra fields.

## Phase 5 · Export

Added JSON/YAML paired downloads with exact candidate, mission and calculation provenance. The property suite round-tripped exports over varied candidates and request volumes. Browser tests read both downloaded files and checked that they describe the same decision.

## Phase 6 · Presentation

Inspected desktop and mobile Chromium screenshots. Added screenshot baselines for both charts and exercised keyboard navigation and direct drag. Added the three-minute walkthrough and spec-to-test traceability.

## Phase 7 · Release

Ran `npm ci` from the lockfile. `npm run check` passed byte-for-byte fixture regeneration, ESLint, TypeScript, 32 Vitest tests, the Vite production build and four Chromium tests against the production server. The browser tests exercised offline behavior, both download formats, mouse drag, keyboard controls, desktop and mobile layouts, both chart baselines and a mobile touch drag.

The optional provider was exercised against a local stub. Docker and a live provider credential were absent from the verification environment.

## UX audit and redesign

Captured the original production interface across desktop, tablet and phone. Reworked the existing app around a single instrument frame, corrected pointer capture, Pareto dominance, draft handling and export scope, then inspected the updated captures. The release check passed 35 Vitest and 11 Chromium tests, including an expanded geometry property suite and axe-core checks. See the [audit](UX_AUDIT.md) and [redesign report](UX_REDESIGN_REPORT.md).
