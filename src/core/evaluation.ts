export function calculateConfusionMatrix(labels: readonly number[], scores: readonly number[], threshold: number) {
  if (labels.length !== scores.length || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('Score/label lengths or threshold are invalid.');
  }
  const counts = { tp: 0, fp: 0, tn: 0, fn: 0 };
  labels.forEach((label, index) => {
    const score = scores[index];
    if ((label !== 0 && label !== 1) || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new RangeError('Expected a binary label and finite score in [0,1].');
    }
    const predicted = score >= threshold;
    if (predicted) {
      if (label) counts.tp++;
      else counts.fp++;
    } else if (label) counts.fn++;
    else counts.tn++;
  });
  return counts;
}

export function evaluateOperatingPoint(labels: readonly number[], scores: readonly number[], threshold: number) {
  const { tp, fp, tn, fn } = calculateConfusionMatrix(labels, scores, threshold);
  return { tp, fp, tn, fn, sampleCount: labels.length,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    falsePositiveRate: fp + tn ? fp / (fp + tn) : null,
  };
}
