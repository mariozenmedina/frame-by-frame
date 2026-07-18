import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

type BrowserScenario = Parameters<Window['frameByFrameFixture']['setup']>[0];
const unexpectedPageErrors = new WeakMap<Page, string[]>();

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
  await page.waitForFunction(() => Object.hasOwn(window, 'frameByFrameFixture'));
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
