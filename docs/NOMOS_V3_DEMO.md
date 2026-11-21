# Fraud deployment demo

Run the app with `npm run dev` and open the printed local URL. The demo runs on the bundled evaluation with no provider key.

1. Read Mission 001. The bank has one million transactions per day and needs 95% recall or better. The starting scenario targets 10% fraud prevalence, 55% expected precision, at most 10% FPR, 100 ms P95 and $3,500/day.
2. Drag the selected mark across nearby points. The crosshair snaps to sampled thresholds. The rail explains which requirements each point misses. Select the feasible diamond at **Balanced / 0.45**, or choose it from **Evaluated configurations**.
3. Open **Prevalence**. The straightedge reads about **55.32%**. Drag the prevalence handle toward 1%, or use the exact **1% prevalence** button. Expected precision falls to about **10.12%** while recall stays **98.29%**. The same conditional false-positive rate now produces many more false alerts relative to true alerts.
4. Return to **Operating map**. The quality region narrows, the selected point is outside the mission, and the feasible count reads **0 / 27**. Drag the precision boundary or enter **10%** as the minimum expected precision. With the original latency, FPR and budget, this restores **1 / 27**. This is a scenario trade-off for the demo. It changes the precision requirement.
5. Open **Economics**. With one million daily requests the crossing reads **$3,000/day**. Change to two million and confirm the budget excludes the point. Restore one million.
6. Open **Evidence**. Inspect the crossing coordinates, independent reference values, numerical errors, confusion counts and fixture hashes. Throughput and mean response time are unavailable in the linked evaluation. The **Throughput** plate offers illustrative practice inputs.
7. Select **Export decision** and download JSON or YAML. Both contain the selected threshold, the scenario, the mission checks, the geometry and the evaluation hashes. Exporting before the mission is feasible marks the file `review_only`.

The [desktop workstation](ux-screenshots/v3-desktop.png), [prevalence plate](ux-screenshots/v3-prevalence.png), [evidence drawer](ux-screenshots/v3-evidence.png) and [mobile layout](ux-screenshots/v3-mobile.png) show the running app.
