import { missionPatchSchema, missionSchema, type Mission } from './contracts';

const number = '([0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)';
const lower = '(?:must\\s+be\\s+|of\\s+)?(?:at\\s+least|>=|≥|no\\s+less\\s+than|minimum(?:\\s+of)?)\\s*';
const upper = '(?:must\\s+be\\s+|of\\s+)?(?:at\\s+most|<=|≤|<|under|below|no\\s+more\\s+than|maximum(?:\\s+of)?)\\s*';
const patterns = [
  ['minPrecision', '\\bprecision\\s*' + lower + number + '\\s*(%|percent\\b)?'],
  ['minRecall', '\\brecall\\s*' + lower + number + '\\s*(%|percent\\b)?'],
  ['maxP95LatencyMs', '\\b(?:p95(?:\\s+latency)?|latency)\\s*' + upper + number + '\\s*(ms|milliseconds?)\\b'],
  ['maxCostPer1kUsd', '\\bcost\\s*' + upper + '\\$?\\s*' + number + '\\s*(?:usd\\s*)?(?:/\\s*|per\\s+)(?:1,?000|1k|thousand)\\b(?:\\s+requests\\b)?'],
] as const;
type Key = keyof Mission;
export type Proposal = {
  mission: Mission;
  changes: { key: Key; from: number; to: number }[];
  source: 'llm' | 'fallback';
  warnings: string[];
};

export function proposePatch(rawPatch: unknown, current: Mission, source: Proposal['source'], warnings: string[] = []): Proposal {
  const patch = missionPatchSchema.parse(rawPatch);
  if (Object.keys(patch).length === 0) throw new Error('Specify at least one constraint with a number and units.');
  const mission = missionSchema.parse({ ...current, ...patch });
  const changes = (Object.keys(patch) as Key[]).filter(key => mission[key] !== current[key])
    .map(key => ({ key, from: current[key], to: mission[key] }));
  return { mission, changes, source, warnings };
}

export function parseOffline(text: string, current: Mission): Proposal {
  if (!text.trim() || text.length > 1000) throw new Error('Enter a mission of 1–1,000 characters.');
  let rest = text.toLowerCase();
  const patch: Partial<Mission> = {};
  let usedStrict = false;
  for (const [key, pattern] of patterns) {
    const matches = [...rest.matchAll(new RegExp(pattern, 'g'))];
    if (!matches.length) continue;
    if (matches.length > 1) throw new Error('Specify a single limit for each metric.');
    const [matched, numeric, unit] = matches[0];
    const quality = key === 'minPrecision' || key === 'minRecall';
    if (quality && !unit && Number(numeric) > 1) throw new Error('Add % or percent to whole-number quality limits.');
    patch[key] = quality && unit ? Number(numeric) / 100 : Number(numeric);
    usedStrict ||= /\b(?:under|below)\b|<(?![=])/.test(matched);
    rest = rest.replace(matched, ' ');
  }
  const residue = rest
    .replace(/\b(?:keep (?:all |the )?other constraints|leave (?:all |the )?other constraints (?:as is|unchanged)|please|keep|and|but|prioriti[sz]e|make|set|with|require)\b/g, '')
    .replace(/[\s,.;]/g, '');
  if (residue || !Object.keys(patch).length) {
    throw new Error('Use explicit limits such as “recall at least 90%” or “latency under 50 ms”. Check units and unsupported phrases.');
  }
  if (!missionPatchSchema.safeParse(patch).success) throw new Error('A limit is outside the supported numeric range.');
  return proposePatch(patch, current, 'fallback', usedStrict ? ['Mission limits are inclusive. Check the proposed maximum before applying.'] : []);
}

export async function compileMission(text: string, current: Mission): Promise<Proposal> {
  if (!text.trim() || text.length > 1000) throw new Error('Enter a mission of 1–1,000 characters.');
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
  const proposal = parseOffline(text, current);
  if (response?.status === 502) proposal.warnings.push('The model provider was unavailable. The offline parser processed this proposal.');
  return proposal;
}
