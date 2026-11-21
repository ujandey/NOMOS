import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { missionMiddleware } from '../../server/mission.mjs';
import { DEFAULT_MISSION } from './contracts';

async function listen(listener: RequestListener) {
  const server = createServer(listener);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + (server.address() as AddressInfo).port };
}
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
const payload = { text: 'Latency under 50 ms', currentMission: DEFAULT_MISSION };

test('optional provider accepts validated structured data and rejects malformed replies', async () => {
  let injectedField = false;
  let unresolved: string[] = [];
  const upstream = await listen(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    const input = JSON.parse(body);
    if (input.response_format.json_schema.strict !== true) { response.writeHead(400).end(); return; }
    const constraints = { minPrecision: null, minRecall: null, maxP95LatencyMs: 50, maxCostPer1kUsd: null,
      minThroughputRps: null, maxDailyCostUsd: null, maxFalsePositiveRate: null, targetPrevalence: null, unresolved };
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(injectedField ? { ...constraints, feasible: true } : constraints) } }] }));
  });
  const middleware = missionMiddleware({ NOMOS_LLM_API_KEY: 'local-test', NOMOS_LLM_MODEL: 'stub', NOMOS_LLM_ENDPOINT: upstream.url });
  const app = await listen((request, response) => { void middleware(request, response, () => response.writeHead(404).end()); });
  const send = (body: unknown) => fetch(app.url + '/api/mission/parse', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
  try {
    const valid = await send(payload);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ patch: { maxP95LatencyMs: 50 } });
    expect((await send({ ...payload, currentMission: { ...DEFAULT_MISSION, minRecall: -1 } })).status).toBe(400);
    unresolved = ['Which latency percentile should apply?'];
    const unclear = await send(payload);
    expect(unclear.status).toBe(422);
    expect(await unclear.json()).toEqual({ error: unresolved.join(' ') });
    unresolved = [];
    injectedField = true;
    expect((await send(payload)).status).toBe(502);
  } finally {
    await Promise.all([close(app.server), close(upstream.server)]);
  }
});
