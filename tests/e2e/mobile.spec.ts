import { expect, test } from '@playwright/test';
import { USERS, expectNoHorizontalScroll, openApp, signInAs } from './helpers';

const ROUTES = ['/app/home', '/app/batteries', '/app/actions', '/app/reports'];

test.describe('390px layout', () => {
  test('landing page does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('every customer screen stays within the viewport', async ({ page }) => {
    await signInAs(page, USERS.customer);
    for (const route of ROUTES) {
      await openApp(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });

  test('tables become cards and the bottom navigation is available', async ({ page }) => {
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/batteries');
    const bottom = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(bottom).toBeVisible();
    for (const name of ['Home', 'Batteries', 'Actions', 'Reports']) await expect(bottom.getByRole('link', { name })).toBeVisible();
    await expect(page.locator('table:visible')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Batteries at your sites' })).toBeVisible();
  });

  test('a battery record is readable and its lenses are reachable on a phone', async ({ page }) => {
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/batteries');
    await page.getByRole('list', { name: 'Batteries at your sites' }).getByRole('link', { name: /B-0007/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('B-0007');
    await expectNoHorizontalScroll(page);
    await page.getByRole('group', { name: 'What to look at' }).getByRole('button', { name: 'Outlook' }).click();
    await expect(page.getByTestId('outlook')).toContainText('Not yet estimated');
    await expectNoHorizontalScroll(page);
    await page.getByTestId('technical').locator('summary').click();
    await expectNoHorizontalScroll(page);
  });

  test('a maintenance request can be made with a phone-sized viewport', async ({ page }) => {
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/batteries');
    await page.getByRole('list', { name: 'Batteries at your sites' }).getByRole('link', { name: /B-0007/ }).first().click();
    await page.getByRole('button', { name: 'Request maintenance' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit request (demo)' }).click();
    await expect(page.getByTestId('request-confirmation')).toContainText('DEMO-001');
  });
});
