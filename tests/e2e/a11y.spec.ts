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
  // Tab content fades in with script-driven opacity that getAnimations() cannot see, so a scan right after a tab
  // switch can measure half-faded text. Scan again a few times: a real violation is still there on the last scan.
  let violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
  for (let retry = 0; retry < 4 && violations.length > 0; retry++) {
    await page.waitForTimeout(500);
    violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
  }
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

const APP_ROUTES = [
  '/app/overview', '/app/batteries', '/app/intake', '/app/tests', '/app/restoration', '/app/inventory',
  '/app/deployments', '/app/monitoring', '/app/alerts', '/app/reports', '/app/intelligence',
  '/app/intelligence?view=sources', '/app/intelligence?view=learning', '/app/intelligence?view=agents', '/app/intelligence?view=connections',
];

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test('public pages', async ({ page }) => {
    await page.goto('/');
    await audit(page, 'landing');
    await page.goto('/signin');
    await audit(page, 'sign-in');
  });

  for (const route of APP_ROUTES) {
    test(`engineer ${route}`, async ({ page }) => {
      await signInAs(page, USERS.engineer);
      await openApp(page, route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, route);
    });
  }

  test('administrator /app/admin', async ({ page }) => {
    await signInAs(page, USERS.admin);
    await openApp(page, '/app/admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, '/app/admin');
  });

  test('passport tabs', async ({ page }) => {
    test.slow(); // several full-page scans of the largest page
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0002');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0002');
    await audit(page, 'passport summary');
    for (const tab of ['Lifecycle timeline', 'Tests', 'Monitoring', 'Costs', 'Evidence', 'Audit history']) {
      const t = page.getByRole('tab', { name: tab, exact: false }).first();
      if ((await t.count()) === 0) continue;
      await t.click();
      await audit(page, `passport ${tab}`);
    }
  });

  test('battery deep dive lenses', async ({ page }) => {
    test.slow(); // several full-page scans of the largest page
    await signInAs(page, USERS.engineer);
    await openApp(page, '/app/scan?label=B-0017');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B-0017');
    const panel = page.getByRole('complementary', { name: 'Lens details' });
    for (const [lens, heading] of [['Overview', 'Where it stands'], ['Temperature', 'Temperature'], ['Capacity', 'Capacity'], ['Charge & discharge', 'Charge & discharge'], ['Outlook', 'Outlook']]) {
      await page.getByRole('tablist', { name: 'Battery lens' }).getByRole('tab', { name: lens }).click();
      // Scan only once this lens's panel is mounted, so its fade-in is among the animations the audit waits for.
      await expect(panel.getByRole('heading', { level: 2, name: heading })).toBeVisible();
      await audit(page, `lens ${lens}`);
    }
  });

  test('dialogs and drawers', async ({ page }) => {
    await signInAs(page, USERS.noc);
    await openApp(page, '/app/alerts');
    await page.getByRole('button', { name: /Cell temperature above limit/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'alert drawer');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Assistant' }).click();
    await expect(page.getByLabel('Ask the assistant')).toBeVisible();
    await audit(page, 'assistant');
  });
});
