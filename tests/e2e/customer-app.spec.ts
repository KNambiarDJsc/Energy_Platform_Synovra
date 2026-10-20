import { expect, test, type Page } from '@playwright/test';
import { USERS, expectNoHorizontalScroll, openApp, signInAs } from './helpers';

const openBattery = async (page: Page, label: string) => {
  await openApp(page, '/app/batteries');
  await page.getByRole('table').first().getByRole('link', { name: new RegExp(label) }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
};

test.describe('the product is the customer’s alone', () => {
  test('sign-in offers one demo customer and goes to a calm home, with only the customer’s four places', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'Sign in to your batteries' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Demo account' }).getByRole('button')).toHaveCount(1);
    for (const gone of ['Lab operator', 'Battery engineer', 'Finance', 'Platform administrator', 'Field technician']) await expect(page.getByText(gone)).toHaveCount(0);
    await page.getByTestId('role-customer_auditor').click();
    await expect(page).toHaveURL(/\/app\/home$/);
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Batteries', 'Actions', 'Reports']);
  });

  test('every internal screen is gone, not hidden', async ({ page }) => {
    await signInAs(page, USERS.customer);
    for (const gone of ['/app/overview', '/app/intake', '/app/tests', '/app/restoration', '/app/inventory', '/app/deployments', '/app/monitoring', '/app/alerts', '/app/intelligence', '/app/admin', '/app/scan']) {
      const res = await page.goto(gone);
      expect(res?.status(), gone).toBe(404);
    }
  });

  test('a link to a removed screen lands on home after sign-in', async ({ page }) => {
    await page.goto('/signin?next=%2Fapp%2Fintake');
    await page.getByTestId('role-customer_auditor').click();
    await expect(page).toHaveURL(/\/app\/home$/);
  });
});

test.describe('home: how is everything doing, what changed, what needs attention, what happens next', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, USERS.customer); });

  test('one ring, one sentence, the batteries that need a person, and where they are', async ({ page }) => {
    await openApp(page, '/app/home');
    await expect(page.getByTestId('customer-demo-label')).toContainText('Nothing here is monitored continuously');
    await expect(page.getByRole('img', { name: /^\d+ batteries: \d+ good, \d+ watching, \d+ needs attention, \d+ baseline being established\.$/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/batteries|attention|range/);
    await expect(page.getByText(/not a model, and no health score is shown/)).toBeVisible();
    await expect(page.getByTestId('home-coverage')).toContainText('approved capacity test');
    const first = page.getByRole('region', { name: 'Needs attention' }).getByRole('link').first();
    const label = (await first.locator('.mono').innerText()).trim();
    await first.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
  });

  test('the action centre shows now, scheduled and completed, and opens', async ({ page }) => {
    await openApp(page, '/app/home');
    const glance = page.getByRole('region', { name: 'Actions' });
    for (const w of ['Now', 'Scheduled', 'Completed']) await expect(glance).toContainText(w);
    await glance.getByRole('link', { name: 'Open actions' }).click();
    await expect(page).toHaveURL(/\/app\/actions$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Actions' })).toBeVisible();
  });

  test('Ask answers from the records, names what it used, and refuses what it cannot know', async ({ page }) => {
    await openApp(page, '/app/home');
    await page.getByRole('button', { name: 'Ask which need attention' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ask' });
    const turn = dialog.getByTestId('ask-turn').first();
    await expect(turn).toContainText('Which batteries need attention?');
    await expect(turn).toContainText(/Next:|Nothing needs attention/);
    await dialog.getByLabel('Your question').fill('Turn down the charger');
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(dialog.getByTestId('ask-turn').nth(1)).toContainText('Nothing here controls equipment');
    await dialog.getByLabel('Your question').fill('When will they need replacing?');
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(dialog.getByTestId('ask-turn').nth(2)).toContainText('no forecast model is validated');
  });
});

test.describe('batteries: a minimal portfolio', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, USERS.customer); });

  test('a clean list with the first filters a person reaches for', async ({ page }) => {
    await openApp(page, '/app/batteries');
    await expect(page.getByRole('heading', { level: 1, name: 'Your batteries' })).toBeVisible();
    await expect(page.getByText('Demo Customer A').first()).toBeVisible();
    await expect(page.getByText('Demo Customer B')).toHaveCount(0);
    const rows = page.getByRole('table').first().locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const all = await rows.count();
    const group = page.getByRole('group', { name: 'Show batteries by condition' });
    for (const name of ['All', 'Good', 'Watching', 'Needs attention', 'Baseline']) await expect(group.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    await group.getByRole('button', { name: /Needs attention/ }).click();
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(all);
    for (const t of await rows.allInnerTexts()) expect(t).toContain('Needs attention');
    await group.getByRole('button', { name: /^All/ }).click();
    await page.getByLabel('Site', { exact: true }).selectOption({ label: 'Demo Site B, Indoor Battery Room' });
    await expect(page).toHaveURL(/site=s2/);
    await expect.poll(() => rows.count()).toBeLessThan(all);
    await page.locator('#main').getByLabel('Find a battery', { exact: true }).fill('B-0012');
    await expect(rows).toHaveCount(1);
  });

  test('a status from home opens the list already filtered, and the search box in the bar finds a battery', async ({ page }) => {
    await openApp(page, '/app/batteries?status=attention');
    await expect(page.getByRole('group', { name: 'Show batteries by condition' }).getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('search').getByRole('searchbox').fill('B-0007');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/q=B-0007/);
    await expect(page.locator('#main').getByLabel('Find a battery', { exact: true })).toHaveValue('B-0007');
  });
});

