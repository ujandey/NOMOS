import type { Candidate, Manifest, Mission } from '../core/contracts';
import { deploymentReadings, RATE_STABILITY, STEADY_STATE } from '../core/deployment';
import { candidateLabel, gateValue, percent } from '../core/display';
import { resolvePrevalence, STATUS_TEXT, type Envelope } from '../core/envelope';
import type { Alignment } from '../core/geometry';
import { Drawer } from './Drawer';
import { ConfidenceDetails, StatusBadge } from './Confidence';

const exact = (value: number | null) => value === null ? 'Unknown' : Number(value.toPrecision(12)).toString();
type Proof = {
  state: string; value: number | null; alignment: Alignment | null;
  verification: { passes: boolean; referenceValue: number | null; absoluteError: number | null;
    error: number | null; tolerance: number; criterion: string; residual: number | null } | null;
};

export function CalculationProof({ title, formula, reading }: { title: string; formula: string; reading: Proof }) {
  const proof = reading.verification;
  return <section className="proof-section">
    <h3>{title}</h3><p className="equation">{formula}</p>
    <dl className="provenance">
      <dt>{reading.alignment ? 'Geometric reading' : 'Reading'}</dt><dd>{exact(reading.value)} {reading.state === 'boundary' || reading.state === 'zero' ? '· exact boundary' : ''}</dd>
      {reading.alignment && <>
        <dt>Outer coordinates</dt><dd>({reading.alignment.left.x}, {exact(reading.alignment.left.y)}) · ({reading.alignment.right.x}, {exact(reading.alignment.right.y)})</dd>
        <dt>Center crossing</dt><dd>({reading.alignment.intersection.x}, {exact(reading.alignment.intersection.y)})</dd>
      </>}
      {proof && <>
        <dt>Independent reference</dt><dd>{exact(proof.referenceValue)}</dd>
        <dt>Absolute error</dt><dd>{proof.absoluteError?.toExponential(3) ?? 'Unavailable'}</dd>
        {proof.criterion === 'relative' && <><dt>Relative error</dt><dd>{proof.error?.toExponential(3) ?? 'Unavailable'}</dd></>}
        <dt>Collinearity residual</dt><dd>{proof.residual?.toExponential(3) ?? 'Outside finite scale'}{proof.residual !== null && ' SVG units'}</dd>
        <dt>Numerical check</dt><dd>{proof.passes ? 'Within tolerance' : 'Outside tolerance'} · {proof.criterion} {proof.tolerance.toExponential()}</dd>
      </>}
      {reading.state === 'missing' && <><dt>Status</dt><dd>Required inputs unavailable</dd></>}
      {reading.state === 'no-alerts' && <><dt>Status</dt><dd>Undefined because expected alerts are zero</dd></>}
    </dl>
  </section>;
}

