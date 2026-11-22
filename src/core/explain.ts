import type { Status, Violation } from './envelope';
import { gateValue } from './display';

const name = (gate: Violation) => gate.key === 'minPrecision' ? 'expected precision' : gate.label === 'P95 latency' ? 'P95 latency' : gate.label.toLowerCase();
const value = (gate: Violation, v: number | null) => gateValue(gate.key, v);
const limitWord = (gate: Violation) => gate.direction === 1 ? 'minimum' : 'maximum';

/** One plain-language sentence that justifies a configuration's classification. */
export function explainStatus(status: Status, checks: readonly Violation[]) {
  if (status === 'robust') {
    return 'Every limit still holds at the unfavourable end of each plausible range, so the evidence supports this configuration.';
  }
  if (status === 'unknown') {
    const gate = checks.find(item => !item.known)!;
    return `There is no evidence for ${name(gate)} in this dataset, so its ${limitWord(gate)} cannot be confirmed. Remove that limit or supply the measurement.`;
  }
  if (status === 'infeasible') {
    const gate = checks.find(item => item.known && !item.possible)!;
    return gate.statistical
      ? `Even the most favourable plausible ${name(gate)}, ${value(gate, gate.optimistic)}, misses the ${limitWord(gate)} of ${value(gate, gate.limit)}.`
      : `The ${name(gate)} of ${value(gate, gate.observed)} misses the ${limitWord(gate)} of ${value(gate, gate.limit)}.`;
  }
  if (status === 'estimate-only') {
    const open = checks.filter(item => !item.robust);
    const gate = open[0];
    const more = open.length > 1 ? ` ${open.length - 1} other limit${open.length > 2 ? 's are' : ' is'} also unconfirmed.` : '';
    return `The measured ${name(gate)} of ${value(gate, gate.observed)} meets the ${limitWord(gate)} of ${value(gate, gate.limit)}, ` +
      `but the evaluation sample cannot rule out ${value(gate, gate.pessimistic)}.${more}`;
  }
  const gate = checks.find(item => !item.passes)!;
  return `The measured ${name(gate)} of ${value(gate, gate.observed)} misses the ${limitWord(gate)} of ${value(gate, gate.limit)}, ` +
    `but the plausible range reaches ${value(gate, gate.optimistic)}. More evaluation data could change this verdict.`;
}
