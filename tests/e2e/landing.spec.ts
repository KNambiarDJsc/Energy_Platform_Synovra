import { expect, test, type Locator, type Page } from '@playwright/test';

const centre = async (loc: Locator) => {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
};
const entered = (page: Page) => page.waitForTimeout(3200); // the entrance has finished

test.describe('public landing page', () => {
  test('states the product promise and the demo notice', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every battery, on the record.');
    await expect(page.getByTestId('demo-banner')).toContainText('Synthetic demonstration data. No live customer, cloud or sensor connection.');
    await expect(page.getByRole('link', { name: 'Open the demo' }).first()).toBeVisible();
    await expect(page.getByText('Synovra Battery Intelligence, demonstration build')).toBeVisible();
    for (const heading of ['Try the rules', 'Questions it answers', 'What it enforces']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('the live fragments enforce the product rules', async ({ page }) => {
    await page.goto('/');
    const rules = page.locator('#rules');
    await rules.getByRole('button', { name: 'Let the rule check approve' }).click();
    await expect(rules.getByText(/Refused\. A rule check informs the decision/)).toBeVisible();
    await rules.getByRole('button', { name: 'Customer auditor' }).click();
    await expect(rules.getByText('Internal costs are not shown to customers')).toBeVisible();
    await rules.getByRole('button', { name: 'Approve as the current reader' }).click();
    await expect(rules.getByText(/cannot qualify a battery/)).toBeVisible();
    await page.getByRole('slider', { name: 'Lifecycle stage' }).fill('3');
    await expect(page.getByRole('heading', { name: 'Last, a person decides' })).toBeVisible();
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
    await page.getByRole('link', { name: 'Open the demo' }).first().click();
    await expect(page.getByRole('heading', { name: 'Choose a demo role' })).toBeVisible();
    await page.getByTestId('role-battery_engineer').click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByText('Fleet position in the synthetic snapshot')).toBeVisible();

    await page.getByLabel('Demo role').first().selectOption('customer_auditor');
    await expect(page.getByText('Now acting as Customer / auditor')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Intelligence' })).toHaveCount(0);
  });
});

test.describe('structure, after shift5: split hero, status panel, solutions row, platform, menu', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the hero is an orange title block beside a grey tagline and a dark coverage panel, with a media slot below the title', async ({ page }) => {
    await page.goto('/');
    await entered(page);
    const main = await centre(page.locator('.lp-hero-main'));
    const h1 = await centre(page.getByRole('heading', { level: 1 }));
    const media = await centre(page.locator('[data-slot="hero-media"]'));
    const rail = await centre(page.locator('.lp-hero-rail'));
    expect(h1.left).toBeGreaterThanOrEqual(main.left);
    expect(h1.right).toBeLessThanOrEqual(main.right);
    expect(media.top, 'the media slot sits beneath the title').toBeGreaterThan(h1.bottom);
    expect(rail.left, 'the panels sit to the right').toBeGreaterThanOrEqual(main.right - 1);
    expect(await page.locator('.lp-hero-main').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 88, 65)');
    expect(await page.locator('.lp-rail-tag').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(185, 185, 185)');
    await expect(page.getByRole('heading', { name: 'Record coverage' })).toBeVisible();
  });

  test('the coverage panel says how each part reaches the record today: in use, simulated, or not connected', async ({ page }) => {
    await page.goto('/');
    const rows = page.locator('.lp-status-row');
    await expect(rows.filter({ hasText: 'Telemetry' })).toContainText('Simulated');
    await expect(rows.filter({ hasText: 'Machines' })).toContainText('Not connected');
    await expect(rows.filter({ hasText: 'Identity' })).toContainText('In use');
    await expect(page.getByText('Evidence checksums · synthetic')).toBeVisible();
  });

  test('every picture or video not yet supplied is a named placeholder; the battery component is real', async ({ page }) => {
    await page.goto('/');
    const names = await page.locator('[data-slot]:has(.slot-empty)').evaluateAll((els) => els.map((e) => e.getAttribute('data-slot')));
    expect([...names].sort()).toEqual(['solution-decisions', 'solution-evidence', 'solution-identity', 'solution-recovery']);
    for (const label of await page.locator('.slot-empty').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) {
      expect(label).toMatch(/^Placeholder for (video|illustration|image|component): /);
    }
    await expect(page.locator('[data-slot="solution-identity"] .slot-spec')).toContainText('public/landing/slots/solution-identity');
    await expect(page.locator('[data-slot="platform-twin"]').getByRole('img', { name: /exploded view/i })).toBeVisible();
  });

  test('the solutions row steps with its arrows, and a drag never opens a card', async ({ page }) => {
    await page.goto('/');
    await page.locator('#solutions').scrollIntoViewIfNeeded();
    const track = page.locator('.lp-sol-track');
    const prev = page.getByRole('button', { name: /Previous/ });
    const next = page.getByRole('button', { name: /Next/ });
    await expect(prev).toBeDisabled();
    await next.click();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeLessThan(5);
    await expect(page.getByRole('link', { name: /Tests and evidence/ })).toHaveAttribute('href', '/signin?next=%2Fapp%2Ftests');
    const card = await centre(page.locator('.lp-sol-card').first());
    await page.mouse.move(card.x + 150, card.y);
    await page.mouse.down();
    await page.mouse.move(card.x - 100, card.y, { steps: 8 });
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);
    expect(await track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(60);
  });

  test('the menu is a dialog: opens, holds focus, lists every destination, goes there, and closes on Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const name of ['Platform', 'Solutions', 'Try the rules', 'Questions', 'What is real']) await expect(dialog.getByRole('link', { name })).toBeVisible();
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus stays inside the menu').toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Try the rules' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/#rules$/);
  });
});

