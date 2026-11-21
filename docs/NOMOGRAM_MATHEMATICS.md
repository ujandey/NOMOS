# Nomogram mathematics

## Shared construction

Put the input scales on parallel axes at xₗ and xᵣ. The output axis is at their midpoint. For the encoded input points A and B, intersect the segment with the middle axis using t = (x − xₗ)/(xᵣ − xₗ) and y = (1 − t)yₗ + tyᵣ. Invert the output calibration at that coordinate. The adapters verify the resulting value with a separately implemented numerical formula. The geometric residual is the perpendicular distance from the computed crossing to the straightedge, in SVG units.

If A and B encode transforms a and b using yₗ = oₗ + ka and yᵣ = oᵣ + kb, the middle encodes their sum with origin (oₗ + oᵣ)/2 and slope k/2. The SVG uses the same transformations as the calculation, and equal spacing makes the result invariant to the screen size.

## Prevalence-aware precision

Let π be the target prior, R the evaluated true-positive rate, and Q the evaluated false-positive rate. Among predicted positives, the true fraction is πR / (πR + (1 − π)Q). Its odds equal prior odds times R/Q, so logit(P) = logit(π) + ln(R/Q). The left scale uses logit, the right uses ln, and the half-slope output inverts with the stable logistic function. The right coordinate uses ln(R) − ln(Q) to avoid materializing an overflowing likelihood ratio. Adaptive calibration covers finite inputs. Probabilities that round to floating-point zero or one can still have a finite crossing.

At π = 0 or π = 1, precision is 0 or 1 if alerts are expected. With no true alerts and some false alerts it is 0. With no false alerts and some true alerts it is 1. With neither, precision is undefined. Missing conditional rates leave the reading unknown. These cases are explicit boundary calculations without a finite intersection. The independent reference normally divides weighted alert probabilities and rescales them when subnormal products lose precision.

The adjustment assumes conditional TPR and FPR are stable at the selected threshold across populations. Dataset precision cannot substitute for deployment precision. The source Wilson interval describes the source distribution and does not quantify deployment uncertainty.

## F1

F1 is the harmonic mean of precision and recall. Using y = o + k(1/v − 1) on all axes means the crossing averages reciprocals. Inverting yields 1/F1 = (1/P + 1/R)/2. Zero on either input uses the conventional zero F1 extension, including when both are zero. Unknown precision or recall produces no reading. The linked F1 uses expected precision under the chosen target prevalence, and practice F1 accepts independent values.

## Inference economics

For N requests/day and c USD/request, daily cost is C = Nc. Both outer scales encode log₁₀ relative to N₀ = 1,000,000 and c₀ = 0.001 USD/request. The output uses half the slope and origin reference C₀ = N₀c₀ = 1,000 USD/day. Direct multiplication verifies the crossing. Zero inputs give a zero product outside the finite logarithmic scale. Negative or nonfinite inputs are invalid. A positive mathematical result outside floating-point range is reported as invalid.

## Throughput and occupancy

Little's Law gives L = λW for a stable system with matching request boundaries and long-run averages. The left scale uses requests/second relative to 10. Mean response time is entered in milliseconds relative to 100 ms, equivalent to 0.1 seconds in the multiplication. The output reference is 1 request. The independent arithmetic converts milliseconds to seconds before evaluating the product. P95 and a daily arithmetic average do not establish sustainable throughput or capacity.

## The feasible set

For an interior prior and positive minimum precision p, the equivalent quality boundary is Q ≤ πR(1 − p)/((1 − π)p). The shaded projection also requires recall above its minimum and FPR below its maximum. Screen coordinates apply a square root to Q, so the precision boundary is sampled as a curve for rendering. The engine checks the original candidate values and their derived metrics, independent of screen pixels or the visual approximation. At zero expected alerts, precision stays undefined regardless of shading. Feasibility is the conjunction of the applicable gates for the finite sampled set.
