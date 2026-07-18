import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

type BrowserScenario = Parameters<Window['frameByFrameFixture']['setup']>[0];
const unexpectedPageErrors = new WeakMap<Page, string[]>();

export const windowsWebKitMediaSkipReason =
  'Playwright recommends macOS for WebKit video playback; Windows media presentation is recorded as partial evidence.';

export const isWindowsWebKitMediaLimited = (browserName: string): boolean =>
  process.platform === 'win32' && browserName === 'webkit';

export const openFixture = async (page: Page): Promise<void> => {
  const errors: string[] = [];
  unexpectedPageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.goto('/');

  if (errors.length > 0) {
    throw new Error(`Browser fixture bootstrap failed:\n${errors.join('\n')}`);
  }

  await page.waitForFunction(() => Object.hasOwn(window, 'frameByFrameFixture'), undefined, {
    timeout: 5_000,
  });
};

export const setupScenario = (page: Page, scenario: BrowserScenario) =>
  page.evaluate((name) => window.frameByFrameFixture.setup(name), scenario);

export const fixtureState = (page: Page) => page.evaluate(() => window.frameByFrameFixture.state());

export const fixtureMetrics = (page: Page) =>
  page.evaluate(() => window.frameByFrameFixture.metrics());

export const expectNoFixtureErrors = async (page: Page): Promise<void> => {
  await expect.poll(async () => (await fixtureMetrics(page)).errors).toEqual([]);
  expect(unexpectedPageErrors.get(page) ?? []).toEqual([]);
};
