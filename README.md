# NOMOS 3.1

NOMOS is a geometric computer for AI calibration. It opens with a fraud deployment mission and a map of evaluated model thresholds. Drag the operating point and quality boundaries, change the target fraud prevalence, verify the connected geometric readings, and export the decision.

NOMOS separates a measured estimate from a statistical verdict. A configuration is **robustly feasible** only when every classification limit holds at the worst case of 95% simultaneous confidence ranges (Clopper–Pearson with Bonferroni adjustment). An estimate that merely clears a limit is reported as *passes on estimate only*. In the bundled demo, Balanced / 0.45 estimates 55.32% precision against a 55% limit, but its plausible range reaches down to 48.79%, so no configuration is robustly feasible. See [statistical integrity](docs/NOMOS_V3_1_INTEGRITY.md).

![NOMOS 3.0 operating map](docs/ux-screenshots/v3-desktop.png)

## Run locally

Node 24 and Python 3.11 are used for the project's verification workflow.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production run, use `npm run build` and `npm start`, then open `http://127.0.0.1:4173`. The built `dist/` directory also works on a static host. The container path is `docker compose up --build`.

## Work the mission

- Drag a point or choose an evaluated threshold from the configuration table. Drag the recall, precision and false-positive boundaries, or edit their exact limits in the rail.
- Switch from 10% to 1% prevalence and watch expected precision and feasible candidates change. Open the prevalence plate to operate the log-odds straightedge.
- Use F1 for the harmonic mean, Economics for daily cost, and Throughput for Little's Law. Independent practice inputs are available for F1, Economics and Throughput.
- Read the *Confidence check* in the rail. The box around the selected point on the map is its plausible region, and robust means the whole box, including the red worst-case corner, sits inside the shaded quality region.
- Open Evidence for numerical checks, statistical evidence and dataset provenance. Export the selected decision as JSON or YAML. The record separates `pointEstimateFeasible` from `robustlyFeasible`.
- Select **Import CSV** to evaluate your own scored data (a 0/1 label and a probability, with optional model and row-ID columns). The file is processed in the browser and never uploaded. NOMOS does not invent latency, cost, throughput or a target prevalence for it.

The fixture evaluates synthetic classification scores for 27 thresholds. P95 uses simulated timing, prices are declared assumptions, and measured throughput and capacity are unknown. Prior adjustment assumes that conditional TPR and FPR remain applicable in the target population.

## Verify

```sh
npx playwright install chromium
npm run check
```

The command checks the regenerated evidence, lint, TypeScript, Vitest, production build and Chromium journeys. To regenerate the bundled evidence, run `npm run data:generate`.

The offline mission compiler works after installation without an external account. To enable the optional model-assisted parser, copy `.env.example` to `.env` and set `NOMOS_LLM_API_KEY` and `NOMOS_LLM_MODEL`. The server can use an optional OpenAI-compatible endpoint. Review the proposed limits before applying them.

The paid endpoint is rate limited, and it stays off when the server listens beyond loopback unless `NOMOS_LLM_ALLOW_REMOTE=1` is set. The limits control cost; they are not authentication. For a **public demo**, deploy `npm run build:static` to a static host. That bundle cannot call the endpoint (`npm run check:static` verifies this), and `public/_headers` supplies the security headers. Alternatively, set `NOMOS_PUBLIC_DEMO=1` on the Node server.

## Documentation

- [Statistical integrity, fixes and limitations](docs/NOMOS_V3_1_INTEGRITY.md)
- [Demo walkthrough](docs/NOMOS_V3_DEMO.md)
- [Architecture and dependency graph](docs/NOMOS_V3_ARCHITECTURE.md)
- [Nomogram derivations](docs/NOMOGRAM_MATHEMATICS.md)
- [V2 audit and migration plan](docs/NOMOS_V3_AUDIT.md)
- [Verification report](docs/NOMOS_V3_TEST_REPORT.md)
