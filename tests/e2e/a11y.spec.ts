import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { USERS, openApp, signInAs } from './helpers';

/** WCAG 2.1 A/AA rules via axe-core. Fails on any violation and prints the offending selectors. */
async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  // Let entrance and tab transitions finish, so colour contrast is measured on settled text, not mid-fade.
  // Infinite animations (a slow breathing tint, a hotspot pulse) are skipped: they never finish.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => undefined))));
  // Some content fades in with script-driven opacity that getAnimations() cannot see, so a scan right after a switch
  // can measure half-faded text. Scan again a few times: a real violation is still there on the last scan.
  let violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
  for (let retry = 0; retry < 4 && violations.length > 0; retry++) {
    await page.waitForTimeout(500);
    violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
  }
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

const APP_ROUTES = ['/app/home', '/app/batteries', '/app/actions', '/app/reports'];

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test('public pages', async ({ page }) => {
    await page.goto('/');
    await audit(page, 'landing');
    await page.goto('/signin');
    await audit(page, 'sign-in');
  });

  for (const route of APP_ROUTES) {
    test(`customer ${route}`, async ({ page }) => {
      await signInAs(page, USERS.customer);
      await openApp(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, route);
    });
  }

  test('a battery record: every lens, the technical detail, the dialog and Ask', async ({ page }) => {
    test.slow();
    await signInAs(page, USERS.customer);
    await openApp(page, '/app/batteries');
    await page.getByRole('table').first().getByRole('link', { name: /B-0007/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('B-0007');
    await audit(page, 'battery overview');
    for (const lens of ['Temperature', 'Capacity', 'Voltage', 'Outlook']) {
      await page.getByRole('group', { name: 'What to look at' }).getByRole('button', { name: lens }).click();
      await audit(page, `battery ${lens}`);
    }
    await page.getByTestId('technical').locator('summary').click();
    await audit(page, 'battery technical detail');
    await page.getByRole('button', { name: 'Request maintenance' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'request dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ask', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Ask' })).toBeVisible();
    await audit(page, 'ask drawer');
  });
});
