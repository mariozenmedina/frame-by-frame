import { expect, test } from '@playwright/test';

import {
  expectNoFixtureErrors,
  fixtureState,
  isWindowsWebKitMediaLimited,
  openFixture,
  setupScenario,
  windowsWebKitMediaSkipReason,
} from './helpers.js';

test.skip(
  ({ browserName }) => isWindowsWebKitMediaLimited(browserName),
  windowsWebKitMediaSkipReason,
);

test.beforeEach(async ({ page }) => {
  await openFixture(page);
});

test('maps the default document vertical source to native video time', async ({ page }) => {
  const mounted = await setupScenario(page, 'document');
  expect(mounted.sourceNodeType).toBe(9);
  await page.evaluate(() => window.frameByFrameFixture.ready());

  await page.evaluate(() => window.frameByFrameFixture.scrollDocument(0.9));

  await expect
    .poll(async () => (await fixtureState(page)).axes['y']?.progress ?? 0)
    .toBeGreaterThan(0.85);
  await expect
    .poll(async () => (await fixtureState(page)).bindings['document']?.resolution?.targetTime ?? 0)
    .toBeGreaterThan(0.3);
  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.frameByFrameFixture.target('#document-video').currentTime),
    )
    .toBeGreaterThan(0.25);

  const destroyed = await page.evaluate(() => window.frameByFrameFixture.destroy());
  expect(destroyed.status).toBe('destroyed');
  await expectNoFixtureErrors(page);
});

test('maps a custom element horizontal source independently', async ({ page }) => {
  const mounted = await setupScenario(page, 'custom-x');
  expect(mounted.sourceNodeType).toBe(1);
  await page.evaluate(() => window.frameByFrameFixture.ready());

  await page.evaluate(() => window.frameByFrameFixture.scrollSource(1, 0));

  await expect
    .poll(async () => (await fixtureState(page)).axes['x']?.progress ?? 0)
    .toBeGreaterThan(0.95);
  expect((await fixtureState(page)).axes['y']).toBeUndefined();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.frameByFrameFixture.target('#custom-x-video').currentTime),
    )
    .toBeGreaterThan(0.3);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('updates simultaneous axes from one custom source snapshot', async ({ page }) => {
  await setupScenario(page, 'simultaneous');
  await page.evaluate(() => window.frameByFrameFixture.ready());

  await page.evaluate(() => window.frameByFrameFixture.scrollSource(0.9, 0.45));

  await expect
    .poll(async () => (await fixtureState(page)).axes['x']?.progress ?? 0)
    .toBeGreaterThan(0.85);
  await expect
    .poll(async () => (await fixtureState(page)).axes['y']?.progress ?? 0)
    .toBeGreaterThan(0.4);

  const state = await fixtureState(page);
  expect(state.axes['y']?.progress).toBeLessThan(0.5);
  expect(state.bindings['custom-x']?.resolution?.targetTime ?? 0).toBeGreaterThan(
    state.bindings['custom-y']?.resolution?.targetTime ?? 0,
  );

  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.frameByFrameFixture.target('#custom-x-video').currentTime),
    )
    .toBeGreaterThan(0.3);
  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.frameByFrameFixture.target('#custom-y-video').currentTime),
    )
    .toBeGreaterThan(0.1);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});
