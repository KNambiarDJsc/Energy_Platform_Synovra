import { expect, test } from '@playwright/test';
import { USERS, openApp, signInAs } from './helpers';

test.describe('intake', () => {
  test('creates a battery and requires acknowledgement for a duplicate serial', async ({ page }) => {
    await signInAs(page, USERS.lab);
    await openApp(page, '/app/intake');

    await page.getByLabel('Battery family').selectOption({ index: 1 });
    await page.getByLabel('Manufacturer serial').fill('AV200-25-621708'); // already on B-0002
    await page.getByRole('button', { name: 'Register battery' }).click();

    const duplicate = page.getByRole('alert').filter({ hasText: 'Possible duplicate' });
    await expect(duplicate).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register battery' })).toBeDisabled();

    await duplicate.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Register battery' }).click();
    await expect(page.locator('#main').getByRole('status').filter({ hasText: /B-\d{4} registered/ })).toBeVisible();
    await expect(page.getByText('flagged for identity review')).toBeVisible();
  });

  test('imports a CSV through preview and commit, and re-import creates nothing new', async ({ page }) => {
    await signInAs(page, USERS.lab);
    await openApp(page, '/app/intake');
    await page.getByRole('tab', { name: 'Import spreadsheet (CSV)' }).click();

    await page.getByRole('button', { name: 'Use the sample spreadsheet' }).click();
    await expect(page.getByRole('heading', { name: /2\. Review/ })).toBeVisible();
    await expect(page.getByText('Quarantined').first()).toBeVisible();
    const commit = page.getByRole('button', { name: /Commit \d+ row/ });
    await expect(commit).toBeEnabled();
    await commit.click();
    await expect(page.getByText(/Import committed:/)).toBeVisible();

    await page.getByRole('button', { name: 'Use the sample spreadsheet' }).click();
    await expect(page.getByText('This exact file was committed before')).toBeVisible();
    await expect(page.getByRole('button', { name: /Commit 0 row/ })).toBeDisabled();
  });
});

test.describe('review and permissions', () => {
  test('an engineer starts a review and approves a submitted test with a reason', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/tests?status=submitted');
    await page.getByRole('button', { name: 'Open' }).first().click();
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText('Review started')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).first().click();

    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(dialog.getByText('Enter a reason of at least 5 characters.')).toBeVisible();
    await dialog.getByLabel(/Reason/).fill('Instrument and calibration references checked.');
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Test approved.')).toBeVisible();
  });

  test('an engineer sends a test back only with a reason code, and the record shows it', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/tests?status=submitted');
    await page.getByRole('button', { name: 'Open' }).first().click();
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText('Review started')).toBeVisible();
    await page.getByRole('button', { name: 'Request rework' }).first().click();

    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Cut-off voltage does not match the protocol.');
    await dialog.getByRole('button', { name: 'Request rework' }).click();
    await expect(dialog.getByText('Choose a reason code.')).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Reason code' }).selectOption({ label: 'Conditions outside the protocol' });
    await dialog.getByRole('button', { name: 'Request rework' }).click();
    await expect(page.getByText('Rework requested.')).toBeVisible();
    await expect(page.getByText('Conditions outside the protocol', { exact: true })).toBeVisible();
  });

  test('an engineer sends a restoration attempt to rework with a reason code, and the batch counts it', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/restoration');
    await page.getByRole('button', { name: /RB-2026-09/ }).click();
    await page.getByRole('button', { name: 'Request rework' }).first().click();

    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Terminal post cracked in handling; replace and re-test.');
    await dialog.getByRole('button', { name: 'Request rework' }).click();
    await expect(dialog.getByText('Choose a reason code.')).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Reason code' }).selectOption({ label: 'Physical damage found' });
    await dialog.getByRole('button', { name: 'Request rework' }).click();
    await expect(page.getByText('Decision recorded.')).toBeVisible();

    const row = page.locator('li', { has: page.getByText('Physical damage found', { exact: true }) });
    await expect(row).toContainText('1');
    await expect(page.getByText(/Physical damage found\. Terminal post cracked/)).toBeVisible();
  });

  test('a lab operator cannot review tests', async ({ page }) => {
    await signInAs(page, USERS.lab);
    await openApp(page, '/app/tests?status=submitted');
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(page.getByText('Waiting for a battery engineer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  test('a platform administrator cannot approve and has no intake access', async ({ page }) => {
    await signInAs(page, USERS.admin);
    await openApp(page, '/app/tests');
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await page.goto('/app/intake');
    await expect(page.getByRole('heading', { name: /Intake & import is not available to your role/ })).toBeVisible();
  });

  test('customers are blocked from intelligence and see redacted passports', async ({ page }) => {
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/intelligence');
    await expect(page.getByRole('heading', { name: /Intelligence is not available to your role/ })).toBeVisible();

    await page.goto('/app/scan?label=B-0005');
    await expect(page.getByText('Customer view')).toBeVisible();
    await expect(page.getByText(/Not shown:.*Internal costs and margins/)).toBeVisible();
    await page.getByRole('tab', { name: 'Costs' }).click();
    await expect(page.getByText('Costs are not visible to your role')).toBeVisible();
    await page.getByRole('tab', { name: 'Audit history' }).click();
    await expect(page.getByText('Audit history is not visible to your role')).toBeVisible();
  });

  test('finance sees costs; unknown cost is never shown as zero', async ({ page }) => {
    await signInAs(page, USERS.finance);
    await openApp(page, '/app/scan?label=B-0003'); // seed: acquisition cost not supplied
    await page.getByRole('tab', { name: 'Costs' }).click();
    await expect(page.getByText('Unknown').first()).toBeVisible();
    await expect(page.getByText(/total is a minimum/)).toBeVisible();
  });
});

