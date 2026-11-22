import type { Mission } from './contracts';

/**
 * Mission for a freshly imported dataset. Quality limits carry over. A target prevalence is never
 * invented for the user's data, and limits the file cannot evidence are dropped when requested.
 */
export function importedMission(current: Mission, removeUnsupported: boolean): Mission {
  const { targetPrevalence: _target, maxP95LatencyMs, maxCostPer1kUsd, maxDailyCostUsd, minThroughputRps, ...quality } = current;
  void _target;
  if (removeUnsupported) return quality;
  return {
    ...quality,
    ...(maxP95LatencyMs !== undefined && { maxP95LatencyMs }),
    ...(maxCostPer1kUsd !== undefined && { maxCostPer1kUsd }),
    ...(maxDailyCostUsd !== undefined && { maxDailyCostUsd }),
    ...(minThroughputRps !== undefined && { minThroughputRps }),
  };
}