test.describe('hero video', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('plays muted and looping under the title, with no logo burned in, and can be paused', async ({ page }) => {
    await page.goto('/');
    const slot = page.locator('[data-slot="hero-media"]');
    const video = slot.locator('video');
    await expect(video).toHaveAttribute('src', '/landing/slots/hero-media.mp4');
    expect(await video.evaluate((v: HTMLVideoElement) => [v.muted, v.loop, v.getAttribute('aria-hidden')])).toEqual([true, true, 'true']);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    await slot.getByRole('button', { name: 'Pause the background video' }).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await slot.getByRole('button', { name: 'Play the background video' }).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    // the source file is 16:9 and the slot keeps that shape, so nothing is cropped away
    const box = (await slot.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  });

  test('with reduced motion it does not start by itself, and the poster stands in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const video = page.locator('[data-slot="hero-media"] video');
    await expect(video).toHaveAttribute('poster', '/landing/slots/hero-media.jpg');
    await page.waitForTimeout(800);
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await expect(page.getByRole('button', { name: 'Play the background video' })).toBeVisible();
  });
});

test.describe('fluid hover, after fluidfunctionalism.com', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the highlight finds the item nearest the pointer before the pointer is over it, and leaves with it', async ({ page }) => {
    await page.goto('/');
    await page.locator('#solutions').scrollIntoViewIfNeeded();
    const track = page.locator('.lp-sol-track');
    const links = page.locator('.lp-sol-link');
    const a = await centre(links.nth(0));
    const b = await centre(links.nth(1));
    await page.mouse.move(a.x, a.y, { steps: 4 });
    await expect(links.nth(0)).toHaveAttribute('data-near', '');
    await page.mouse.move((a.right + b.left) / 2 + 5, a.y, { steps: 4 });
    await expect(links.nth(1)).toHaveAttribute('data-near', '');
    await expect(links.nth(0)).not.toHaveAttribute('data-near', '');
    await page.mouse.move(700, 120);
    await expect(track).not.toHaveAttribute('data-fluid-on', '');
  });

  test('in a list it glides row to row, and arrow keys move focus and the highlight together', async ({ page }) => {
    await page.goto('/');
    await entered(page);
    const rows = page.locator('.lp-status-row');
    const list = page.locator('.lp-status-list');
    const r2 = await centre(rows.nth(1));
    const r7 = await centre(rows.nth(6));
    await page.mouse.move(r2.x, r2.y, { steps: 3 });
    await expect(rows.nth(1)).toHaveAttribute('data-near', '');
    await page.mouse.move(r7.x, r7.y, { steps: 8 });
    await expect(rows.nth(6)).toHaveAttribute('data-near', '');
    await expect(list).toHaveAttribute('data-fluid-on', '');
    await rows.nth(6).focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(7)).toBeFocused();
    await expect(rows.nth(7)).toHaveAttribute('data-near', '');
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(6)).toBeFocused();
  });

  test('without motion the highlight still appears, with no glide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const row = page.locator('.lp-status-row').nth(2);
    const c = await centre(row);
    await page.mouse.move(c.x, c.y, { steps: 3 });
    await expect(row).toHaveAttribute('data-near', '');
    expect(await page.locator('.lp-status-list .fl-pill').evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('opacity');
  });
});

