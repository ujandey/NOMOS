# Fraud deployment demo

Run the app with `npm run dev` and open the printed local URL. The demo runs on the bundled evaluation with no provider key.

1. Read Mission 001. The bank has one million transactions per day and needs 95% recall or better. The starting scenario targets 10% fraud prevalence, 55% expected precision, at most 10% FPR, 100 ms P95 and $3,500/day.
2. Look at the rail. It reads **0 / 27 robustly feasible · 1 passes on estimate**. The selected point, **Balanced / 0.45**, is amber: *Passes on estimate only*. Its estimated precision is 55.32% against a 55% minimum. The fixture has 293 fraud and 907 legitimate records, so the evidence cannot rule out precision as low as 48.79% or an FPR as high as 11.16%.
3. On the map, the dashed box around the selected point is its plausible region at 95% simultaneous confidence. The red **worst case** corner falls outside the shaded quality region, past both the precision curve and the 10% FPR line. A point is robustly feasible only when its whole box fits inside the region. Open **Estimate, range and worst case** in the rail to see each limit's range bar, and tick **All ranges** to compare points.
4. Open **Prevalence**. The straightedge reads about **55.32%**. Use the exact **1% prevalence** button. Expected precision falls to about **10.12%** while recall stays **98.29%**. The same conditional false-positive rate now produces many more false alerts relative to true alerts.
5. Return to **Operating map**. Balanced / 0.45 now **fails the mission**: even its most favourable plausible precision (12.84%) misses 55%. Enter **10%** as the minimum expected precision. It passes on its estimate again but is still not robust, because its worst case is 7.97%.
6. Open **Economics**. With one million daily requests the crossing reads **$3,000/day**. Change to two million and confirm the budget excludes the point. Restore one million.
7. Open **Evidence**. The *Statistical evidence* section shows the point-estimate check and the statistical verdict separately, with sample sizes and the interval method. The remaining sections show the crossing coordinates, independent reference values, numerical errors, confusion counts and fixture hashes.
8. Select **Export decision**. The record contains `pointEstimateFeasible`, `robustlyFeasible`, `statisticalStatus` and an `uncertainty` block. These carry the intervals, the confidence, the Bonferroni family and the assumptions.

## Bring your own data

Select **Import CSV** and choose a file with a 0/1 label and a probability column. Optional model and row-ID columns are supported (long format). The dialog detects the delimiter and proposes a column mapping. It previews the first rows and lists every validation problem with line numbers. Nothing is uploaded. After confirmation, NOMOS evaluates 19 thresholds per model.

Imported data has no latency, cost or throughput, so those plates read *Unknown*. By default, the import turns those limits off. If you keep them, every point reads *Evidence unavailable*, never *passes*. No target prevalence is assumed. Expected precision uses the file's own sample prevalence until you choose one. **Demo data** restores the fixture.
