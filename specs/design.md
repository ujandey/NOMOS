# Design

The geometry kernel accepts inputs, calibration and axis positions. It maps endpoints to y coordinates, intersects the line at the middle x coordinate and applies the middle inverse. Reciprocal and logarithmic domains have explicit zero-boundary readings. Missing inputs produce an unavailable reading. The chart renders the kernel's points directly.

Evaluation, mission compilation and export keep their own typed boundaries. Candidate IDs represent exact model, inference profile and threshold tuples. User controls select an existing candidate and changes to the mission recompute its gates. Provider proposals cross a strict schema boundary and await human confirmation.

See the [architecture](../docs/ARCHITECTURE.md) and [metric provenance](../docs/METRIC_PROVENANCE.md) for data flow.
