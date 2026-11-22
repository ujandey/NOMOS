import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parse } from 'yaml';
import manifest from '../../data/evaluated.json' with { type: 'json' };

const base = 'http://127.0.0.1:4189/';
const point = manifest.candidates.find(c => c.id === 'balanced-t45')!;
const expected = (prior: number) => prior * point.recall / (prior * point.recall + (1 - prior) * point.falsePositiveRate);
const instrument = (page: Page, name: string) => page.getByRole('navigation', { name: 'Instruments' }).getByRole('button', { name, exact: true });
const reading = async (page: Page, kind: string) => Number(await page.getByTestId(kind + '-geometry-value').getAttribute('data-value'));

async function edit(field: Locator, value: string) {
  await field.fill(value);
  await field.press('Enter');
}

async function coords(marker: Locator, targetY?: number) {
  await marker.scrollIntoViewIfNeeded();
  return marker.evaluate((element, y) => {
    const svg = element as SVGGraphicsElement;
    const circle = svg.querySelector('circle');
    const startX = circle?.cx.baseVal.value ?? 0, startY = circle?.cy.baseVal.value ?? 0;
    const matrix = svg.getScreenCTM()!;
    const start = new DOMPoint(startX, startY).matrixTransform(matrix);
    const end = new DOMPoint(startX, y ?? startY).matrixTransform(matrix);
    return { x: start.x, y: start.y, endX: end.x, endY: end.y };
  }, targetY);
}

async function drag(page: Page, marker: Locator, target: { x: number; y: number }) {
  const start = await coords(marker);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 9 });
  await page.mouse.up();
}

