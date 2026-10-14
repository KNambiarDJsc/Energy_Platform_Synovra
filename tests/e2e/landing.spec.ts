import { expect, test } from '@playwright/test';

test.describe('public landing page', () => {
  test('states the product promise and the demo notice', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Give every battery a verifiable operational history.');
    await expect(page.getByTestId('demo-banner')).toContainText('Synthetic demonstration data. No live customer, cloud or sensor connection.');
    await expect(page.getByRole('link', { name: /View product demo/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore a battery passport' })).toBeVisible();
    await expect(page.getByText('Synovra Battery Intelligence').last()).toBeVisible();
    for (const heading of ['Product', 'Security', 'Documentation and contact']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('makes no unsupported savings, accuracy or certification claims', async ({ page }) => {
    await page.goto('/');
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['save up to', '% savings', 'accuracy of', 'iso 9001', 'certified by', 'guaranteed', 'live data']) {
      expect(text, `landing copy must not contain "${banned}"`).not.toContain(banned);
    }
    await expect(page.getByText('What this demonstration does not have')).toBeVisible();
  });

  test('demo sign-in leads to the overview and the role can be switched', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /View product demo/ }).click();
    await expect(page.getByRole('heading', { name: 'Choose a demo role' })).toBeVisible();
    await page.getByTestId('role-battery_engineer').click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByText('Fleet position in the synthetic snapshot')).toBeVisible();

    await page.getByLabel('Demo role').first().selectOption('customer_auditor');
    await expect(page.getByText('Now acting as Customer / auditor')).toBeVisible();
    // Customers do not get the lab or intelligence areas in navigation.
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Intelligence' })).toHaveCount(0);
  });
});
