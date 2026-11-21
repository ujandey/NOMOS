# Metric provenance

The dataset contains 1,200 synthetic labels and three seeded score columns with distinct overlapping class-conditional distributions. The Python generator uses seed 61273, a Bernoulli positive-class draw and clipped Gaussian scores. The manifest records the distribution parameters, threshold grid, generator digest and exact input hashes.

The endpoint rule is score ≥ threshold. Confusion counts determine precision, recall and false-positive rate with undefined denominators represented as null. The 95% Wilson intervals use the predicted-positive and actual-positive denominators for precision and recall respectively. They describe the fixture's sampling assumptions and carry no production claims.

Synthetic latency is calculated by the nearest-rank p95 of 240 stored timing samples per fixed inference profile. Cost per 1,000 requests is estimated from the synthetic profile's declared USD/request rate. Both remain constant across the model's thresholds.

`datasetSha256` and `benchmarkSha256` identify the seed fixture bytes. `evaluationSourceSha256` identifies the generator after line-ending normalization. `evaluationSha256` hashes the generated manifest before the hash field is appended. The evaluated timestamp is a fixed fixture epoch.

Run `npm run data:check` to regenerate the fixture bytes and compare them with the checked-in inputs and outputs. The TypeScript suite independently replays each candidate's confusion counts, derived ratios, p95 and price.
