import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parse } from 'yaml';
import manifest from '../../data/evaluated.json' with { type: 'json' };

const point = manifest.candidates.find(c => c.id === 'balanced-t55')!;

async function dragCoordinates(page: Page, side: 'left' | 'right', endY: number) {
  const marker = page.getByTestId(side + '-marker');
  await marker.scrollIntoViewIfNeeded();
  return marker.evaluate((group, target) => {
    const circle = group.querySelector('circle')!;
    const matrix = circle.getScreenCTM()!;
    const start = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(matrix);
    const end = new DOMPoint(circle.cx.baseVal.value, target).matrixTransform(matrix);
    return { x: start.x, y: start.y, endX: end.x, endY: end.y };
  }, endY);
}

async function dragAxis(page: Page, side: 'left' | 'right', endY: number) {
  const position = await dragCoordinates(page, side, endY);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.mouse.move(position.endX, position.endY, { steps: 10 });
  await page.mouse.up();
}

async function readGeometry(page: Page) {
  return Number(await page.getByTestId('geometry-value').getAttribute('data-value'));
}

test('full offline workflow with exact metrics, mission diff and matching downloads', async ({ page }) => {
  const faults: string[] = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4189/') ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calibrate a fraud model' })).toBeVisible();
  await expect(page.getByText('Synthetic demo data', { exact: true })).toBeVisible();
  await expect(page.getByText('2 feasible configurations')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath('desktop.png') });
  await expect(page.getByLabel('Model variant')).toHaveValue('balanced');
  await page.getByLabel('Threshold', { exact: true }).selectOption(point.id);
  await expect(page.getByTestId('precision')).toContainText((point.precision * 100).toFixed(1) + '%');
  await expect(page.getByTestId('recall')).toContainText((point.recall * 100).toFixed(1) + '%');
  await expect(page.getByTestId('p95LatencyMs')).toContainText(point.p95LatencyMs.toFixed(2));
  await expect(page.getByTestId('costPer1kUsd')).toContainText('$3.00');
  expect(await readGeometry(page)).toBeCloseTo(2 * point.precision * point.recall / (point.precision + point.recall), 13);
  await page.getByRole('button', { name: 'View evidence' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(point.datasetSha256);
  await expect(drawer.locator('.confusion')).toHaveText('TP' + point.tp + 'FP' + point.fp + 'TN' + point.tn + 'FN' + point.fn);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View evidence' })).toBeFocused();
  await page.getByRole('button', { name: 'Tighten to 50 ms' }).click();
  await expect(page.getByText('No feasible configuration', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Threshold', { exact: true })).toHaveValue(point.id);
  await expect(page.getByText('Closest evaluated trade-offs')).toBeVisible();
  await page.getByRole('button', { name: 'Restore default mission' }).click();
  await expect(page.getByText('2 feasible configurations')).toBeVisible();

  await page.getByText('Mission Compiler', { exact: true }).click();
  await page.getByRole('button', { name: 'Use example' }).click();
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.getByText('Offline parser proposal')).toBeVisible();
  await expect(page.getByText('p95 latency: 100 ms → 50 ms')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Max p95 latency' })).toHaveValue('100');
  await page.getByRole('button', { name: 'Apply mission' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Max p95 latency' })).toHaveValue('50');
  await expect(page.getByText('No feasible configuration', { exact: true })).toBeVisible();

  const jsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Decision JSON' }).click();
  const jsonFile = await jsonPromise;
  expect(jsonFile.suggestedFilename()).toBe('nomos-decision.json');
  const decision = JSON.parse(await readFile(await jsonFile.path(), 'utf8'));
  expect(decision).toMatchObject({ candidateId: point.id, threshold: point.threshold, status: 'review_only',
    datasetSha256: manifest.datasetSha256, evaluationSha256: manifest.evaluationSha256,
    mission: { maxP95LatencyMs: 50 }, instruments: { f1: { verification: { passes: true } }, cost: { verification: { passes: true } } } });
  const yamlPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Configuration YAML' }).click();
  const yamlFile = await yamlPromise;
  expect(yamlFile.suggestedFilename()).toBe('nomos-config.yaml');
  expect(parse(await readFile(await yamlFile.path(), 'utf8'))).toEqual(decision);
  expect(faults).toEqual([]);
});

test('both instruments compute from the intersection during drag and keyboard interaction', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the straightedge' }).click();
  await expect(page.getByTestId('geometry-value')).toHaveText('84.71%');
  await expect(page.getByTestId('verification')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.chart-paper')).toHaveScreenshot('reciprocal-alignment.png', { maxDiffPixelRatio: 0.015 });
  const f1TargetY = 45 + 208 * (1 / 0.72 - 1);
  await dragAxis(page, 'left', f1TargetY);
  const p = Number(await page.getByRole('slider', { name: 'PRECISION marker' }).getAttribute('aria-valuenow'));
  expect(p).toBeCloseTo(0.72, 2);
  expect(await readGeometry(page)).toBeCloseTo(2 * p * 0.9 / (p + 0.9), 12);
  const rightMarker = page.getByRole('slider', { name: 'RECALL marker' });
  await rightMarker.focus();
  await page.keyboard.press('ArrowUp');
  await expect(rightMarker).toHaveAttribute('aria-valuenow', '0.91');
  await page.getByText('Why the line computes').click();
  await page.getByRole('checkbox', { name: 'Numerical check' }).check();
  await expect(page.getByTestId('verification')).toContainText('Within tolerance');
  await expect(page.getByTestId('intersection-proof')).toContainText('crossing (380,');

  await page.getByRole('button', { name: 'Inference cost', exact: true }).click();
  await expect(page.getByTestId('geometry-value')).toHaveText('$3,000.00');
  await page.getByRole('checkbox', { name: 'Numerical check' }).uncheck();
  await expect(page.locator('.chart-paper')).toHaveScreenshot('cost-alignment.png', { maxDiffPixelRatio: 0.015 });
  const costTargetY = 45 + (208 / 5) * 4;
  await dragAxis(page, 'right', costTargetY);
  const price = Number(await page.getByRole('slider', { name: 'USD / REQUEST marker' }).getAttribute('aria-valuenow'));
  expect(price).toBeCloseTo(0.01, 3);
  expect(await readGeometry(page)).toBeCloseTo(price * 1_000_000, 8);
  const volume = page.getByRole('spinbutton', { name: 'Monthly requests' });
  await volume.fill('0');
  await volume.press('Enter');
  await expect(page.getByTestId('geometry-value')).toHaveText('$0.00');
  await expect(page.getByText(/zero boundary/i)).toBeVisible();
  await expect(page.getByTestId('intersection')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.getByTestId('geometry-value')).toHaveText('$3,000.00');
});

test('mobile layout, accessible controls, invalid parse and real projection selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth);
  expect(await fits()).toBe(true);
  const slider = page.getByRole('slider', { name: 'Sweep evaluated thresholds' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.55');
  await expect(page.getByTestId('p95LatencyMs')).toContainText('77.87');
  const candidateMarker = page.getByRole('button', { name: 'Lite · 0.60', exact: true });
  await candidateMarker.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Threshold', { exact: true })).toHaveValue('lite-t60');
  await page.getByRole('button', { name: 'Data table' }).click();
  await expect(page.getByRole('table', { name: 'Evaluated operating points' }).locator('tbody tr')).toHaveCount(27);
  await page.getByRole('button', { name: 'High Recall · 0.50', exact: true }).click();
  await expect(page.getByLabel('Model variant')).toHaveValue('high_recall');
  await page.getByText('Mission Compiler', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Mission instruction' }).fill('Make it safe and cheap.');
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Use explicit limits');
  await expect(page.getByRole('button', { name: 'Apply mission' })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Max p95 latency' })).toHaveValue('100');
  expect(await fits()).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true });
});

test('touch drag works at mobile scale', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4189/');
    await page.getByRole('button', { name: 'Try the straightedge' }).tap();
    const coordinates = await dragCoordinates(page, 'right', 45 + 208 * (1 / 0.75 - 1));
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: coordinates.x, y: coordinates.y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: coordinates.endX, y: coordinates.endY }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const r = Number(await page.getByRole('slider', { name: 'RECALL marker' }).getAttribute('aria-valuenow'));
    expect(r).toBeCloseTo(0.75, 2);
    expect(await readGeometry(page)).toBeCloseTo(2 * 0.8 * r / (0.8 + r), 12);
  } finally {
    await context.close();
  }
});

test('first view exposes the model, practice action and accessible limits on desktop, tablet and phone', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const model = await page.getByLabel('Model variant', { exact: true }).boundingBox();
    expect(model!.y + model!.height).toBeLessThan(viewport.height);
    await expect(page.getByRole('button', { name: 'Try the straightedge' })).toBeInViewport();
    await expect(page.locator('.alignment-chart')).toBeInViewport({ ratio: 0.9 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  }
  await page.getByRole('button', { name: /^Synthetic demo data/ }).click();
  await expect(page.getByRole('dialog')).toContainText(manifest.datasetId);
  await expect(page.getByRole('dialog')).toContainText(manifest.datasetSha256);
  await page.getByRole('button', { name: 'Close dataset' }).click();
  await expect(page.getByRole('button', { name: /^Synthetic demo data/ })).toBeFocused();
  await page.getByRole('link', { name: 'Export decision' }).click();
  await expect(page).toHaveURL(/#decision$/);
  await page.goBack();
  await expect(page.getByLabel('Threshold', { exact: true })).toHaveValue('balanced-t50');
  await page.goForward();
  await expect(page).toHaveURL(/#decision$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) }))).toEqual([]);
  }
});

test('off-center grab, live geometry at zoom, reset and cost scale boundary', async ({ page }) => {
  await page.goto('/');
  const tryInstrument = page.getByRole('button', { name: 'Try the straightedge' });
  await tryInstrument.focus();
  await page.keyboard.press('Enter');
  const input = page.getByRole('slider', { name: 'PRECISION marker' });
  await expect(input).toBeFocused();
  let location = await dragCoordinates(page, 'left', 45 + 208 * (1 / 0.72 - 1));
  await page.mouse.move(location.x, location.y + 10);
  await page.mouse.down();
  await page.mouse.move(location.x + 5, location.y + 10);
  await page.mouse.up();
  await expect(input).toHaveAttribute('aria-valuenow', '0.8');

  await page.evaluate(() => { document.documentElement.style.zoom = '1.25'; });
  location = await dragCoordinates(page, 'left', 45 + 208 * (1 / 0.72 - 1));
  await page.mouse.move(location.x, location.y + 7);
  await page.mouse.down();
  await page.mouse.move(location.endX, location.endY + 7, { steps: 12 });
  await expect.poll(() => readGeometry(page)).toBeLessThan(0.81);
  await page.mouse.up();
  expect(Number(await input.getAttribute('aria-valuenow'))).toBeCloseTo(0.72, 2);
  const resizedTarget = 45 + 208 * (1 / 0.82 - 1);
  location = await dragCoordinates(page, 'left', resizedTarget);
  await page.mouse.move(location.x, location.y);
  await page.mouse.down();
  await page.setViewportSize({ width: 620, height: 900 });
  location = await dragCoordinates(page, 'left', resizedTarget);
  await page.mouse.move(location.endX, location.endY, { steps: 8 });
  await page.mouse.up();
  expect(Number(await input.getAttribute('aria-valuenow'))).toBeCloseTo(0.82, 2);
  await input.focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('geometry-value')).toHaveText('0.00%');
  await expect(page.getByTestId('intersection')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.getByTestId('geometry-value')).toHaveText('84.71%');
  await page.getByRole('button', { name: 'Inference cost', exact: true }).click();
  const volume = page.getByRole('spinbutton', { name: 'Monthly requests' });
  await volume.fill('999999999999');
  await volume.press('Enter');
  const labels = page.locator('.result-axis .axis-label');
  expect(await labels.count()).toBeGreaterThan(4);
  expect(await labels.allTextContents()).not.toContain('$0');
  await volume.fill('1.5');
  await volume.press('Enter');
  await expect(volume).toHaveAttribute('aria-invalid', 'true');
  await volume.press('Escape');
  await expect(volume).toHaveValue('999999999999');
  const handle = page.getByRole('slider', { name: 'REQUESTS marker' });
  await handle.focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('geometry-value')).toHaveText('$0.00');
  await expect(handle.locator('circle').first()).toHaveAttribute('cy', '32');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('intersection')).toBeVisible();
});

