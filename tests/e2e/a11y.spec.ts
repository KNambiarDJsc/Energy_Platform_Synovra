import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { USERS, openApp, signInAs } from './helpers';

/** WCAG 2.1 A/AA rules via axe-core. Fails on any violation and prints the offending selectors. */
async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

const APP_ROUTES = [
  '/app/overview', '/app/batteries', '/app/intake', '/app/tests', '/app/restoration', '/app/inventory',
  '/app/deployments', '/app/monitoring', '/app/alerts', '/app/reports', '/app/intelligence',
];

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test('public pages', async ({ page }) => {
    await page.goto('/');
    await audit(page, 'landing');
    await page.goto('/signin');
    await audit(page, 'sign-in');
  });

  for (const route of APP_ROUTES) {
    test(`engineer ${route}`, async ({ page }) => {
      await signInAs(page, USERS.engineer);
      await openApp(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, route);
    });
  }

  test('administrator /app/admin', async ({ page }) => {
    await signInAs(page, USERS.admin);
    await openApp(page, '/app/admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, '/app/admin');
  });

  test('passport tabs', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0002');
    await audit(page, 'passport summary');
    for (const tab of ['Lifecycle timeline', 'Tests', 'Monitoring', 'Costs', 'Evidence', 'Audit history']) {
      const t = page.getByRole('tab', { name: tab, exact: false }).first();
      if ((await t.count()) === 0) continue;
      await t.click();
      await audit(page, `passport ${tab}`);
    }
  });

  test('dialogs and drawers', async ({ page }) => {
    await signInAs(page, USERS.noc);
    await openApp(page, '/app/alerts');
    await page.getByRole('button', { name: /Cell temperature above limit/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'alert drawer');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Assistant' }).click();
    await expect(page.getByLabel('Ask the assistant')).toBeVisible();
    await audit(page, 'assistant');
  });
});
