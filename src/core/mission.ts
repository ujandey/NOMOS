import { missionPatchSchema, missionSchema, type Mission } from './contracts';

// Thousands separators are accepted only in complete groups of three (3,500 or 1,250,000).
const number = '((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?|\\.[0-9]+)';
const lower = '(?:must\\s+be\\s+|of\\s+)?(?:at\\s+least|>=|≥|>|above|no\\s+less\\s+than|minimum(?:\\s+of)?)\\s*';
const upper = '(?:must\\s+be\\s+|of\\s+)?(?:within|at\\s+most|<=|≤|<|under|below|no\\s+more\\s+than|maximum(?:\\s+of)?)\\s*';
const patterns = [
  ['minPrecision', '\\b(?:expected\\s+)?precision\\s*' + lower + number + '\\s*(%|percent\\b)?'],
  ['minRecall', '\\brecall\\s*' + lower + number + '\\s*(%|percent\\b)?'],
  ['minRecall', '\\b(?:catch|detect|flag)(?:es)?\\s+(?:' + lower + ')?' + number +
    '\\s*(%|percent\\b)\\s+of\\s+(?:all\\s+)?(?:the\\s+)?(?:fraudulent\\s+transactions|fraud(?:\\s+cases)?)\\b'],
  ['maxP95LatencyMs', '\\b(?:p95(?:\\s+latency)?|latency|respond)\\s*' + upper + number + '\\s*(ms|milliseconds?|s|secs?|seconds?)\\b'],
  ['maxCostPer1kUsd', '\\bcost\\s*' + upper + '\\$?\\s*' + number + '\\s*(?:usd\\s*)?(?:/\\s*|per\\s+)(?:1,?000|1k|thousand)\\b(?:\\s+requests\\b)?'],
  ['maxDailyCostUsd', '\\b(?:daily\\s+)?(?:budget|cost)\\s*' + upper + '\\$?\\s*' + number + '\\s*(?:usd\\s*)?(?:/\\s*day|per\\s+day|daily)\\b'],
  ['maxFalsePositiveRate', '\\b(?:false[- ]positive rate|fpr)\\s*' + upper + number + '\\s*(%|percent\\b)?'],
  ['minThroughputRps', '\\b(?:measured\\s+)?throughput\\s*' + lower + number + '\\s*(?:req(?:uests)?\\s*/\\s*s|requests\\s+per\\s+second)\\b'],
  ['targetPrevalence', '\\b(?:target\\s+|fraud\\s+)?prevalence\\s*(?:of|=|at|is)?\\s*' + number + '\\s*(%|percent\\b)?'],
] as const;
type Key = keyof Mission;
export const OFFLINE_ONLY = import.meta.env?.VITE_NOMOS_OFFLINE_ONLY === '1';
export type Proposal = {
  mission: Mission;
  changes: { key: Key; from: number | undefined; to: number }[];
  source: 'llm' | 'fallback';
  warnings: string[];
};

export function proposePatch(rawPatch: unknown, current: Mission, source: Proposal['source'], warnings: string[] = []): Proposal {
  const patch = missionPatchSchema.parse(rawPatch);
  if (Object.keys(patch).length === 0) throw new Error('Specify at least one constraint with a number and units.');
  const mission = missionSchema.parse({ ...current, ...patch });
  const changes = (Object.keys(patch) as Key[]).filter(key => mission[key] !== current[key])
    .map(key => ({ key, from: current[key], to: mission[key]! }));
  return { mission, changes, source, warnings };
}

export function parseOffline(text: string, current: Mission): Proposal {
  if (!text.trim() || text.length > 1000) throw new Error('Enter a mission of 1–1,000 characters.');
  let rest = text.toLowerCase();
  const patch: Partial<Mission> = {};
  let usedStrict = false;
  let convertedSeconds = false;
  for (const [key, pattern] of patterns) {
    const matches = [...rest.matchAll(new RegExp(pattern, 'g'))];
    if (!matches.length) continue;
    if (matches.length > 1 || patch[key] !== undefined) throw new Error('Specify a single limit for each metric.');
    const [matched, numeric, unit] = matches[0];
    const quality = key === 'minPrecision' || key === 'minRecall' || key === 'maxFalsePositiveRate' || key === 'targetPrevalence';
    if (quality && !unit && Number(numeric) > 1) throw new Error('Add % or percent to whole-number quality limits.');
    const value = Number(numeric.replaceAll(',', ''));
    const seconds = key === 'maxP95LatencyMs' && unit !== undefined && unit.startsWith('s');
    if (seconds) convertedSeconds = true;
    // toPrecision removes binary noise such as 0.07 × 1000 = 70.00000000000001.
    patch[key] = quality && unit ? value / 100 : seconds ? Number((value * 1000).toPrecision(12)) : value;
    usedStrict ||= /\b(?:under|below|above)\b|[<>](?![=])/.test(matched);
    rest = rest.replace(matched, ' ');
  }
  const residue = rest
    .replace(/\b(?:keep (?:all |the )?other constraints|leave (?:all |the )?other constraints (?:as is|unchanged)|please|keep|and|but|prioriti[sz]e|make|set|with|require)\b/g, '')
    .replace(/[\s,.;]/g, '');
  if (residue || !Object.keys(patch).length) {
    throw new Error('Give one number and unit per limit. Unrecognized requirement: ' + (rest.trim() || text) +
      ' Supported limits are precision, recall, false-positive rate, prevalence, P95 latency, USD per day or per 1,000 requests, and measured throughput.');
  }
  if (!missionPatchSchema.safeParse(patch).success) throw new Error('A limit is outside the supported numeric range.');
  const warnings = usedStrict ? ['Mission limits are inclusive. Confirm that including the stated boundary is acceptable.'] : [];
  if (/\brespond\b/.test(text.toLowerCase())) warnings.push('The response-time requirement was interpreted as P95 latency. Confirm this before applying.');
  if (convertedSeconds) warnings.push('Seconds were converted to ' + patch.maxP95LatencyMs + ' ms. Confirm the converted limit.');
  return proposePatch(patch, current, 'fallback', warnings);
}

export async function compileMission(text: string, current: Mission): Promise<Proposal> {
  if (!text.trim() || text.length > 1000) throw new Error('Enter a mission of 1–1,000 characters.');
  // Public static builds never contact a paid model endpoint.
  if (OFFLINE_ONLY) return parseOffline(text, current);
  let response: Response | null = null;
  try {
    response = await fetch('/api/mission/parse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, currentMission: current }), signal: AbortSignal.timeout(7500),
    });
    if (response.ok) {
      const result = await response.json();
      return proposePatch(result.patch, current, 'llm', ['Confirm the extracted units and inclusive limits before applying.']);
    }
  } catch {
    // Static hosting, offline browsers and provider errors all use the local grammar.
  }
  if (response?.status === 422) {
    const result = await response.json();
    throw new Error(result.error);
  }
  const proposal = parseOffline(text, current);
  if (response?.status === 502) proposal.warnings.push('The model provider was unavailable. The offline parser processed this proposal.');
  if (response?.status === 429) proposal.warnings.push('Model-assisted parsing is rate limited. The offline parser processed this proposal.');
  return proposal;
}