test.describe('alerts, assistant and lookup', () => {
  test('a service manager acknowledges an alert', async ({ page }) => {
    await signInAs(page, USERS.noc);
    await openApp(page, '/app/alerts');
    await page.getByRole('button', { name: /Cell temperature above limit/ }).click();
    await page.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(page.getByText('Alert acknowledged.')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Acknowledged').first()).toBeVisible();
  });

  test('the assistant refuses SQL and equipment control, and drafts need confirmation', async ({ page }) => {
    await signInAs(page, USERS.noc);
    await openApp(page, '/app/overview');
    await page.getByRole('button', { name: 'Assistant' }).click();
    const input = page.getByLabel('Ask the assistant');

    await input.fill('SELECT * FROM batteries');
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page.getByText(/cannot run SQL/)).toBeVisible();

    await input.fill('Switch off the charger on string 1');
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page.getByText(/never control sensors, chargers or any equipment/)).toBeVisible();

    await input.fill('Draft a service task.');
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page.getByText('Draft, not created')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and create' }).click();
    await expect(page.getByText(/created/).last()).toBeVisible();
  });

  test('an unknown QR reference reveals nothing', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?ref=SYN-ZZZZ-ZZZZ');
    await expect(page.getByText('No matching battery')).toBeVisible();
    await expect(page.getByText(/lookup key only/)).toBeVisible();
  });

  test('a scan of a valid reference opens the passport', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0002');
    await expect(page.getByText('This battery’s story')).toBeVisible();
    await page.getByRole('tab', { name: 'Lifecycle timeline' }).click();
    await expect(page.getByRole('list', { name: /Lifecycle timeline/ })).toBeVisible();
  });
});

test.describe('deployments', () => {
  test('shows compatibility checks and deploys a qualified battery to an empty slot', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/deployments');

    const battery = page.getByLabel('Battery (qualified or reserved)');
    await expect(battery.locator('option')).not.toHaveCount(1);
    const options = await battery.locator('option').allTextContents();
    const target = options.find((o) => /B-0002/.test(o)) ?? options[1];
    await battery.selectOption({ label: target });

    const slot = page.getByLabel('Empty slot');
    const slotOptions = await slot.locator('option').allTextContents();
    await slot.selectOption({ label: slotOptions.find((o) => /Site A.*String 2.*position 4/.test(o)) ?? slotOptions[1] });

    await expect(page.getByText('Compatibility checks')).toBeVisible();
    await expect(page.getByRole('list').filter({ hasText: /Passed|Warning|Blocked/ }).first()).toBeVisible();
  });
});