test('offline deployment journey, numerical evidence and reproducible downloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()); });
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The fraud deployment challenge' })).toBeVisible();
  // Audit regression: the 55.32% estimate against a 55% limit is not a statistical pass.
  await expect(page.getByTestId('robust-count')).toHaveText('0 / 27');
  await expect(page.getByTestId('estimate-count')).toHaveText('1 passes on estimate');
  await expect(page.getByRole('button', { name: 'Balanced · 0.45, passes on estimate only', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('confidence-summary')).toContainText('cannot rule out 48.79%');
  await expect(page.getByTestId('no-robust')).toBeVisible();
  await instrument(page, 'Prevalence').click();
  expect(await reading(page, 'prevalence')).toBeCloseTo(expected(0.1), 12);
  await page.getByRole('button', { name: '1% prevalence', exact: true }).click();
  expect(await reading(page, 'prevalence')).toBeCloseTo(expected(0.01), 12);
  await expect(page.getByTestId('estimate-count')).toHaveText('0 pass on estimate');
  await expect(page.getByText('No evaluated point meets every limit.')).toBeVisible();
  await instrument(page, 'Operating map').click();
  await expect(page.getByRole('button', { name: 'Balanced · 0.45, fails the mission', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await edit(page.getByRole('spinbutton', { name: 'Min expected precision' }), '10');
  await expect(page.getByTestId('estimate-count')).toHaveText('1 passes on estimate');
  await expect(page.getByTestId('robust-count')).toHaveText('0 / 27');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Independent reference', { exact: true })).toHaveCount(3);
  await expect(dialog.getByText('Within tolerance', { exact: false })).toHaveCount(3);
  await expect(dialog).toContainText(manifest.datasetSha256);
  await expect(dialog).toContainText('Maximum sustainable capacity is unknown');
  await expect(dialog.getByRole('heading', { name: 'Statistical evidence' })).toBeVisible();
  await expect(dialog).toContainText('Based on 293 fraud and 907 legitimate evaluation records');
  await expect(dialog).toContainText('Clopper–Pearson exact intervals at 97.5% each');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Evidence', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Export decision' }).click();
  const json = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Decision JSON' }).click();
  const record = JSON.parse(await readFile(await (await json).path(), 'utf8'));
  expect(record).not.toHaveProperty('feasible');
  expect(record).toMatchObject({ schemaVersion: '3.1', candidateId: point.id, threshold: point.threshold,
    pointEstimateFeasible: true, robustlyFeasible: false, statisticalStatus: 'passes_on_estimate_only',
    uncertainty: { confidence: 0.95, simultaneousIntervals: 2, positives: 293, negatives: 907 },
    datasetSha256: manifest.datasetSha256, mission: { targetPrevalence: 0.01, minPrecision: 0.1 }, deployment: {
      expectedPrecision: expect.closeTo(expected(0.01), 12), requestsPerDay: 1e6, capacity: 'unknown',
    } });
  const yaml = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Configuration YAML' }).click();
  expect(parse(await readFile(await (await yaml).path(), 'utf8'))).toEqual(record);
  expect(errors).toEqual([]);
});

test('map snaps to evaluated points and constraints respond to mouse and keyboard', async ({ page }) => {
  await page.goto('/');
  const start = page.locator('[data-point="balanced-t45"]');
  const next = page.locator('[data-point="balanced-t50"]');
  const target = await coords(next);
  await drag(page, start, target);
  await expect(next).toHaveAttribute('aria-pressed', 'true');
  await next.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(start).toHaveAttribute('aria-pressed', 'true');
  const recall = page.getByRole('slider', { name: 'Recall boundary', exact: true });
  const recallStart = await coords(recall);
  await drag(page, recall, { x: recallStart.x, y: recallStart.y - 45 });
  expect(Number(await recall.getAttribute('aria-valuenow'))).toBeGreaterThan(97);
  const precision = page.getByRole('slider', { name: 'Precision boundary', exact: true });
  await precision.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(precision).toHaveAttribute('aria-valuenow', '56');
  await expect(page.getByTestId('estimate-count')).toHaveText('0 pass on estimate');
  // Audit regression: ArrowRight moves the precision handle right, which lowers the minimum precision.
  const x = async () => Number((await precision.getAttribute('transform'))!.match(/translate\(([\d.]+)/)![1]);
  const before = await x();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(precision).toHaveAttribute('aria-valuenow', '55');
  expect(await x()).toBeGreaterThan(before);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(precision).toHaveAttribute('aria-valuenow', '56');
  expect(await x()).toBeCloseTo(before, 6);
  await page.getByRole('button', { name: 'Restore default mission' }).click();
  await expect(page.getByTestId('selected-uncertainty')).toBeVisible();
  await page.getByLabel('Passing only').check();
  await expect(page.locator('[data-point]')).toHaveCount(1);
  await page.getByLabel('Passing only').uncheck();
  await page.getByRole('button', { name: 'Show full map' }).click();
  await expect(page.locator('[data-point]')).toHaveCount(27);
  await page.getByText('Evaluated configurations', { exact: false }).click();
  await page.getByRole('button', { name: 'Lite · 0.75', exact: true }).click();
  await expect(page.locator('[data-point="lite-t75"]')).toHaveAttribute('aria-pressed', 'true');
});

test('linked budgets, F1 practice and Little’s Law preserve their input scope', async ({ page }) => {
  await page.goto('/');
  await instrument(page, 'Economics').click();
  expect(await reading(page, 'cost')).toBeCloseTo(3000, 8);
  await edit(page.getByRole('spinbutton', { name: 'Requests per day' }), '2000000');
  expect(await reading(page, 'cost')).toBeCloseTo(6000, 8);
  await expect(page.getByTestId('estimate-count')).toHaveText('0 pass on estimate');
  await instrument(page, 'F1 alignment').click();
  expect(await reading(page, 'f1')).toBeCloseTo(2 * expected(0.1) * point.recall / (expected(0.1) + point.recall), 12);
  await page.getByRole('button', { name: 'Use practice inputs' }).click();
  const marker = page.getByRole('slider', { name: 'PRECISION marker', exact: true });
  await page.locator('.alignment-paper').filter({ has: page.getByTestId('f1-geometry-value') }).evaluate(node => { node.style.zoom = '1.15'; });
  const target = await coords(marker, 45 + 208 * (1 / 0.72 - 1));
  await drag(page, marker, { x: target.endX, y: target.endY });
  const p = Number(await marker.getAttribute('aria-valuenow'));
  expect(p).toBeCloseTo(0.72, 2);
  expect(await reading(page, 'f1')).toBeCloseTo(2 * p * 0.9 / (p + 0.9), 12);
  await instrument(page, 'Throughput').click();
  await expect(page.getByTestId('capacity-geometry-value')).toHaveText('Unknown');
  await page.getByRole('button', { name: 'Use practice inputs' }).click();
  expect(await reading(page, 'capacity')).toBeCloseTo(8, 12);
  await edit(page.getByRole('spinbutton', { name: 'Mean response time' }), '160');
  expect(await reading(page, 'capacity')).toBeCloseTo(16, 12);
  await instrument(page, 'F1 alignment').click();
  await expect(marker).toHaveAttribute('aria-valuenow', String(p));
  await instrument(page, 'Economics').click();
  await expect(page.getByRole('spinbutton', { name: 'Requests per day' })).toHaveValue('2000000');
});

test('compiler previews, rejects unrecognized limits and explains missing throughput', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Mission compiler', { exact: true }).click();
  await page.getByRole('button', { name: 'Use example' }).click();
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.getByText('Offline parser proposal')).toBeVisible();
  await expect(page.getByText(/interpreted as P95/)).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Min expected precision' })).toHaveValue('55');
  await page.getByRole('button', { name: 'Apply mission' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Min expected precision' })).toHaveValue('80');
  await page.getByLabel('Describe your requirements').fill('Recall at least 95%, max GPU utilization 50%');
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.getByRole('alert')).toContainText('gpu utilization');
  await expect(page.getByRole('button', { name: 'Apply mission' })).toHaveCount(0);
  await page.getByText('Additional constraints', { exact: true }).click();
  await page.getByRole('button', { name: 'Require measured throughput' }).click();
  await expect(page.getByText('Required evidence unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Remove measured throughput limit' }).click();
  await expect(page.getByText('Required evidence unavailable')).toHaveCount(0);
});

test('mobile touch, geometry and keyboard work at responsive scale', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(base);
    await instrument(page, 'Prevalence').tap();
    const marker = page.getByRole('slider', { name: 'FRAUD PREVALENCE marker', exact: true });
    const geometry = await coords(marker, 181);
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: geometry.x, y: geometry.y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: geometry.endX, y: geometry.endY }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const prior = Number(await marker.getAttribute('aria-valuenow'));
    expect(prior).toBeLessThan(0.05);
    expect(await reading(page, 'prevalence')).toBeCloseTo(expected(prior), 12);
    await marker.focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('prevalence-geometry-value')).toHaveText('0.00%');
    await expect(page.getByText('Exact probability boundary.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await instrument(page, 'Operating map').tap();
    const start = page.locator('[data-point="balanced-t45"]');
    const next = page.locator('[data-point="balanced-t50"]');
    const a = await coords(start), b = await coords(next);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(next).toHaveAttribute('aria-pressed', 'true');
    await start.tap();
    await expect(start).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await context.close();
  }
});

