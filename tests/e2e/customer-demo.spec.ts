import { expect, test } from '@playwright/test';
import { USERS, expectNoHorizontalScroll, openApp, signInAs } from './helpers';

test.describe('customer demo: the journey', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, USERS.customer);
  });

  test('a customer finds the demo in the navigation, picks a site, and sees the fleet with its coverage and a synthetic label', async ({ page }) => {
    await openApp(page, '/app/home');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Customer demo' }).click();
    await expect(page).toHaveURL(/\/app\/customer/);
    await expect(page.getByRole('heading', { level: 1, name: 'Your batteries' })).toBeVisible();
    await expect(page.getByTestId('customer-demo-label')).toContainText('Nothing here is monitored continuously');
    await expect(page.getByText('Demo Customer A').first()).toBeVisible();
    await expect(page.getByText('Demo Customer B')).toHaveCount(0);
    // coverage says what is on record, and is honest about the sensors
    const coverage = page.locator('#coverage');
    await expect(coverage).toContainText('Approved capacity test on record');
    await expect(coverage).toContainText('Sensor attributed (simulated here)');
    await expect(coverage).toContainText('sample records, not continuous monitoring');
    // narrowing to one site changes the list
    const all = await page.getByRole('table').first().locator('tbody tr').count();
    await page.getByLabel('Site', { exact: true }).selectOption({ label: 'Demo Site B, Indoor Battery Room' });
    await expect(page).toHaveURL(/site=s2/);
    await expect.poll(() => page.getByRole('table').first().locator('tbody tr').count()).toBeLessThan(all);
  });

  test('status filters narrow the list and the search finds a battery', async ({ page }) => {
    await openApp(page, '/app/customer');
    const rows = page.getByRole('table').first().locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const all = await rows.count();
    const group = page.getByRole('group', { name: 'Show batteries by condition' });
    await group.getByRole('button', { name: /Needs attention/ }).click();
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(all);
    for (const t of await rows.allInnerTexts()) expect(t).toContain('Needs attention');
    await group.getByRole('button', { name: /^All/ }).click();
    await page.getByLabel('Find a battery').fill('B-0007');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('B-0007');
  });

  test('a battery record shows where it sits, why it has its status, and the basis of every indicator', async ({ page }) => {
    await openApp(page, '/app/customer');
    await page.getByRole('table').first().getByRole('link', { name: /B-0007/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('B-0007');
    // hierarchy: customer, site, system, bank / string, battery
    const trail = page.getByTestId('hierarchy');
    for (const level of ['Customer', 'Site', 'System', 'Bank / string', 'Battery']) await expect(trail).toContainText(level);
    await expect(trail).toContainText('V DC power system');
    await expect(trail).toContainText('Demo Customer A');
    // the status, the reason, the next step and when
    await expect(page.getByTestId('status-headline')).not.toBeEmpty();
    await expect(page.getByTestId('next-step')).not.toBeEmpty();
    await expect(page.getByText(/Record last updated/)).toBeVisible();
    await expect(page.locator('#why')).toContainText('battery-status 0.1.0');
    // every indicator: basis, scope, a timestamp or the absence of one, a source and freshness
    const items = page.locator('[data-indicator]');
    expect(await items.count()).toBeGreaterThan(4);
    for (const el of await items.all()) {
      const text = await el.innerText();
      expect(text, 'a basis').toMatch(/Measured|Calculated|Estimated|Modelled|Predicted|Demo only/i);
      expect(text, 'a scope').toMatch(/This battery|Whole string|Whole bank|Whole site/i);
      expect(text, 'a source').toContain('Source:');
      expect(text, 'freshness').toMatch(/Current|Older than the freshness limit|No reading/i);
    }
    // never a health score, a remaining life or a failure date
    const life = page.locator('[data-indicator="remaining_life"]');
    await expect(life).toContainText('Data unavailable');
    await expect(life).toContainText('No validated prediction model');
    const body = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['health score:', 'years remaining', 'will fail', 'failure date:']) expect(body).not.toContain(banned);
    // simulated readings are not passed off as live
    if ((await page.locator('[data-indicator="voltage"]').count()) > 0) await expect(page.locator('[data-indicator="voltage"]')).toContainText('Demo only');
    // history and customer-visible evidence
    await expect(page.getByTestId('timeline-item').first()).toBeVisible();
    await expect(page.locator('#evidence')).toContainText('SHA-256');
  });

  test('customer-safe: no costs, process detail, internal notes or model estimates on the record', async ({ page }) => {
    await openApp(page, '/app/customer');
    await page.getByRole('table').first().getByRole('link', { name: /B-0004/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('B-0004');
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['margin', 'lot ref', 'recipe', 'internal note', 'cost allocation', 'aed ']) expect(text, banned).not.toContain(banned);
    await expect(page.getByRole('tab')).toHaveCount(0);
  });

  test('a maintenance request is clickable, confirmed, and plainly labelled as a demonstration', async ({ page }) => {
    await openApp(page, '/app/customer');
    await page.getByRole('table').first().getByRole('link', { name: /B-0005/ }).first().click();
    await page.getByRole('button', { name: 'Request maintenance' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Demonstration only: nothing is sent to a service team');
    await dialog.getByLabel('Note').fill('Please check terminals');
    await dialog.getByRole('button', { name: 'Submit request (demo)' }).click();
    const confirmation = page.getByTestId('request-confirmation');
    await expect(confirmation).toContainText('DEMO-001');
    await expect(confirmation).toContainText('saved in this browser only');
    await expect(confirmation).toContainText('No service request was created');
    await dialog.getByRole('button', { name: 'Done' }).click();
    // it appears in the list, marked as demo
    await page.goto('/app/customer');
    const req = page.getByTestId('demo-request').first();
    await expect(req).toContainText('B-0005');
    await expect(req).toContainText('Recorded in this browser only (demo)');
    // and replacement planning works the same way
    await page.getByRole('table').first().getByRole('link', { name: /B-0005/ }).first().click();
    await page.getByRole('button', { name: 'Plan replacement' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save plan (demo)' }).click();
    await expect(page.getByTestId('request-confirmation')).toContainText('DEMO-002');
  });

  test('the report preview has every section, separates what is measured from what is missing, and exports', async ({ page }) => {
    await openApp(page, '/app/customer/report');
    await expect(page.getByRole('heading', { level: 1, name: 'Operational and ESG data report' })).toBeVisible();
    const preview = page.getByTestId('report-preview');
    await expect(preview).toContainText('Not a compliance certificate');
    for (const id of ['scope', 'inventory', 'operations', 'lifecycle', 'energy', 'social', 'governance']) await expect(preview.locator(`[data-report-section="${id}"]`)).toBeVisible();
    // nothing is claimed about emissions: the section says what it lacks
    const energy = preview.locator('[data-report-section="energy"]');
    await expect(energy).toHaveAttribute('data-status', 'not_recorded');
    await expect(energy).toContainText('Not calculated');
    await expect(energy.getByTestId('missing-inputs')).toContainText('Emission factors with source and version');
    const text = (await preview.innerText()).toLowerCase();
    for (const banned of ['carbon saved', 'emissions avoided', 'esg compliant', 'certified by', 'tco2', 'kgco2']) expect(text, banned).not.toContain(banned);
    await expect(page.getByTestId('limitations')).toContainText('synthetic');
    // framework pointers are optional configuration, not a scope assignment
    await expect(preview.getByTestId('framework-area')).toHaveCount(0);
    await page.getByLabel('Framework pointers').selectOption('gri');
    await expect(preview.getByTestId('framework-area').first()).toContainText('confirm');
    expect((await preview.innerText())).not.toMatch(/Scope [123]\b/);
    // exports
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const d = await csv;
    expect(d.suggestedFilename()).toMatch(/^synovra-demo-report-t_custA-all-sites\.csv$/);
    const json = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    expect((await json).suggestedFilename()).toMatch(/\.json$/);
    // a bad period is caught, not exported
    await page.getByLabel('Period from').fill('2027-01-01');
    await expect(page.getByText('The end date is before the start date.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  });

  test('the value summary is counts, and savings appear only as a labelled scenario with its assumptions', async ({ page }) => {
    await openApp(page, '/app/customer/report');
    const value = page.locator('#value');
    for (const label of ['Fleet visibility', 'Traceable history', 'Planned maintenance', 'Replacement planning', 'Evidence for paperwork']) await expect(value).toContainText(label);
    const scenario = page.getByTestId('scenario');
    await expect(scenario).toContainText('a what-if, not a result');
    await expect(scenario).toContainText('illustrative defaults');
    await expect(page.getByTestId('scenario-result')).toContainText('AED 1,200');
    await scenario.getByLabel('Assumed share deferred (%)').fill('50');
    await expect(page.getByTestId('scenario-result')).toContainText('AED 2,400');
  });

  test('works on a phone: nothing scrolls sideways on the fleet, a record and the report', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, '/app/customer');
    await expect(page.getByRole('heading', { level: 1, name: 'Your batteries' })).toBeVisible();
    await expect(page.locator('#coverage')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto('/app/customer/report');
    await expect(page.getByTestId('report-preview')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('is reachable and operable by keyboard', async ({ page }) => {
    await openApp(page, '/app/customer');
    const group = page.getByRole('group', { name: 'Show batteries by condition' });
    const attention = group.getByRole('button', { name: /Needs attention/ });
    await attention.focus();
    await page.keyboard.press('Enter');
    await expect(attention).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  });
});

test.describe('customer demo: who sees what', () => {
  test('staff can choose between customers; a customer cannot reach another customer’s sites', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/customer');
    const customer = page.getByLabel('Customer', { exact: true });
    await expect(customer).toBeVisible();
    await expect(customer.locator('option')).toHaveText(['Demo Customer A', 'Demo Customer B']);
    await customer.selectOption('t_custB');
    await expect(page).toHaveURL(/customer=t_custB/);
    await expect(page.locator('#structure')).toContainText('Demo Site C, Ground Tower');
  });

  test('a customer asking for another customer’s site in the address still sees only their own', async ({ page }) => {
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/customer?customer=t_custB&site=s3');
    await expect(page.getByText('Demo Customer A').first()).toBeVisible();
    await expect(page.locator('#structure')).not.toContainText('Demo Site C');
    await expect(page.getByText('Demo Customer B')).toHaveCount(0);
  });

  test('an engineer sees the customer view without internal detail, while the internal screens are untouched', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/customer');
    await page.getByRole('table').first().getByRole('link', { name: /B-0004/ }).first().click();
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['margin', 'lot ref', 'recipe', 'internal note']) expect(text, banned).not.toContain(banned);
    // internal operations screens still work as before
    await openApp(page, '/app/batteries');
    await expect(page.getByRole('heading', { level: 1, name: 'Batteries' })).toBeVisible();
    await openApp(page, '/app/restoration');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
