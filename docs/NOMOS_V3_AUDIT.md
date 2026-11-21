# NOMOS 3.0 repository audit

## Baseline

NOMOS V2 uses React, TypeScript, Vite and local fonts. A Node server serves the production build and optionally proxies mission text to a schema-constrained provider. The static client includes an offline compiler. Python regenerates a versioned dataset, benchmark fixture and evaluation manifest. The six baseline Vitest files passed all 35 tests, and the baseline production build succeeded. In Chromium I opened the running app, entered F1 practice mode, read 84.71%, tightened latency to 50 ms, confirmed zero feasible points, and opened the evidence dialog.

[Baseline Chromium screenshot](ux-screenshots/v3-before.png)

## Reusable foundations

- Preserve the seeded evaluator, manifest validation, confusion counts, Wilson intervals and hashes. The 27 sampled thresholds come from three generated score streams over 1,200 synthetic records. P95 comes from synthetic timing samples. Unit prices are declared assumptions. The fixture includes neither measured throughput nor mean response time.
- Reuse the line intersection, reciprocal and logarithmic calibration, verified F1 and economics, SVG drag coordinate conversion, pointer capture, numeric validation, modal dialog, deterministic solver, Pareto ranking, compiler middleware and dual-format export.
- Keep the evaluation schema and fixture hashes reproducible. Extend the evidence schema additively for deployment decisions.

## Findings

- F1 and cost already use genuine geometry. The straightedge crosses a calibrated center axis before the inverse maps its result. Both-zero F1 is represented as zero without stating the chosen convention. The common zero shortcut runs before validating inputs.
- Precision, feasibility and export use source precision even when the deployment population could differ. No prior adjustment, daily budget gate, FPR cap, throughput gate, or Little's Law instrument exists.
- The threshold menus and top-level metrics lead the task. The existing projection sits below the instruments, hides other gates from the plotted boundaries, and skips touch snapping on the plot background. The mission compiler misses the proposed fraud-language example. The cost forecast volume does not change per-1,000 feasibility.
- V2 has property checks for harmonic means, multiplication, Pareto and fixture reproduction, plus browser coverage for the old controls. It lacks tests for log-odds boundaries, degenerate prevalence, prevalence-sensitive feasibility, Little's Law units, daily budgets, linked evidence and deployment exports.

## Migration

Generalize the scale construction and keep reference arithmetic independent. Add a deployment calculation layer over the existing candidate records. Extend mission gates, rank the sampled candidates, and plot the quality constraints with draggable boundaries. Keep the connected instruments and proof in a single workspace. Verify the updated workflow with property tests, fixture reproduction, Chromium mouse, keyboard and touch exercises, and real screenshots.