test('desktop and tablet snapshots, mobile layout and accessibility', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 960 }, { width: 320, height: 740 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { name: 'The fraud deployment challenge' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Operating map' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    // Pixel baselines are recorded on Windows; font rasterization differs on other platforms.
    if (viewport.width === 1440 && process.platform === 'win32') await expect(page.locator('.drafting')).toHaveScreenshot('operating-map.png', { maxDiffPixelRatio: 0.015 });
    await page.screenshot({ path: test.info().outputPath(`map-${viewport.width}.png`), fullPage: viewport.width === 390 });
  }
  const checks = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(checks.violations).toEqual([]);
  await instrument(page, 'Prevalence').click();
  const prevalence = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(prevalence.violations).toEqual([]);
  if (process.platform === 'win32') await expect(page.locator('.alignment-paper').filter({ has: page.getByTestId('prevalence-geometry-value') }))
    .toHaveScreenshot('log-odds-alignment.png', { maxDiffPixelRatio: 0.015 });
  await page.getByText('Estimate, range and worst case').click();
  const rail = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(rail.violations).toEqual([]);
});

for (const variant of ['empty', 'missing'] as const) {
  test('handles a fixture with ' + variant + ' evaluations', async ({ page }) => {
    await page.route('**/assets/index-*.js', async route => {
      const original = await route.fetch();
      let source = await original.text();
      if (variant === 'empty') source = source.replace(/candidates:\[\{.*?\}\],evaluationSha256:/s, 'candidates:[],evaluationSha256:');
      else source = source.replaceAll(/p95LatencyMs:\d+(?:\.\d+)?/g, 'p95LatencyMs:null');
      await route.fulfill({ response: original, body: source });
    });
    await page.goto('/');
    await expect(page.getByTestId('robust-count')).toHaveText(variant === 'empty' ? '0 / 0' : '0 / 27');
    await expect(page.getByTestId('estimate-count')).toHaveText('0 pass on estimate');
    const evidence = page.getByRole('button', { name: 'Evidence', exact: true });
    if (variant === 'empty') await expect(evidence).toBeDisabled();
    else await expect(evidence).toBeEnabled();
  });
}

