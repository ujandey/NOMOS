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
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The fraud deployment challenge' })).toBeVisible();
  await expect(page.getByTestId('feasible-count')).toHaveText('1 / 27');
  await expect(page.getByRole('button', { name: 'Balanced · 0.45, feasible', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await instrument(page, 'Prevalence').click();
  expect(await reading(page, 'prevalence')).toBeCloseTo(expected(0.1), 12);
  await page.getByRole('button', { name: '1% prevalence', exact: true }).click();
  expect(await reading(page, 'prevalence')).toBeCloseTo(expected(0.01), 12);
  await expect(page.getByTestId('feasible-count')).toHaveText('0 / 27');
  await expect(page.getByText('No evaluated point meets every limit.')).toBeVisible();
  await instrument(page, 'Operating map').click();
  await expect(page.getByRole('button', { name: 'Balanced · 0.45, outside mission', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await edit(page.getByRole('spinbutton', { name: 'Min expected precision' }), '10');
  await expect(page.getByTestId('feasible-count')).toHaveText('1 / 27');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Independent reference', { exact: true })).toHaveCount(3);
  await expect(dialog.getByText('Within tolerance', { exact: false })).toHaveCount(3);
  await expect(dialog).toContainText(manifest.datasetSha256);
  await expect(dialog).toContainText('Maximum sustainable capacity is unknown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Evidence', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Export decision' }).click();
  const json = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Decision JSON' }).click();
  const record = JSON.parse(await readFile(await (await json).path(), 'utf8'));
  expect(record).toMatchObject({ schemaVersion: '3.0', candidateId: point.id, threshold: point.threshold, feasible: true,
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
  await expect(page.getByTestId('feasible-count')).toHaveText('0 / 27');
  await page.getByRole('button', { name: 'Restore default mission' }).click();
  await page.getByLabel('Feasible only').check();
  await expect(page.locator('[data-point]')).toHaveCount(1);
  await page.getByLabel('Feasible only').uncheck();
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
  await expect(page.getByTestId('feasible-count')).toHaveText('0 / 27');
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
  await page.getByRole('button', { name: 'Remove throughput minimum' }).click();
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
    if (viewport.width === 1440) await expect(page.locator('.drafting')).toHaveScreenshot('operating-map.png', { maxDiffPixelRatio: 0.015 });
    await page.screenshot({ path: test.info().outputPath(`map-${viewport.width}.png`), fullPage: viewport.width === 390 });
  }
  const checks = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(checks.violations).toEqual([]);
  await instrument(page, 'Prevalence').click();
  const prevalence = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(prevalence.violations).toEqual([]);
  await expect(page.locator('.alignment-paper').filter({ has: page.getByTestId('prevalence-geometry-value') }))
    .toHaveScreenshot('log-odds-alignment.png', { maxDiffPixelRatio: 0.015 });
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
    await expect(page.getByTestId('feasible-count')).toHaveText(variant === 'empty' ? '0 / 0' : '0 / 27');
    const evidence = page.getByRole('button', { name: 'Evidence', exact: true });
    if (variant === 'empty') await expect(evidence).toBeDisabled();
    else await expect(evidence).toBeEnabled();
  });
}
