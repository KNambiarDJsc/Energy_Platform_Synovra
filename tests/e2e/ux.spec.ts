import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { USERS, expectNoHorizontalScroll, openApp, signInAs } from './helpers';

test.describe('fleet to passport', () => {
  test('find a battery, open its passport from the row, read the evidence, switch sections, go back', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');

    await page.getByRole('search', { name: 'Filter batteries' }).getByLabel('Search batteries').fill('B-0002');
    const rows = page.getByRole('table', { name: 'Batteries' }).getByRole('row');
    await expect(rows).toHaveCount(2); // header + the one match
    // Any part of the row opens the record, not only the label.
    await rows.nth(1).getByText('Qualified store').click();
    await expect(page).toHaveURL(/\/app\/batteries\/[^/?]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0002');

    // The first screen carries identity and the latest test's evidence, each item named.
    const evidence = page.getByRole('region', { name: 'Latest approved test' });
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText('174');
    for (const label of ['Tested', 'Method', 'Conditions', 'Instrument', 'Review', 'Report']) {
      await expect(evidence.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(evidence).toContainText('Calibration');
    await expect(page.getByText('Serial', { exact: true })).toBeVisible();

    // Lens and full-record sections switch in place and stay in the address.
    await page.getByRole('tablist', { name: 'Battery lens' }).getByRole('tab', { name: 'Capacity' }).click();
    await expect(page).toHaveURL(/lens=capacity/);
    await page.getByRole('tab', { name: 'Tests' }).first().click();
    await expect(page).toHaveURL(/tab=tests/);
    await expect(page.getByRole('table', { name: 'Battery-level tests' })).toBeVisible();

    // The breadcrumb returns to the fleet.
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Batteries' }).click();
    await expect(page).toHaveURL(/\/app\/batteries$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Batteries' })).toBeVisible();
  });

  test('a test that has no approved result says so instead of showing a number', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0001');
    const evidence = page.getByRole('region', { name: 'Latest approved test' });
    await expect(evidence).toContainText('No approved test');
    await expect(evidence).toContainText('unknown, not zero');
  });

  test('the next step and its basis are on the table and the passport', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries?q=B-0003');
    await expect(page.getByRole('columnheader', { name: 'Next step' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Batteries' })).toContainText('Move to the recycling queue');
    await expect(page.getByText(/fixed, versioned rules/).first()).toBeVisible();
    await expect(page.getByText(/Neither is a diagnosis, a model output or a health score/)).toBeVisible();
  });
});

test.describe('selecting rows', () => {
  test('tick rows with the keyboard, export only those, clear the choice', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    const one = page.getByRole('checkbox', { name: 'Select B-0003' });
    const two = page.getByRole('checkbox', { name: 'Select B-0005' });
    await one.focus();
    await expect(one).toBeFocused();
    await page.keyboard.press('Space');
    await two.check();
    await expect(page.getByText('2 selected')).toBeVisible();
    // Ticking a box does not open the record.
    await expect(page).toHaveURL(/\/app\/batteries$/);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export selected' }).click();
    const csv = readFileSync(await (await download).path(), 'utf8');
    expect(csv).toContain('B-0003');
    expect(csv).toContain('B-0005');
    expect(csv).not.toContain('B-0004');

    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByText('2 selected')).toHaveCount(0);
    await expect(one).not.toBeChecked();
  });

  test('a choice is dropped when a filter hides the row', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    await page.getByRole('checkbox', { name: 'Select B-0003' }).check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await page.getByRole('search', { name: 'Filter batteries' }).getByLabel('Search batteries').fill('B-0005');
    await expect(page.getByText('1 selected')).toHaveCount(0);
  });

  test('the header box selects the rows on the page', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    await page.getByRole('checkbox', { name: 'Select all rows on this page' }).check();
    await expect(page.getByText('15 selected')).toBeVisible();
    await page.getByRole('button', { name: /Select all 49/ }).click();
    await expect(page.getByText('49 selected')).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the fleet sorts and selects without sideways scrolling', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries');
    await expectNoHorizontalScroll(page);
    await page.getByLabel('Sort by').selectOption('label:desc');
    await expect(page.getByRole('list', { name: 'Batteries' }).getByRole('listitem').first()).toContainText('B-0049');
    await page.getByRole('checkbox', { name: 'Select B-0049' }).check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the passport shows the latest evidence before the illustration', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0002');
    const evidence = await page.getByRole('region', { name: 'Latest approved test' }).boundingBox();
    const illustration = await page.getByText(/^Illustration of a/).boundingBox();
    expect(evidence && illustration).toBeTruthy();
    expect(evidence!.y).toBeLessThan(illustration!.y);
    await expectNoHorizontalScroll(page);
  });

  test('a section row that scrolls sideways fades at the edge that has more', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    const row = page.getByRole('tablist', { name: 'Battery lens' }).locator('xpath=..');
    await expect.poll(async () => row.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage)).toContain('gradient');
  });
});