/** Deterministic long-format file: a well-separated model and a noisy one, 2,000 records each. */
function scoredCsv() {
  const lines = ['transaction_id,model,is_fraud,fraud_probability'];
  for (let i = 0; i < 2000; i++) {
    const label = i % 5 === 0 ? 1 : 0;
    const sharp = label ? 0.9 - (i % 7) * 0.01 : 0.1 + (i % 7) * 0.01;
    const noisy = label ? 0.3 + (i % 11) * 0.06 : (i % 13) * 0.05;
    lines.push(`tx-${i},sharp,${label},${sharp.toFixed(3)}`, `tx-${i},noisy,${label},${noisy.toFixed(3)}`);
  }
  return Buffer.from(lines.join('\n') + '\n');
}

test('imports a local CSV, never uploads it, and refuses to invent missing evidence', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') posts.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nothing is uploaded');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'scores.csv', mimeType: 'text/csv', buffer: scoredCsv() });
  await expect(dialog.getByLabel('Label column')).toHaveValue('is_fraud');
  await expect(dialog.getByLabel('Probability column')).toHaveValue('fraud_probability');
  await expect(dialog.getByLabel('Model column')).toHaveValue('model');
  await expect(dialog.getByLabel('Row ID column')).toHaveValue('transaction_id');
  await expect(dialog.getByRole('region', { name: 'First rows of the file' })).toContainText('tx-0');
  await expect(dialog).toContainText('2,000 rows · 400 fraud · 1,600 legitimate');
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await dialog.getByRole('button', { name: 'Evaluate and load 38 configurations' }).click();
  await expect(page.getByRole('heading', { name: 'Your evaluation data' })).toBeVisible();
  await expect(page.getByTestId('prevalence-source')).toHaveText('Sample 20.00% · no target set');
  await expect(page.getByTestId('robust-count')).not.toHaveText('0 / 38');
  await expect(page.locator('.point-strip')).toContainText('Robustly feasible');
  await expect(page.getByRole('spinbutton', { name: 'Max p95 latency' })).toHaveCount(0);
  await instrument(page, 'Economics').click();
  await expect(page.getByTestId('cost-geometry-value')).toHaveText('Unknown');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Imported in this browser · not uploaded');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export decision' }).click();
  const json = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Decision JSON' }).click();
  const record = JSON.parse(await readFile(await (await json).path(), 'utf8'));
  expect(record).not.toHaveProperty('deployment');
  expect(record).toMatchObject({ datasetOrigin: 'browser-import', robustlyFeasible: true,
    metrics: { p95LatencyMs: null, costPer1kUsd: null }, datasetSource: { fileName: 'scores.csv', rows: 4000 },
    uncertainty: { expectedPrecision: { prevalence: 0.2, prevalenceSource: 'sample' } } });
  expect(record.mission).not.toHaveProperty('targetPrevalence');
  expect(record.mission).not.toHaveProperty('maxP95LatencyMs');
  expect(posts).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Demo data' }).click();
  await expect(page.getByRole('heading', { name: 'The fraud deployment challenge' })).toBeVisible();
  await expect(page.getByTestId('estimate-count')).toHaveText('1 passes on estimate');
});

