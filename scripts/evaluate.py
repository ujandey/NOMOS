"""Generate versioned synthetic evidence using only the Python standard library."""
import argparse
import csv
import hashlib
import io
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 61273
SAMPLES = 1200
PREVALENCE = 0.24
DATASET = "fraud-demo-v2"
VERSION = "2.0.0"
EVALUATED_AT = "2026-11-21T00:00:00Z"  # Fixed synthetic fixture epoch.
THRESHOLDS = [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]
PROFILES = [
    ("lite", "Lite", (0.66, 0.2), (0.36, 0.20), (26, 6), 0.0012),
    ("balanced", "Balanced", (0.76, 0.155), (0.24, 0.16), (63, 9), 0.003),
    ("high_recall", "High Recall", (0.82, 0.135), (0.21, 0.17), (86, 12), 0.0046),
]


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=True, indent=2, allow_nan=False) + "\n").encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def score(rng, distribution):
    return round(min(1, max(0, rng.gauss(*distribution))), 8)


def generate():
    rng = random.Random(SEED)
    rows = []
    for index in range(SAMPLES):
        label = int(rng.random() < PREVALENCE)
        scores = [score(rng, positive if label else negative) for _, _, positive, negative, _, _ in PROFILES]
        rows.append((f"tx-{index + 1:04}", label, *scores))
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["id", "label", *(p[0] for p in PROFILES)])
    writer.writerows(rows)
    return rows, output.getvalue().encode()


def bounds(successes, trials):
    """95% Wilson score binomial interval, conditional on the metric denominator."""
    if not trials:
        return None
    z = 1.95996398454
    p = successes / trials
    denominator = 1 + z * z / trials
    middle = (p + z * z / (2 * trials)) / denominator
    radius = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
    return [max(0, middle - radius), min(1, middle + radius)]


def evaluate(rows, column, threshold):
    tp = fp = tn = fn = 0
    for row in rows:
        label, predicted = row[1], row[column] >= threshold
        tp += label == 1 and predicted
        fp += label == 0 and predicted
        tn += label == 0 and not predicted
        fn += label == 1 and not predicted
    return dict(tp=tp, fp=fp, tn=tn, fn=fn,
                precision=tp / (tp + fp) if tp + fp else None,
                recall=tp / (tp + fn) if tp + fn else None,
                falsePositiveRate=fp / (fp + tn) if fp + tn else None,
                precisionInterval=bounds(tp, tp + fp), recallInterval=bounds(tp, tp + fn))


def build():
    rows, dataset = generate()
    rng = random.Random(SEED + 1)
    benchmarks = {}
    for model, _, _, _, timing, price in PROFILES:
        samples = [round(max(1, rng.gauss(*timing)), 3) for _ in range(240)]
        benchmarks[model + "-cpu"] = dict(latencySamplesMs=samples, unitPriceUsd=price)
    fixture = json_bytes(benchmarks)
    source_hash = sha(Path(__file__).read_text(encoding="utf-8").encode())
    run_id = "eval-" + sha((sha(dataset) + sha(fixture) + source_hash).encode())[:16]
    candidates = []
    for index, (model, name, _, _, _, _) in enumerate(PROFILES):
        profile = model + "-cpu"
        samples = sorted(benchmarks[profile]["latencySamplesMs"])
        p95 = samples[math.ceil(0.95 * len(samples)) - 1]
        for threshold in THRESHOLDS:
            candidates.append(dict(
                id=f"{model}-t{round(threshold * 100):02}", modelId=model, modelName=name,
                modelVersion="demo-2", threshold=threshold, inferenceProfile=profile,
                datasetId=DATASET, datasetSha256=sha(dataset), evaluationRunId=run_id,
                evaluationCodeVersion=VERSION, sampleCount=len(rows), evaluatedAt=EVALUATED_AT,
                metricProvenance=dict(classification="synthetic-demo", latency="synthetic-demo", cost="estimated"),
                p95LatencyMs=p95, costPer1kUsd=1000 * benchmarks[profile]["unitPriceUsd"],
                **evaluate(rows, index + 2, threshold)))
    manifest = dict(
        schemaVersion="2.0", datasetId=DATASET, datasetSha256=sha(dataset),
        benchmarkSha256=sha(fixture), evaluationSourceSha256=source_hash,
        seed=SEED, sampleCount=len(rows), evaluationRunId=run_id,
        benchmarkMethod="Synthetic timing samples per fixed CPU profile, 240/profile, nearest-rank p95",
        costMethod="Estimated from declared synthetic USD/request rate multiplied by 1,000",
        intervalMethod="95% Wilson score interval, conditional on each metric denominator",
        generation=dict(prevalence=PREVALENCE, thresholds=THRESHOLDS,
                        distributions={p[0]: dict(positive=p[2], negative=p[3], latency=p[4], unitPriceUsd=p[5]) for p in PROFILES}),
        candidates=candidates)
    manifest["evaluationSha256"] = sha(json_bytes(manifest))
    return {"data/seed/fraud.csv": dataset, "data/seed/benchmarks.json": fixture, "data/evaluated.json": json_bytes(manifest)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare regenerated bytes with fixtures")
    options = parser.parse_args()
    for name, value in build().items():
        path = ROOT / name
        if options.check:
            if not path.is_file() or path.read_bytes() != value:
                raise SystemExit(f"Fixture differs: {name}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(value)
        print(f"{name}: sha256={sha(value)}")


if __name__ == "__main__":
    main()
