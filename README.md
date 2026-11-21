# NOMOS V2

NOMOS is a local ML calibration workbench with two working geometric calculators. Compute F1 or monthly inference cost with a straightedge, inspect 27 evaluated operating points, and export the configuration and evidence behind a deployment decision.

## Run the demo

Requires Node.js 24 and npm. Python 3.11 is used to regenerate the fixtures and run the full verification suite.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The core workbench, fonts, synthetic evidence and deterministic mission parser work without internet or credentials after installation.

### Production run

```sh
npm run build
npm start
```

Open http://127.0.0.1:4173. You can also serve `dist/` with a static host.

## Try it

1. Choose a model and threshold at the top of the workbench. Click **Try the straightedge** and drag an outer handle. At 80% precision and 90% recall, F1 is about 84.71%. Open **Why the line computes** to inspect the crossing and the independent numerical check.
2. Switch to **Inference cost**. The practice inputs start at 1,000,000 requests and $0.003 per request, yielding $3,000. Choose **Use model inputs** to calculate at the evaluated unit price. Drag the requests handle or type an exact volume.
3. Sweep thresholds or select a point under **Explore operating points**. Tighten the latency cap to 50 ms and inspect the failed limits. Open **Mission Compiler** and select **Use example** to preview and apply the same limit in plain language.
4. Restore the default mission, select a feasible point, inspect **View evidence**, and download **Decision JSON** and **Configuration YAML**. Exports for infeasible selections are marked `review_only`.

## Verify and regenerate

```sh
npx playwright install chromium
npm run check
npm run data:generate
npm run data:check
```

The check command compares regenerated fixture bytes, lints, typechecks, runs Vitest, builds the production bundle and tests it with Chromium. Screenshot baselines were captured on Windows. See the [redesign report](docs/UX_REDESIGN_REPORT.md), [three-minute demo](docs/DEMO_SCRIPT.md), and [build log](docs/BUILD_LOG.md).

## Optional model-assisted parser

Copy `.env.example` to `.env` and set `NOMOS_LLM_API_KEY` and `NOMOS_LLM_MODEL` to use an OpenAI-compatible Chat Completions endpoint that supports strict JSON schema responses. The provider receives the mission text and current limits from the local server. Secrets stay server-side. If the provider is unavailable or produces invalid constraints, NOMOS uses the offline grammar. The parser's proposal requires explicit application, and the browser's deterministic solver evaluates feasibility.

## Container

```sh
docker compose up --build
```

Open http://127.0.0.1:4173. Supply optional provider environment variables at runtime. [Architecture](docs/ARCHITECTURE.md) describes the static and server paths. [Metric provenance](docs/METRIC_PROVENANCE.md) explains the simulated evidence and how to reproduce it.