test('kept limits without evidence are unknown, never satisfied', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'scores.csv', mimeType: 'text/csv', buffer: scoredCsv() });
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: /Evaluate and load/ }).click();
  await expect(page.getByTestId('robust-count')).toHaveText('0 / 38');
  await expect(page.getByTestId('estimate-count')).toHaveText('0 pass on estimate');
  await page.locator('[data-point="sharp-t50"]').press('Enter');
  await expect(page.locator('.point-strip')).toContainText('Evidence unavailable');
  await expect(page.getByTestId('confidence-summary')).toContainText('no evidence for P95 latency');
});

test('import validation explains delimiters, invalid values and one-class files', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog');
  const load = (text: string) => dialog.locator('input[type=file]').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
  const evaluate = dialog.getByRole('button', { name: /Evaluate and load/ });
  await load('id label score\n1 1 0.9\n');
  await expect(dialog.getByRole('alert')).toContainText('Only one column was found');
  await load('id;label;score\n1;1;0.9\n2;0;1.4\n3;yes;0.2\n4;0\n');
  await expect(dialog.getByLabel('Delimiter')).toHaveValue(';');
  await expect(dialog.getByRole('alert')).toContainText('Line 3: score "1.4"');
  await expect(dialog.getByRole('alert')).toContainText('Line 4: label "yes"');
  await expect(dialog.getByRole('alert')).toContainText('Line 5: expected 3 fields, found 2');
  await expect(evaluate).toBeDisabled();
  await load('label,score\n0,0.1\n0,0.3\n');
  await expect(dialog.getByRole('alert')).toContainText('only one class');
  await expect(evaluate).toBeDisabled();
  await load('');
  await expect(dialog.getByRole('alert')).toContainText('The file is empty.');
});

test('audit regressions: request steps, compiler phrasing and seconds', async ({ page }) => {
  await page.goto('/');
  await instrument(page, 'Economics').click();
  await edit(page.getByRole('spinbutton', { name: 'Requests per day' }), '2');
  const marker = page.getByRole('slider', { name: 'REQUESTS / DAY marker', exact: true });
  await marker.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(marker).toHaveAttribute('aria-valuenow', '4');
  await page.keyboard.press('ArrowDown');
  await expect(marker).toHaveAttribute('aria-valuenow', '3');
  await page.getByText('Mission compiler', { exact: true }).click();
  await page.getByLabel('Describe your requirements').fill('Catch 95% of fraud, daily budget under $3,000 per day and latency under 0.05 s.');
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.getByText(/Seconds were converted to 50 ms/)).toBeVisible();
  await page.getByRole('button', { name: 'Apply mission' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Max p95 latency' })).toHaveValue('50');
  await expect(page.getByRole('spinbutton', { name: 'Max daily cost' })).toHaveValue('3000');
});

test('production server sends security and caching headers', async ({ request }) => {
  const html = await request.get('/');
  expect(html.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(html.headers()['cache-control']).toBe('no-cache');
  expect(html.headers()['x-frame-options']).toBe('DENY');
  const script = (await html.text()).match(/src="(\/assets\/[^"]+\.js)"/)![1];
  expect((await request.get(script)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  const api = await request.post('/api/mission/parse', { data: { text: 'x' } });
  expect(api.status()).toBe(503);
});