test('limit edit, threshold feedback, nearest feasible candidate and stale compiler results', async ({ page }) => {
  await page.goto('/');
  const maxLatency = page.getByRole('spinbutton', { name: 'Max p95 latency' });
  await maxLatency.fill('1');
  await expect(page.getByText('2 feasible configurations')).toBeVisible();
  await maxLatency.press('Enter');
  await expect(page.getByText('No feasible configuration', { exact: true })).toBeVisible();
  await expect(page.getByTestId('p95LatencyMs')).toContainText('over maximum');
  await expect(page.getByText('Closest evaluated point', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore default mission' }).click();
  for (const [label, value, metric, reason] of [
    ['Min precision', '100', 'precision', 'below minimum'],
    ['Min recall', '99', 'recall', 'below minimum'],
    ['Max cost / 1k', '1', 'costPer1kUsd', 'over maximum'],
  ]) {
    const field = page.getByRole('spinbutton', { name: label });
    await field.fill(value);
    await field.press('Enter');
    await expect(page.getByTestId(metric)).toContainText(reason);
    await expect(page.getByText('No feasible configuration', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restore default mission' }).click();
  }
  await page.getByRole('button', { name: 'Impossible preset' }).click();
  await expect(page.getByText('No feasible configuration', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore default mission' }).click();
  await page.getByRole('button', { name: 'Restore default mission' }).click();
  const threshold = page.getByLabel('Threshold', { exact: true });
  await threshold.selectOption('balanced-t75');
  await expect(page.locator('.reading-note')).toContainText(/Precision .*recall .*F1/);
  await page.getByRole('button', { name: /Try Balanced.*meets all limits/ }).click();
  await expect(threshold).toHaveValue('balanced-t50');
  await expect(page.locator('.projection [tabindex="0"]')).toHaveCount(1);
  await page.locator('.projection [tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(threshold).toHaveValue('balanced-t55');
  await expect(page.locator('.projection [tabindex="0"]')).toBeFocused();

  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/mission/parse', async route => {
    await ready;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.getByText('Mission Compiler', { exact: true }).click();
  const prompt = page.getByRole('textbox', { name: 'Mission instruction' });
  await prompt.fill('Make it safe');
  const preview = page.getByRole('button', { name: 'Preview changes' });
  await preview.click();
  await prompt.fill('latency under 50 ms');
  release();
  await expect(preview).toBeEnabled();
  await expect(page.locator('.compiler [role=alert]')).toHaveCount(0);
  await preview.click();
  await expect(page.getByText('Offline parser proposal')).toBeVisible();
  await expect(maxLatency).toHaveValue('100');
  await page.getByRole('button', { name: 'Apply mission' }).click();
  await expect(maxLatency).toHaveValue('50');
});

test('exports disclose practice scope, match the linked forecast and recover from a failed download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Inference cost', exact: true }).click();
  const volume = page.getByRole('spinbutton', { name: 'Monthly requests' });
  await volume.fill('750000');
  await volume.press('Enter');
  await expect(page.getByTestId('geometry-value')).toHaveText('$2,250.00');
  await page.getByRole('button', { name: 'Try the straightedge' }).click();
  await volume.fill('20000');
  await volume.press('Enter');
  await expect(page.getByTestId('geometry-value')).toHaveText('$60.00');
  await expect(page.locator('.export-scope')).toContainText('evaluated point');
  const button = page.getByRole('button', { name: 'Decision JSON' });
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = (value: Blob | MediaSource) => {
      URL.createObjectURL = create;
      void value;
      throw new Error('Download preparation unavailable');
    };
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Could not prepare the download');
  const pending = page.waitForEvent('download');
  await button.click();
  const record = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(record.decisionId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(record.instruments.cost).toMatchObject({ inputs: { monthlyRequests: 750000, unitPriceUsd: 0.003 }, verification: { passes: true } });
  expect(record.instruments.cost.value).toBeCloseTo(2250, 9);
  await expect(page.getByRole('status').filter({ hasText: 'Download started' })).toBeVisible();
  await page.getByLabel('Threshold', { exact: true }).selectOption('balanced-t55');
  await expect(page.getByText(/Download started/)).toHaveCount(0);
});

const asset = /\/assets\/index-[^/]+\.js$/;
const quote = '[\x60"\\x27]';
for (const variant of ['malformed', 'empty', 'missing latency'] as const) {
  test('handles an evaluation fixture with ' + variant, async ({ page }) => {
    await page.route(asset, async route => {
      const response = await route.fetch();
      const original = await response.text();
      const next = variant === 'malformed'
        ? original.replace(new RegExp('datasetSha256:' + quote + '[a-f0-9]{64}' + quote), 'datasetSha256:"invalid"')
        : variant === 'empty'
          ? original.replace(/candidates:\[\{id:.*?\}\],evaluationSha256:/s, 'candidates:[],evaluationSha256:')
          : original.replace(new RegExp('(id:' + quote + 'balanced-t50' + quote + '.*?)p95LatencyMs:[0-9.]+', 's'), '$1p95LatencyMs:null');
      expect(next).not.toBe(original);
      await route.fulfill({ response, body: next });
    });
    await page.goto('/');
    if (variant === 'malformed') {
      await expect(page.getByRole('heading', { name: 'Evaluation could not load' })).toBeVisible();
    } else if (variant === 'empty') {
      await expect(page.getByText(/No evaluated settings are available/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Decision JSON' })).toBeDisabled();
      await expect(page.getByTestId('geometry-value')).toHaveText('84.71%');
    } else {
      await page.getByLabel('Threshold', { exact: true }).selectOption('balanced-t50');
      await expect(page.getByTestId('p95LatencyMs')).toContainText('Metric unavailable');
      await expect(page.locator('.mission-status')).toContainText('1 of 4 limits missed');
    }
  });
}