test.describe('one battery: the experience becomes immersive', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, USERS.customer); });

  test('the cutaway is already there, named as a model, with the glance, the reasons and the hierarchy', async ({ page }) => {
    await openBattery(page, 'B-0007');
    await expect(page.getByRole('img', { name: /Illustration of a .* battery, standing in for B-0007\. Not a photograph or scan/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /view inside/i })).toHaveCount(0);
    await expect(page.getByTestId('figure-caption')).toContainText('not a photograph or scan');
    for (const id of ['glance-condition', 'glance-temperature', 'glance-capacity', 'glance-outlook']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('glance-outlook')).toContainText('Not yet estimated');
    await expect(page.getByTestId('glance-outlook')).toContainText('Confidence: none');
    const trail = page.getByTestId('hierarchy');
    for (const level of ['Customer', 'Site', 'System', 'Bank / string', 'Battery']) await expect(trail).toContainText(level);
    await expect(trail).toContainText('Demo Customer A');
    await expect(page.locator('#why')).toContainText('battery-status 0.1.0');
  });

  test('each lens says what is measured, what is simulated and what is not known', async ({ page }) => {
    await openBattery(page, 'B-0007');
    const lenses = page.getByRole('group', { name: 'What to look at' });
    const panel = page.getByTestId('lens-panel');
    await lenses.getByRole('button', { name: 'Temperature' }).click();
    await expect(panel).toContainText(/Simulated reading|Data unavailable/);
    await expect(panel).toContainText('Room temperature is not captured by the sensor');
    await lenses.getByRole('button', { name: 'Capacity' }).click();
    await expect(panel).toContainText('Not temperature-corrected');
    await expect(panel).toContainText('not a health score');
    await lenses.getByRole('button', { name: 'Voltage' }).click();
    await expect(panel).toContainText('Open-circuit voltage');
    await lenses.getByRole('button', { name: 'Outlook' }).click();
    await expect(panel).toContainText('Not yet estimated');
    await expect(panel).toContainText('Confidence: none');
    await expect(panel).toContainText('No forecast model has been validated');
  });

  test('what changed puts two approved tests side by side, each against its room', async ({ page }) => {
    await openBattery(page, 'B-0007');
    const change = page.getByTestId('change');
    await expect(change).toBeVisible();
    for (const row of ['Capacity', 'Internal resistance', 'Battery temperature', 'Room temperature', 'Battery above room']) await expect(change).toContainText(row);
    await expect(change).toContainText('not proof of its cause');
    const text = (await change.innerText()).toLowerCase();
    for (const banned of ['restored', 'revived', 'refurbished']) expect(text, banned).not.toContain(banned);
  });

  test('three levels: the technical detail is one click down, and every indicator carries its basis', async ({ page }) => {
    await openBattery(page, 'B-0007');
    await expect(page.locator('[data-indicator]').first()).toBeHidden();
    await page.getByTestId('technical').locator('summary').click();
    const items = page.locator('[data-indicator]');
    expect(await items.count()).toBeGreaterThan(4);
    for (const el of await items.all()) {
      const text = await el.innerText();
      expect(text, 'a basis').toMatch(/Measured|Calculated|Estimated|Modelled|Predicted|Demo only/i);
      expect(text, 'a scope').toMatch(/This battery|Whole string|Whole bank|Whole site/i);
      expect(text, 'a source').toContain('Source:');
      expect(text, 'freshness').toMatch(/Current|Older than the freshness limit|No reading/i);
    }
    const life = page.locator('[data-indicator="remaining_life"]');
    await expect(life).toContainText('Data unavailable');
    const body = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['health score:', 'years remaining', 'will fail', 'failure date:']) expect(body).not.toContain(banned);
    if ((await page.locator('[data-indicator="voltage"]').count()) > 0) await expect(page.locator('[data-indicator="voltage"]')).toContainText('Demo only');
  });

  test('the history, the evidence and since-your-last-visit', async ({ page }) => {
    await openBattery(page, 'B-0007');
    await expect(page.getByTestId('timeline-item').first()).toBeVisible();
    await expect(page.locator('#evidence')).toContainText('SHA-256');
    await expect(page.getByTestId('battery-since')).toHaveCount(0); // a first visit shows nothing
    await page.reload();
    await expect(page.getByTestId('battery-since')).toContainText('No change.');
  });

  test('customer-safe: no costs, process detail, internal notes or model estimates on the record', async ({ page }) => {
    await openBattery(page, 'B-0004');
    await page.getByTestId('technical').locator('summary').click();
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['margin', 'lot ref', 'recipe', 'internal note', 'cost allocation', 'aed ']) expect(text, banned).not.toContain(banned);
    await expect(page.getByRole('tab')).toHaveCount(0);
  });

  test('Ask knows which battery is open', async ({ page }) => {
    await openBattery(page, 'B-0007');
    await page.locator('header').getByRole('button', { name: 'Ask', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ask' });
    await expect(dialog).toContainText('About B-0007');
    await dialog.getByRole('button', { name: 'Is it too warm?' }).click();
    await expect(dialog.getByTestId('ask-turn').first()).toContainText(/°C|No temperature reading/);
    await dialog.getByLabel('Your question').fill('Why does this battery have this status?');
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(dialog.getByTestId('ask-turn').nth(1)).toContainText('B-0007 is “');
  });
});

