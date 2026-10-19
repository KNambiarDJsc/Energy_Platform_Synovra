import { expect, test } from '@playwright/test';
import { USERS, expectNoHorizontalScroll, openApp, signInAs } from './helpers';

test.describe('home', () => {
  test('a customer signs in to a calm home: one picture, one sentence, then what needs attention', async ({ page }) => {
    await page.goto('/signin');
    await page.getByTestId('role-customer_auditor').click();
    await expect(page).toHaveURL(/\/app\/home$/);
    const ring = page.getByRole('img', { name: /^\d+ batteries: \d+ good, \d+ watching, \d+ needs attention, \d+ baseline being established\.$/ });
    await expect(ring).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/batteries|attention|range/);
    // Honest about what the status is.
    await expect(page.getByText(/not a model, and no health score is shown/)).toBeVisible();
    // Straight to the problem.
    const attention = page.getByRole('region', { name: 'Needs attention' });
    const first = attention.getByRole('link').first();
    const label = (await first.locator('.mono').innerText()).trim();
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(label);
  });

  test('staff keep the operational overview as their landing, and find home first in the navigation', async ({ page }) => {
    await page.goto('/signin');
    await page.getByTestId('role-battery_engineer').click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link').first()).toHaveText('Home');
  });

  test('a status count opens the battery list filtered to that status', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/home');
    await page.getByRole('list', { name: 'Batteries by status' }).getByRole('link', { name: /Watching/ }).click();
    await expect(page).toHaveURL(/status=watching/);
    await expect(page.getByRole('button', { name: /^Watching/ })).toHaveAttribute('aria-pressed', 'true');
    const rows = page.getByRole('table', { name: 'Batteries' }).getByRole('row');
    const n = await rows.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 1; i < n; i++) await expect(rows.nth(i)).toContainText('Watching');
  });

  test('home on a phone fits the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/home');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('portfolio', () => {
  test('the default view is minimal; the detailed view adds the technical columns, and the choice stays in the address', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    const headers = page.getByRole('table', { name: 'Batteries' }).getByRole('columnheader');
    await expect(headers.filter({ hasText: 'Status' })).toHaveCount(1);
    await expect(headers.filter({ hasText: 'Data quality' })).toHaveCount(0);
    await page.getByRole('group', { name: 'Table view' }).getByRole('button', { name: 'Detailed' }).click();
    await expect(page).toHaveURL(/view=detailed/);
    await expect(headers.filter({ hasText: 'Data quality' })).toHaveCount(1);
    await expect(headers.filter({ hasText: 'State and evidence' })).toHaveCount(1);
  });

  test('status filters show their counts and narrow the list', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    const group = page.getByRole('group', { name: 'Show batteries by status' });
    const counts: Record<string, number> = {};
    for (const name of ['Good', 'Watching', 'Needs attention', 'Baseline being established', 'Out of service']) {
      counts[name] = Number((await group.getByRole('button', { name: new RegExp(`^${name}`) }).innerText()).replace(/\D+/g, ''));
    }
    const all = Number((await group.getByRole('button', { name: /^All/ }).innerText()).replace(/\D+/g, ''));
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(all);
    await group.getByRole('button', { name: /^Baseline being established/ }).click();
    await expect(page.getByText(`${counts['Baseline being established']} batteries`)).toBeVisible();
  });

  test('a battery being watched for stale readings is told to check the gateway, not that nothing needs doing', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries?status=watching');
    const table = page.getByRole('table', { name: 'Batteries' });
    await expect(table).toContainText('Check the site gateway');
    await expect(table).not.toContainText('Nothing needs doing');
  });
});

test.describe('the battery, at a glance and in depth', () => {
  test('status, the reasons behind it, and what is not known yet', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0012');
    const why = page.getByRole('list', { name: 'What decided the status' });
    await expect(why).toBeVisible();
    await expect(why).toContainText('Connection');
    await expect(why).toContainText('Last reading');
    await expect(why).toContainText('Plate condition');
    await expect(why).toContainText('Not modelled');
    await expect(why).toContainText('Not estimated');
    for (const kind of ['MEASURED', 'MODELLED', 'PREDICTED']) await expect(why).toContainText(new RegExp(kind, 'i'));
    await expect(page.getByText('A status, not a health score.')).toBeVisible();
    // The suggestion beside it says the same thing as the status.
    await expect(page.getByText('Readings are not current. Check the site gateway.').first()).toBeVisible();
  });

  test('what the last intervention changed, measured before and after, without claiming cause', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    const change = page.locator('section[aria-labelledby="change-h"]');
    await change.scrollIntoViewIfNeeded();
    await expect(change.getByRole('heading', { name: 'What the last intervention changed' })).toBeVisible();
    await expect(change).toContainText('60');
    await expect(change).toContainText('87');
    await expect(change).toContainText('+27 points, better');
    await expect(change).toContainText('not that the process caused it');
    await expect(change).toContainText('Qualified by an engineer');
    // The customer-facing words the brief avoids
    const text = (await change.innerText()).toLowerCase();
    for (const word of ['restored', 'refurbished', 'revived']) expect(text).not.toContain(word);
  });
});
