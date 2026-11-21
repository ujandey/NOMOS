export const f1Reference = (p: number, r: number) => {
  const small = Math.min(p, r), large = Math.max(p, r);
  return large === 0 ? 0 : small * (2 / (1 + small / large));
};
export const costReference = (requests: number, price: number) => requests * price;
export const occupancyReference = (rate: number, meanMs: number) =>
  (Math.max(rate, meanMs) / 1000) * Math.min(rate, meanMs);
export function precisionReference(prior: number, tpr: number, fpr: number) {
  const trueAlerts = prior * tpr, falseAlerts = (1 - prior) * fpr;
  // Preserve the ratio when two small products lose precision before division.
  if (prior > 0 && prior < 1 && tpr > 0 && fpr > 0 && Math.min(trueAlerts, falseAlerts) < 2.2250738585072014e-307) {
    const logTrue = Math.log(prior) + Math.log(tpr), logFalse = Math.log1p(-prior) + Math.log(fpr);
    const shift = Math.max(logTrue, logFalse);
    const scaledTrue = Math.exp(logTrue - shift), scaledFalse = Math.exp(logFalse - shift);
    return scaledTrue / (scaledTrue + scaledFalse);
  }
  return trueAlerts + falseAlerts === 0 ? null : trueAlerts / (trueAlerts + falseAlerts);
}
