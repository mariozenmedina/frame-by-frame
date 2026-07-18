import { expect, test } from '@playwright/test';

import {
  expectNoFixtureErrors,
  fixtureMetrics,
  fixtureState,
  openFixture,
  setupScenario,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openFixture(page);
});

test('commits responsive media replacements when the viewport changes', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await setupScenario(page, 'responsive');
  const wide = await page.evaluate(() => window.frameByFrameFixture.ready());

  expect(wide.activeBreakpoints).toEqual([]);
  expect(wide.bindings['responsive']?.selectedSource).toMatch(/primary\.(webm|mp4)$/u);

  await page.setViewportSize({ width: 500, height: 720 });
  await expect.poll(async () => (await fixtureState(page)).activeBreakpoints).toEqual(['compact']);
  const compact = await page.evaluate(() => window.frameByFrameFixture.ready());
  expect(compact.bindings['responsive']?.selectedSource).toMatch(/accent\.(webm|mp4)$/u);

  await page.setViewportSize({ width: 900, height: 720 });
  await expect.poll(async () => (await fixtureState(page)).activeBreakpoints).toEqual([]);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test.describe('reduced motion', () => {
  test('pins the first media endpoint while preserving native scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setupScenario(page, 'reduced-motion');
    const ready = await page.evaluate(() => window.frameByFrameFixture.ready());
    expect(ready.prefersReducedMotion).toBe(true);

    await page.evaluate(() => window.frameByFrameFixture.scrollDocument(1));
    await expect
      .poll(async () => (await fixtureState(page)).axes['y']?.progress ?? 0)
      .toBeGreaterThan(0.95);
    expect((await fixtureState(page)).bindings['reduced']?.resolution?.targetTime).toBe(0);
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => window.frameByFrameFixture.target('#reduced-video').currentTime,
          ),
      )
      .toBeLessThan(0.05);

    await page.evaluate(() => window.frameByFrameFixture.destroy());
    await expectNoFixtureErrors(page);
  });
});

test('draws and resizes the opt-in canvas renderer', async ({ page }) => {
  await setupScenario(page, 'canvas');
  const ready = await page.evaluate(() => window.frameByFrameFixture.ready());
  expect(ready.bindings['canvas']?.renderer).toBe('canvas');

  await expect
    .poll(
      async () =>
        await page.evaluate(() => window.frameByFrameFixture.canvas().nonTransparentPixels),
    )
    .toBeGreaterThan(0);
  const initial = await page.evaluate(() => window.frameByFrameFixture.canvas());
  expect(initial.width).toBe(initial.clientWidth);
  expect(initial.height).toBe(initial.clientHeight);

  await page.evaluate(() => {
    window.frameByFrameFixture.setCanvasCssWidth(240);
    window.frameByFrameFixture.refresh();
  });
  await page.evaluate(() => window.frameByFrameFixture.settle());
  await expect
    .poll(async () => (await page.evaluate(() => window.frameByFrameFixture.canvas())).width)
    .toBe(240);

  await page.evaluate(() => window.frameByFrameFixture.destroy());
  await expectNoFixtureErrors(page);
});

test('disables, reloads, destroys, and detaches the custom scroll source', async ({ page }) => {
  await setupScenario(page, 'lifecycle');
  await page.evaluate(() => window.frameByFrameFixture.ready());
  expect((await fixtureMetrics(page)).scrollListenerAdds).toBe(1);

  await page.evaluate(() => window.frameByFrameFixture.scrollSource(0, 0.35));
  const beforeDisable =
    (await fixtureState(page)).bindings['lifecycle']?.resolution?.targetTime ?? 0;
  const disabled = await page.evaluate(() => window.frameByFrameFixture.disable());
  expect(disabled.status).toBe('disabled');

  await page.evaluate(() => window.frameByFrameFixture.scrollSource(0, 1));
  expect((await fixtureState(page)).bindings['lifecycle']?.resolution?.targetTime).toBe(
    beforeDisable,
  );

  const enabled = await page.evaluate(() => window.frameByFrameFixture.enable());
  expect(enabled.status).toBe('ready');
  await expect
    .poll(async () => (await fixtureState(page)).bindings['lifecycle']?.resolution?.targetTime ?? 0)
    .toBeGreaterThan(0.35);

  const unloaded = await page.evaluate(() => window.frameByFrameFixture.unload());
  expect(unloaded.bindings['lifecycle']?.loadState).toBe('unloaded');
  await page.evaluate(() => window.frameByFrameFixture.load());
  await page.evaluate(() => window.frameByFrameFixture.ready());

  const updatesBeforeDestroy = (await fixtureMetrics(page)).updates.length;
  const destroyed = await page.evaluate(() => window.frameByFrameFixture.destroy());
  expect(destroyed.status).toBe('destroyed');
  const destroyedMetrics = await fixtureMetrics(page);
  expect(destroyedMetrics.scrollListenerRemoves).toBe(destroyedMetrics.scrollListenerAdds);

  await page.evaluate(() => window.frameByFrameFixture.scrollSource(0, 0));
  expect((await fixtureMetrics(page)).updates).toHaveLength(updatesBeforeDestroy);
  await expectNoFixtureErrors(page);
});
