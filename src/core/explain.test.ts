import { expect, test } from 'vitest';
import { candidates } from './demo';
import { DEPLOYMENT_MISSION, evaluateEnvelope, type Status } from './envelope';
import { explainStatus } from './explain';

test('every demo classification has a plain-language justification that names the deciding numbers', () => {
  const envelope = evaluateEnvelope(candidates, DEPLOYMENT_MISSION, 'min_fpr');
  const seen = new Set<Status>();
  for (const c of candidates) {
    const status = envelope.statuses.get(c.id)!;
    seen.add(status);
    const text = explainStatus(status, envelope.checks.get(c.id)!);
    expect(text.length).toBeGreaterThan(40);
    expect(text).not.toMatch(/undefined|NaN|null/);
  }
  expect([...seen].sort()).toEqual(['estimate-only', 'infeasible', 'uncertain']);
  expect(explainStatus('estimate-only', envelope.checks.get('balanced-t45')!))
    .toBe('The measured expected precision of 55.32% meets the minimum of 55.00%, but the evaluation sample cannot rule out 48.79%. 1 other limit is also unconfirmed.');
});
