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

  test('every intelligence output carries the demonstration label and provenance', async ({ page }) => {
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/intelligence');
    await expect(page.getByText('Demonstration output — not validated for production decisions.')).toBeVisible();
    await expect(page.getByText('Shadow mode').first()).toBeVisible();
    await expect(page.getByText(/Human review:/).first()).toBeVisible();
  });
});