export function Evidence({ candidate, manifest, mission, requests, envelope, close }: {
  candidate: Candidate; manifest: Manifest; mission: Mission; requests: number; envelope: Envelope; close: () => void;
}) {
  const resolved = resolvePrevalence(mission, candidate);
  const prior = resolved.value ?? 0;
  const results = deploymentReadings(candidate, prior, requests);
  const status = envelope.statuses.get(candidate.id) ?? 'unknown';
  const checks = envelope.checks.get(candidate.id) ?? [];
  return <Drawer titleId="evidence-title" label="Decision evidence" close={close}>
    <h2 id="evidence-title">{candidateLabel(candidate)}</h2>
    <p>Evaluated scores supply the conditional rates. Deployment prevalence and daily volume supply the scenario. Each inverse scale reads the straightedge crossing, then independent arithmetic checks the result.</p>
    <section className="proof-section" aria-labelledby="statistical-evidence">
      <div className="section-line"><h3 id="statistical-evidence">Statistical evidence</h3><StatusBadge status={status} /></div>
      <p>Point-estimate check: {checks.every(gate => gate.passes) ? 'every limit passes on the measured estimates' : 'one or more limits fail on the measured estimates'}.
        {' '}Statistical verdict: {STATUS_TEXT[status].toLowerCase()}.</p>
      <ConfidenceDetails checks={checks} envelope={envelope} candidateId={candidate.id} />
    </section>
    <div className="evidence-flow">TPR + FPR + prevalence → expected precision → expected F1<br />Daily volume + unit price → daily cost → budget gate</div>
    <p>The middle axis averages the two outer coordinates. Its half slope reads a sum for log and log-odds scales. The reciprocal plate keeps the full slope and reads an average.</p>
    <CalculationProof title="Prevalence-adjusted precision" formula="logit(P) = logit(π) + ln(TPR / FPR)" reading={results.precision} />
    <p>{percent(prior, 2)} {resolved.source === 'target' ? 'target' : 'sample'} prevalence · {percent(candidate.recall, 4)} TPR · {percent(candidate.falsePositiveRate, 4)} FPR. {RATE_STABILITY}</p>
    <CalculationProof title="Expected F1" formula="1/F₁ = ½ (1/P + 1/R)" reading={results.f1} />
    <CalculationProof title="Daily inference cost (USD)" formula="log(C) = log(N) + log(c)" reading={results.cost} />
    <p>{requests.toLocaleString()} requests/day · {candidate.costPer1kUsd === null ? 'Unknown unit price' : '$' + candidate.costPer1kUsd / 1000 + ' per request'} · {candidate.metricProvenance.cost}.</p>
    <CalculationProof title="Average requests in system" formula="L = λ (requests/s) × W (s)" reading={results.capacity} />
    <p>{STEADY_STATE} Mean response time is distinct from P95. Maximum sustainable capacity is unknown.</p>
    <section className="proof-section">
      <h3>Constraint checks</h3>
      <ul>{checks.map(check => <li key={check.key}>{check.label} · {gateValue(check.key, check.observed)} {check.passes ? 'meets' : 'misses'} {check.direction === 1 ? 'minimum' : 'maximum'} {gateValue(check.key, check.limit)} on the estimate{check.statistical ? (check.robust ? '; confirmed at the worst case ' : '; not confirmed at the worst case ') + gateValue(check.key, check.pessimistic) : ''}</li>)}</ul>
    </section>
    <section className="proof-section">
      <h3>Evaluation provenance</h3>
      <dl className="provenance">
        <dt>Origin</dt><dd>{manifest.origin === 'browser-import' ? 'Imported in this browser · not uploaded' : 'Bundled synthetic fixture'}</dd>
        {manifest.source && <><dt>Source file</dt><dd>{manifest.source.fileName} · {manifest.source.bytes.toLocaleString()} bytes · label “{manifest.source.columns.label}”, score “{manifest.source.columns.score}”</dd></>}
        <dt>Dataset</dt><dd>{candidate.datasetId} · {candidate.sampleCount.toLocaleString()} rows</dd>
        <dt>Classification</dt><dd>{candidate.metricProvenance.classification} · TP {candidate.tp}, FP {candidate.fp}, TN {candidate.tn}, FN {candidate.fn}</dd>
        <dt>Sample precision</dt><dd>{percent(candidate.precision, 4)} at the evaluation&rsquo;s own prevalence{candidate.precisionInterval && ' · fixture 95% Wilson interval ' + candidate.precisionInterval.map(v => percent(v, 2)).join('–') + ' (individual, unadjusted)'}</dd>
        <dt>Timing</dt><dd>{candidate.metricProvenance.latency} · {manifest.benchmarkMethod}</dd>
        <dt>Performance inputs</dt><dd>{candidate.performance ? candidate.performance.provenance + ' · ' + candidate.performance.method : 'Mean response time and measured throughput unavailable'}</dd>
        <dt>Pricing</dt><dd>{manifest.costMethod}</dd>
        <dt>Run · profile</dt><dd>{candidate.evaluationRunId} · {candidate.inferenceProfile}</dd>
        <dt>Dataset SHA-256</dt><dd><code>{candidate.datasetSha256}</code></dd>
        <dt>Evaluation SHA-256</dt><dd><code>{manifest.evaluationSha256}</code></dd>
        <dt>Benchmark SHA-256</dt><dd>{manifest.benchmarkSha256 ? <code>{manifest.benchmarkSha256}</code> : 'Not provided'}</dd>
        <dt>Evaluator SHA-256</dt><dd>{manifest.evaluationSourceSha256 ? <code>{manifest.evaluationSourceSha256}</code> : 'Browser evaluator · nomos-browser-3.1.0'}</dd>
      </dl>
    </section>
  </Drawer>;
}