test.describe('actions and requests', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, USERS.customer); });

  test('a maintenance request is clickable, confirmed, labelled as a demonstration, and listed as scheduled', async ({ page }) => {
    test.slow();
    await openBattery(page, 'B-0005');
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
    await openApp(page, '/app/actions');
    const req = page.getByTestId('demo-request').first();
    await expect(req).toContainText('B-0005');
    await expect(req).toContainText('Recorded in this browser only (demo)');
    await expect(page.getByTestId('action-counts')).toContainText('1 scheduled (demo)');
  });

  test('now lists each battery that needs attention with its next step, and a request can start there', async ({ page }) => {
    await openApp(page, '/app/actions');
    const now = page.getByTestId('action-now');
    expect(await now.count()).toBeGreaterThan(0);
    await expect(now.first()).toContainText('Needs attention');
    await now.first().getByRole('button', { name: 'Plan replacement' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save plan (demo)' }).click();
    await expect(page.getByTestId('request-confirmation')).toContainText('DEMO-001');
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('demo-request')).toHaveCount(1);
  });

  test('completed shows only service work an engineer approved, with the method kept confidential', async ({ page }) => {
    await openApp(page, '/app/actions');
    const done = page.getByTestId('action-completed');
    if ((await done.count()) > 0) await expect(done.first()).toContainText('Service work completed');
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['recipe', 'lot ref', 'solvent', 'additive']) expect(text, banned).not.toContain(banned);
  });
});

test.describe('reports', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, USERS.customer); });

  test('the report has every section, separates measured from missing, and exports', async ({ page }) => {
    await openApp(page, '/app/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Operational and ESG data report' })).toBeVisible();
    const preview = page.getByTestId('report-preview');
    await expect(preview).toContainText('Not a compliance certificate');
    for (const id of ['scope', 'inventory', 'operations', 'lifecycle', 'energy', 'social', 'governance']) await expect(preview.locator(`[data-report-section="${id}"]`)).toBeVisible();
    const energy = preview.locator('[data-report-section="energy"]');
    await expect(energy).toHaveAttribute('data-status', 'not_recorded');
    await expect(energy).toContainText('Not calculated');
    await expect(energy.getByTestId('missing-inputs')).toContainText('Emission factors with source and version');
    const text = (await preview.innerText()).toLowerCase();
    for (const banned of ['carbon saved', 'emissions avoided', 'esg compliant', 'certified by', 'tco2', 'kgco2']) expect(text, banned).not.toContain(banned);
    await expect(page.getByTestId('limitations')).toContainText('synthetic');
    await expect(preview.getByTestId('framework-area')).toHaveCount(0);
    await page.getByLabel('Framework pointers').selectOption('gri');
    await expect(preview.getByTestId('framework-area').first()).toContainText('confirm');
    expect(await preview.innerText()).not.toMatch(/Scope [123]\b/);
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await csv).suggestedFilename()).toMatch(/^synovra-demo-report-t_custA-all-sites\.csv$/);
    const json = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    expect((await json).suggestedFilename()).toMatch(/\.json$/);
    await page.getByLabel('Period from').fill('2027-01-01');
    await expect(page.getByText('The end date is before the start date.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  });

  test('the value summary is counts, and savings appear only as a labelled scenario with its assumptions', async ({ page }) => {
    await openApp(page, '/app/reports');
    for (const label of ['Fleet visibility', 'Traceable history', 'Planned maintenance', 'Replacement planning', 'Evidence for paperwork']) await expect(page.locator('#value')).toContainText(label);
    const scenario = page.getByTestId('scenario');
    await expect(scenario).toContainText('a what-if, not a result');
    await expect(page.getByTestId('scenario-result')).toContainText('AED 1,200');
    await scenario.getByLabel('Assumed share deferred (%)').fill('50');
    await expect(page.getByTestId('scenario-result')).toContainText('AED 2,400');
  });

  test('a customer asking for another customer’s site in the address still sees only their own', async ({ page }) => {
    await openApp(page, '/app/batteries?customer=t_custB&site=s3');
    await expect(page.getByText('Demo Customer A').first()).toBeVisible();
    await expect(page.getByText('Demo Site C, Ground Tower')).toHaveCount(0);
    await expect(page.getByText('Demo Customer B')).toHaveCount(0);
  });

  test('nothing scrolls sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/app/home', '/app/batteries', '/app/actions', '/app/reports']) {
      await openApp(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});