test.describe('landing page motion', () => {
  test('with reduced motion nothing waits to appear', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every battery, on the record.');
    for (const t of await page.locator('.lp-hero [data-line]').evaluateAll((els) => els.map((el) => getComputedStyle(el).transform))) expect(t).toBe('none');
    expect(await page.locator('.lp-sec-head [data-reveal]').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    const notes = page.locator('.lp-note');
    for (const o of await notes.evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity))) expect(o).toBe('1');
  });

  test('the questions list reveals every row, including after the open row changes', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('.lp-q-list');
    await list.scrollIntoViewIfNeeded();
    for (const row of await list.locator('button').all()) {
      await row.hover();
      await row.scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(1500);
    for (const row of await list.locator('button').all()) {
      expect(await row.evaluate((el) => getComputedStyle(el).opacity), 'a row that was opened must stay visible').toBe('1');
    }
  });
});

test.describe('hero layout and scale', () => {
  for (const [w, h] of [[1366, 768], [1440, 900], [1536, 864], [1920, 1080], [1100, 800], [390, 844]]) {
    test(`title, actions and panels are placed correctly and fit at ${w} by ${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await entered(page);
      const m = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const cta = document.querySelectorAll('.lp-hero .lp-btn')[0].getBoundingClientRect();
        return { vw: window.innerWidth, vh: window.innerHeight, main: r('.lp-hero-main'), h1: r('.lp-h1'), media: r('[data-slot="hero-media"]'), rail: r('.lp-hero-rail'), cta, scrollW: document.documentElement.scrollWidth, fs: parseFloat(getComputedStyle(document.querySelector('.lp-h1')!).fontSize) };
      });
      expect(m.h1.right, 'the title stays inside its block').toBeLessThanOrEqual(m.main.right + 1);
      expect(m.media.top, 'the media slot is below the title').toBeGreaterThan(m.h1.bottom - 1);
      expect(m.scrollW, 'nothing scrolls sideways').toBeLessThanOrEqual(m.vw + 1);
      if (w > 960) expect(m.rail.left, 'panels to the right').toBeGreaterThanOrEqual(m.main.right - 1);
      else expect(m.rail.top, 'panels stack below').toBeGreaterThanOrEqual(m.main.bottom - 1);
      if (w >= 1366) expect(m.cta.bottom, 'the main action is in the first screen at 100% zoom').toBeLessThanOrEqual(m.vh);
      expect(m.fs).toBeGreaterThan(w <= 400 ? 40 : 80);
      expect(m.fs).toBeLessThanOrEqual(170);
    });
  }
});

test.describe('footer', () => {
  test('the name rises into place, the links work, and it takes you back to the top', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const footer = page.locator('footer.lp-foot');
    await footer.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(2600);
    const letters = footer.locator('.lp-wm span');
    const offsets = await letters.evaluateAll((els) => els.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42));
    expect(offsets.length).toBeGreaterThan(5);
    for (const y of offsets) expect(Math.abs(y)).toBeLessThan(0.5);
    await expect(footer.getByText('Synovra Battery Intelligence, demonstration build')).toBeVisible();
    await expect(footer.locator('.lp-wm')).toHaveAttribute('aria-hidden', 'true');
    await footer.getByRole('link', { name: 'Back to top' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBeLessThan(40);
  });

  test('with reduced motion the footer is complete and still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const footer = page.locator('footer.lp-foot');
    await footer.scrollIntoViewIfNeeded();
    for (const t of await footer.locator('.lp-wm span').evaluateAll((els) => els.map((el) => getComputedStyle(el).transform))) expect(t).toBe('none');
  });
});

test.describe('the pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a cursor follows the pointer, swells over what can be pressed, and never takes a click', async ({ page }) => {
    await page.goto('/');
    await entered(page);
    const dot = page.locator('.lp-cursor-dot');
    const ring = page.locator('.lp-cursor-ring');
    await page.mouse.move(700, 300);
    await page.mouse.move(720, 320, { steps: 4 });
    await page.waitForTimeout(500);
    const d = (await dot.boundingBox())!;
    expect(Math.abs(d.x + d.width / 2 - 720)).toBeLessThan(4);
    expect(Math.abs(d.y + d.height / 2 - 320)).toBeLessThan(4);
    expect(Number(await ring.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
    const idle = (await ring.boundingBox())!.width;
    const cta = await centre(page.locator('.lp-hero .lp-btn').first());
    await page.mouse.move(cta.x, cta.y, { steps: 6 });
    await expect.poll(async () => (await ring.boundingBox())!.width, { timeout: 6000 }).toBeGreaterThan(idle + 20);
    expect(await ring.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  });

  test('a surface glows where the pointer is, and the passport leans toward it', async ({ page }) => {
    await page.goto('/');
    const stage = page.locator('.lp-stage');
    await stage.scrollIntoViewIfNeeded();
    const c = await centre(stage);
    await page.mouse.move(c.x - c.w * 0.2, c.y - c.h * 0.15, { steps: 6 });
    await page.mouse.move(c.x + c.w * 0.25, c.y + c.h * 0.1, { steps: 6 });
    await page.waitForTimeout(700);
    await expect(stage).toHaveAttribute('data-spot-on', '');
    await page.mouse.move(5, 5, { steps: 4 });
    await page.waitForTimeout(900);
    await expect(stage).not.toHaveAttribute('data-spot-on', '');
  });

  test('a cell of the exploded battery warms under the cursor', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-slot="platform-twin"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
    const cell = (await page.locator('.hb-cellglow').nth(5).boundingBox())!;
    await page.mouse.move(cell.x + cell.width / 2 - 40, cell.y + cell.height / 2, { steps: 4 });
    await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 6 });
    await expect.poll(async () => {
      const k = await page.locator('.hb-cellglow').evaluateAll((els) => els.map((e) => parseFloat((e as SVGElement).style.getPropertyValue('--k')) || 0));
      return k[5] - k[0];
    }, { timeout: 6000 }).toBeGreaterThan(0.3);
  });

  test('a click in the hero sends out a ripple', async ({ page }) => {
    await page.goto('/');
    await entered(page);
    await page.mouse.click(520, 520);
    await expect(page.locator('.lp-hero .lp-pulse')).toHaveCount(1);
  });

  test('with reduced motion the cursor, the lean and the pull are all absent', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.mouse.move(500, 400, { steps: 5 });
    await page.mouse.move(720, 420, { steps: 5 });
    await page.waitForTimeout(500);
    expect(Number(await page.locator('.lp-cursor-ring').evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
    expect(await page.locator('.lp').evaluate((el) => el.classList.contains('has-pointer'))).toBe(false);
    expect(await page.locator('.lp-hero .lp-btn').first().evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  });
});

test.describe('typography', () => {
  test('labels are set in the mono face, headings in Instrument Serif without italics, reading text in Inter', async ({ page }) => {
    await page.goto('/');
    const family = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(await family('.lp-status-row')).toMatch(/mono/i);
    expect(await family('.lp-foot-base')).toMatch(/mono/i);
    expect(await family('.lp-h1')).toMatch(/instrument serif/i);
    const styles = await page.evaluate(() => [...document.querySelectorAll('.lp *')].map((e) => getComputedStyle(e).fontStyle));
    expect(styles.filter((s) => s === 'italic' || s === 'oblique'), 'no italics anywhere on the landing page').toHaveLength(0);
  });
});
