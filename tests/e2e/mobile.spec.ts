import { expect, test } from '@playwright/test';
import { USERS, expectNoHorizontalScroll, openApp, signInAs } from './helpers';

const ROUTES = [
  '/app/overview', '/app/batteries', '/app/intake', '/app/tests', '/app/restoration', '/app/inventory',
  '/app/deployments', '/app/monitoring', '/app/alerts', '/app/reports', '/app/intelligence', '/app/admin',
];

test.describe('390px layout', () => {
  test('landing page does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('app routes stay within the viewport', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    for (const route of ROUTES) {
      await openApp(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });

  test('tables become cards and the bottom navigation is available', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toBeVisible();
    await expect(page.locator('table:visible')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Batteries' })).toBeVisible();
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Monitoring' })).toBeVisible();
  });

  test('battery passport is readable and its tabs are reachable', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0002');
    await expectNoHorizontalScroll(page);
    await page.getByRole('tab', { name: 'Audit history' }).click();
    await expect(page.getByRole('tab', { name: 'Audit history' })).toHaveAttribute('aria-selected', 'true');
    await expectNoHorizontalScroll(page);
  });

  test('a form can be completed with a phone-sized viewport', async ({ page }) => {
    await signInAs(page, USERS.lab);
    await openApp(page, '/app/intake');
    await page.getByLabel('Battery family').selectOption({ index: 1 });
    await page.getByLabel('Manufacturer serial').fill('MOBILE-TEST-001');
    await page.getByRole('button', { name: 'Register battery' }).click();
    await expect(page.locator('#main').getByRole('status').filter({ hasText: /B-\d{4} registered/ })).toBeVisible();
  });
});
