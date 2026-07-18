import { expect, test } from '@playwright/test';

import {
  expectNoFixtureErrors,
  fixtureMetrics,
  fixtureState,
  isWindowsWebKitMediaLimited,
  openFixture,
  setupScenario,
  windowsWebKitMediaSkipReason,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openFixture(page);
});

test('selects a playable source and resolves aggregate native readiness', async ({ page }) => {
  await setupScenario(page, 'document');
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());
  const binding = ready.bindings['document'];

  expect(binding?.loadState).toMatch(/^(metadata|ready)$/u);
  expect(binding?.selectedSource).toMatch(/primary\.(webm|mp4)$/u);

  const target = await page.evaluate(() => window.frameByFrameFixture.target('#document-video'));
  expect(target.readyState).toBeGreaterThanOrEqual(1);
  expect(target.duration ?? 0).toBeGreaterThan(0);
  expect(target.preload).toBe('metadata');

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('keeps manual loading out of readiness until load is requested', async ({ page }) => {
  const mounted = await setupScenario(page, 'manual');
  expect(mounted.bindings['manual']?.loadState).toBe('idle');

  const initiallyReady = await page.evaluate(() => window.frameByFrameFixture.ready());
  expect(initiallyReady.bindings['manual']?.loadState).toBe('idle');

  await page.evaluate(() => window.frameByFrameFixture.load());
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());
  expect(ready.bindings['manual']?.loadState).toMatch(/^(metadata|ready)$/u);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('activates first-use loading from the first useful resolution', async ({ page }) => {
  await setupScenario(page, 'first-use');
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());

  expect(ready.bindings['first-use']?.loadState).toMatch(/^(metadata|ready)$/u);
  expect(ready.bindings['first-use']?.selectedSource).toMatch(/primary\.(webm|mp4)$/u);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('activates viewport loading only after the target intersects', async ({ page }) => {
  const mounted = await setupScenario(page, 'viewport');
  expect(mounted.bindings['viewport']?.loadState).toBe('idle');

  const initiallyReady = await page.evaluate(() => window.frameByFrameFixture.ready());
  expect(initiallyReady.bindings['viewport']?.loadState).toBe('idle');

  await page.evaluate(() => window.frameByFrameFixture.revealViewportTarget());
  await expect
    .poll(async () => (await fixtureState(page)).bindings['viewport']?.selectedSource)
    .toMatch(/primary\.(webm|mp4)$/u);
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());
  expect(ready.bindings['viewport']?.loadState).toMatch(/^(metadata|ready)$/u);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('switches clips and applies a reverse per-segment mapping', async ({ page }) => {
  await setupScenario(page, 'multi-clip');
  await page.evaluate(() => window.frameByFrameFixture.ready());

  await page.evaluate(() => window.frameByFrameFixture.scrollSource(0, 0.75));
  await expect
    .poll(async () => (await fixtureState(page)).bindings['multi-clip']?.activeClipId)
    .toBe('accent');
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());
  const resolution = ready.bindings['multi-clip']?.resolution;

  expect(ready.bindings['multi-clip']?.selectedSource).toMatch(/accent\.(webm|mp4)$/u);
  expect(resolution?.clipId).toBe('accent');
  expect(resolution?.targetTime).toBeCloseTo(0.1, 2);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('owns and revokes a full-preload object URL after readiness', async ({
  browserName,
  page,
}) => {
  test.skip(isWindowsWebKitMediaLimited(browserName), windowsWebKitMediaSkipReason);

  await setupScenario(page, 'full');
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());

  expect(ready.bindings['full']?.selectedSource).toMatch(/primary\.(webm|mp4)$/u);
  await expect.poll(async () => (await fixtureMetrics(page)).objectUrlsCreated).toBe(1);
  expect(
    await page.evaluate(() => window.frameByFrameFixture.target('#loading-video').src),
  ).toMatch(/^blob:/u);
  expect((await fixtureMetrics(page)).loadProgressEvents).toBeGreaterThan(0);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  const metrics = await fixtureMetrics(page);
  expect(metrics.objectUrlsRevoked).toBe(metrics.objectUrlsCreated);
  expect(metrics.activeObjectUrls).toBe(0);
  await expectNoFixtureErrors(page);
});

test('aborts an in-flight full preload during destroy', async ({ page }) => {
  await setupScenario(page, 'full-abort');
  await expect.poll(async () => (await fixtureMetrics(page)).fetches).toBeGreaterThan(0);

  await page.evaluate(() => window.frameByFrameFixture.destroy());

  await expect.poll(async () => (await fixtureMetrics(page)).abortSignals).toBeGreaterThan(0);
  expect((await fixtureMetrics(page)).activeObjectUrls).toBe(0);
  await expectNoFixtureErrors(page);
});
