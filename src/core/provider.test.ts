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

test('the paid endpoint is disabled for public demos and non-loopback hosts unless explicitly allowed', async () => {
  const { missionConfig } = await import('../../server/mission.mjs');
  const base = { NOMOS_LLM_API_KEY: 'k', NOMOS_LLM_MODEL: 'm' };
  expect(missionConfig({}).enabled).toBe(false);
  expect(missionConfig(base).enabled).toBe(true);
  expect(missionConfig({ ...base, NOMOS_PUBLIC_DEMO: '1' })).toMatchObject({ enabled: false, reason: expect.stringMatching(/PUBLIC_DEMO/) });
  expect(missionConfig({ ...base, NOMOS_HOST: '0.0.0.0' })).toMatchObject({ enabled: false, reason: expect.stringMatching(/ALLOW_REMOTE/) });
  expect(missionConfig({ ...base, NOMOS_HOST: '0.0.0.0', NOMOS_LLM_ALLOW_REMOTE: '1' }).enabled).toBe(true);
  expect(missionConfig({ ...base, NOMOS_HOST: '0.0.0.0', NOMOS_LLM_ALLOW_REMOTE: '1', NOMOS_PUBLIC_DEMO: '1' }).enabled).toBe(false);
});

test('content type, size, per-client and daily limits run before any provider call', async () => {
  let providerCalls = 0;
  const upstream = await listen((_request, response) => {
    providerCalls++;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ minPrecision: null, minRecall: null, maxP95LatencyMs: 50,
      maxCostPer1kUsd: null, minThroughputRps: null, maxDailyCostUsd: null, maxFalsePositiveRate: null, targetPrevalence: null, unresolved: [] }) } }] }));
  });
  let clock = 0;
  const middleware = missionMiddleware({ NOMOS_LLM_API_KEY: 'secret-key', NOMOS_LLM_MODEL: 'stub', NOMOS_LLM_ENDPOINT: upstream.url,
    NOMOS_LLM_RATE_PER_MINUTE: '2', NOMOS_LLM_DAILY_LIMIT: '3' }, { now: () => clock });
  const app = await listen((request, response) => { void middleware(request, response, () => response.writeHead(404).end()); });
  const post = (body: string, type = 'application/json', path = '/api/mission/parse') =>
    fetch(app.url + path, { method: 'POST', body, headers: { 'Content-Type': type } });
  const valid = JSON.stringify(payload);
  try {
    expect((await post(valid, 'text/plain')).status).toBe(415);
    expect((await post('x'.repeat(9000))).status).toBe(413);
    expect(providerCalls).toBe(0);
    expect((await post(valid, 'application/json', '/api/mission/parse?debug=1')).status).toBe(200);
    expect((await post(valid)).status).toBe(200);
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(JSON.stringify(await limited.json())).not.toContain('secret-key');
    clock += 61_000;
    expect((await post(valid)).status).toBe(200);
    clock += 61_000;
    expect((await post(valid)).status).toBe(429);
    expect(providerCalls).toBe(3);
    clock += 86_400_000;
    expect((await post(valid)).status).toBe(200);
    expect((await fetch(app.url + '/api/mission/parse')).status).toBe(405);
  } finally {
    await Promise.all([close(app.server), close(upstream.server)]);
  }
});