test.describe('states', () => {
  test('shows an empty state when filters match nothing', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries?q=no-such-battery-xyz');
    await expect(page.getByText('No records match these filters')).toBeVisible();
  });

  test('shows a not-found state for an unknown battery id', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/batteries/00000000-0000-4000-8000-000000000000');
    await expect(page.locator('#main').getByRole('alert')).toContainText('Record not found');
  });

  test('the battery deep dive switches lens from the drawing and says where each value came from', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0017');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0017');
    const panel = page.getByRole('complementary', { name: 'Lens details' });

    await page.getByRole('button', { name: 'Case: temperature' }).click();
    await expect(page).toHaveURL(/lens=temperature/);
    await expect(panel.getByRole('heading', { name: 'Temperature' })).toBeVisible();
    await expect(panel.getByText('Ambient')).toBeVisible();
    await expect(panel.getByText('Not measured').first()).toBeVisible();
    await expect(panel.getByText(/^Simulated · /)).toBeVisible();

    await page.getByRole('tablist', { name: 'Battery lens' }).getByRole('tab', { name: 'Temperature' }).press('ArrowRight');
    await expect(panel.getByRole('heading', { name: 'Capacity' })).toBeVisible();
    await expect(panel.getByText(/no plate-health score/)).toBeVisible();

    await page.getByRole('button', { name: /State of charge/ }).click();
    await expect(page).toHaveURL(/lens=voltage/);
    await expect(panel.getByText(/not measured/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Ask the assistant' }).click();
    await expect(page.getByRole('dialog').getByText(/is flagged for these recorded reasons/)).toBeVisible();
  });

  test('intelligence opens on the data collection pipeline, with the missing sale price called out', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/intelligence');
    await expect(page.getByRole('heading', { name: 'The chain each battery needs' })).toBeVisible();
    await expect(page.getByText('Sale price or recovered value recorded')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Retest after treatment' })).toBeVisible();
  });

  test('intelligence shows its sources, the learning loop, a simulator and read-only agents', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/intelligence?view=sources');
    const machines = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Chargers and test machines' }) });
    await expect(machines.getByText('Not connected', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Learning loop' }).click();
    await expect(page).toHaveURL(/view=learning/);
    await expect(page.getByText('Eligible training rows')).toBeVisible();
    await expect(page.getByText(/Training set fingerprint/)).toBeVisible();

    await page.getByRole('tab', { name: 'Connections' }).click();
    await page.getByRole('button', { name: 'Start simulator' }).click();
    await expect(page.getByText('Attached').first()).toBeVisible();
    await page.getByRole('button', { name: 'Send a bad reading' }).click();
    await expect(page.getByText('Quarantined').first()).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: 'Pause simulator' }).click();

    await page.getByRole('tab', { name: 'Agents' }).click();
    await page.getByRole('button', { name: 'Compare outcomes' }).click();
    await expect(page.getByText(/sale price per battery/)).toBeVisible();
  });

  test('the analyst routes a question, shows its tools, and says when the records cannot answer', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/intelligence?view=agents');
    await page.getByRole('button', { name: 'Which battery types had the best revival yield last month?' }).click();
    await expect(page.getByText('Routed because it asks how outcomes compare across groups.')).toBeVisible();
    await expect(page.getByText('compare_process_cohorts', { exact: true })).toBeVisible();

    await page.getByRole('textbox', { name: 'Your question' }).fill('Show batteries where treatment cost exceeded the value recovered.');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText('The records cannot answer this yet')).toBeVisible();
    await expect(page.getByText(/no battery has a recorded sale price/)).toBeVisible();
  });

  test('the route calculator needs a sale price before it suggests revive, test or recycle', async ({ page }) => {
    await signInAs(page, USERS.finance);
    await openApp(page, '/app/scan?label=B-0034');
    await page.getByRole('tablist', { name: 'Battery lens' }).getByRole('tab', { name: 'Outlook' }).click();
    await page.getByRole('button', { name: 'Open route calculator' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Not enough to suggest a route')).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Sale price if saleable (AED)' }).fill('420');
    await dialog.getByRole('textbox', { name: 'Recycling value (AED)' }).fill('60');
    await dialog.getByRole('textbox', { name: 'Logistics if recycled (AED)' }).fill('15');
    await expect(dialog.getByText(/Suggested route/)).toBeVisible();
    await expect(dialog.getByText('Break-even chance')).toBeVisible();
  });

  test('every intelligence output carries the demonstration label and provenance', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/intelligence?view=outputs');
    await expect(page.getByText('Demonstration output — not validated for production decisions.')).toBeVisible();
    await expect(page.getByText('Shadow mode').first()).toBeVisible();
    await expect(page.getByText(/Human review:/).first()).toBeVisible();
  });
});
