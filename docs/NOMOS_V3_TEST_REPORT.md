# NOMOS 3.0 verification report

## Executed checks

On Windows with Node 24.18.0, Python 3.11.7 and Playwright Chromium, `npm run check` completed successfully.

| Check | Result |
| --- | --- |
| Fixture regeneration | All three checked-in files matched byte for byte |
| ESLint and TypeScript | Passed |
| Vitest | 42 tests passed across seven files |
| Vite production build | Passed |
| Playwright against the production server | Eight tests passed |
| Visual regression | Operating map and log-odds plate matched their Chromium baselines |
| Automated accessibility | No axe violations in the mobile operating map or prevalence view under the configured WCAG tags |

## Verified behavior

- The tests independently reconstruct evaluation counts, conditional rates, P95 and pricing from the fixtures.
- Property tests verify actual line intersections and scale inversions for reciprocal F1, log economics, log-odds precision and Little's Law. Cases include undefined inputs, zero rates, exact prevalence endpoints, overflowing likelihood ratios and finite precision rounded to one.
- Solver tests cover exact evaluated candidates, prior-dependent invalidation, budget changes, measured-throughput requirements, Pareto comparisons and impossible missions.
- Chromium exercised selected-point snapping, mouse and keyboard boundary changes, exact input, axis dragging under CSS zoom, instrument switching, mobile touch dragging and touch cancellation, evidence focus restoration, compiler review, JSON/YAML round trips, and empty or missing evaluation data.
- Layout checks used widths of 320, 390, 820 and 1,440 CSS pixels. I inspected screenshots of the actual desktop, tablet and mobile app and the prevalence and evidence views.

Browser testing caught an offset bug that pulled the selected operating point away from the pointer when dragging from a marker. The corrected code preserves offsets on boundary handles and tracks the pointer directly when snapping candidates. The regression test now passes with both mouse and touch.

## Screenshots

[Desktop map](ux-screenshots/v3-desktop.png) · [Prevalence at 1%](ux-screenshots/v3-prevalence.png) · [Evidence drawer](ux-screenshots/v3-evidence.png) · [Tablet](ux-screenshots/v3-tablet.png) · [Mobile](ux-screenshots/v3-mobile.png)

## Verification scope

The provider contract was exercised against a local stub, including an unresolved response and invalid fields. A live external provider, real mobile hardware, non-Chromium browsers, and production inference benchmarks were outside this run. Browser checks use simulated touch. The source data remains a synthetic evaluation, with simulated P95 and declared unit pricing.
