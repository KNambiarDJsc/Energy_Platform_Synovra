import { expect, test } from '@playwright/test';

test.describe('public landing page', () => {
  test('states the product promise and the demo notice', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every battery, on the record.');
    await expect(page.getByTestId('demo-banner')).toContainText('Synthetic demonstration data. No live customer, cloud or sensor connection.');
    await expect(page.getByRole('link', { name: 'Open the demo' })).toBeVisible();
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
    await page.getByRole('link', { name: 'Open the demo' }).click();
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

test.describe('landing page imagery and motion', () => {
  test('every picture says what it is: the hero is an illustration, photographs carry credits', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Illustration of a 12 V lead-acid battery in cutaway\. Not a photograph or scan of any Synovra battery\./)).toBeVisible();
    await expect(page.getByRole('img', { name: /Illustration of a 12 volt lead-acid battery in cutaway/ })).toBeVisible();
    // The archival photograph is credited beside it.
    const interlude = page.getByRole('region', { name: 'Lead and its records' });
    await expect(interlude.getByRole('link', { name: 'Lead ingots' })).toBeVisible();
    await expect(interlude).toContainText('public domain, via Wikimedia Commons');
    // The pictures in the questions list are captioned as drawings or credited as photographs.
    const captions = page.locator('.lp-cap');
    await expect(captions).toHaveCount(4);
    await expect(captions.nth(0)).toContainText('Illustration, drawn for this page');
    await expect(captions.nth(2)).toContainText('via Wikimedia Commons');
  });

  test('the sentence that fills in as it is read never drops below a legible tone', async ({ page }) => {
    await page.goto('/');
    const fill = page.locator('.lp-fill');
    await fill.scrollIntoViewIfNeeded();
    const words = fill.locator('.lp-w');
    const n = await words.count();
    expect(n).toBeGreaterThan(8);
    // Part-way down the pinned scene the first words are lit and the last are dimmed, but only to 40%.
    const top = await fill.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y + window.innerHeight * 0.4), top);
    await page.waitForTimeout(400);
    const first = Number(await words.first().evaluate((el) => getComputedStyle(el).opacity));
    const last = Number(await words.last().evaluate((el) => getComputedStyle(el).opacity));
    expect(first).toBeGreaterThan(0.95);
    expect(last).toBeGreaterThanOrEqual(0.39);
    expect(last).toBeLessThan(0.9);
  });

  test('with reduced motion nothing waits to appear and nothing scrubs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every battery, on the record.');
    const lines = page.locator('.lp-hero [data-line]');
    for (let i = 0; i < (await lines.count()); i++) {
      expect(await lines.nth(i).evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    }
    // Sections that normally rise into place are already in place.
    const reveal = page.locator('.lp-enf-head [data-reveal]').first();
    expect(await reveal.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    // The scrubbed sentence is fully lit from the start.
    expect(await page.locator('.lp-w').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await page.locator('.lp-w').last().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
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

  test('rows stay legible after the open row moves on, and a row never hides when the page scrolls past and back', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const rows = page.locator('.lp-q-list .lp-qrow');
    const top = await rows.first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - 300), top);
    await page.waitForTimeout(600);
    // Wheel down through the whole list and well beyond it, then back up through it.
    for (let i = 0; i < 16; i++) { await page.mouse.move(900, 450); await page.mouse.wheel(0, 260); await page.waitForTimeout(250); }
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(250); }
    await page.waitForTimeout(800);
    for (const row of await rows.all()) {
      const button = row.locator('button');
      expect(await button.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      expect(await button.evaluate((el) => el.hasAttribute('data-in'))).toBe(true);
      // Even a row that is not open is clearly readable: at least 4.5:1 against the dark field.
      const colour = await row.locator('.lp-qrow-q').evaluate((el) => getComputedStyle(el).color);
      const [r, g, b, a] = (colour.match(/[\d.]+/g) ?? []).map(Number);
      const mix = (c: number) => c * (a ?? 1) + 12 * (1 - (a ?? 1));
      const lum = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = 0.2126 * lum(mix(r)) + 0.7152 * lum(mix(g)) + 0.0722 * lum(mix(b));
      const bg = 0.003;
      expect((L + 0.05) / (bg + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe('hero layout', () => {
  for (const [w, h] of [[1366, 768], [1536, 864], [1920, 1080], [1100, 800]]) {
    test(`the headline and the battery never overlap at ${w} by ${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForTimeout(3600); // entrance finished
      const m = await page.evaluate(() => {
        const lines = [...document.querySelectorAll('.lp-hero [data-line]')].map((e) => e.getBoundingClientRect());
        // The drawing itself, not the box around it: its body and terminals.
        const art = document.querySelector('.hb-svg')!.getBoundingClientRect();
        const sub = document.querySelector('.lp-sub')!.getBoundingClientRect();
        return { headRight: Math.max(...lines.map((l) => l.right)), artLeft: art.left, subRight: sub.right, subBottom: sub.bottom, artTop: art.top };
      });
      // The drawing's left edge is a soft fade, so require clear space between the last letter and where the drawing starts.
      expect(m.artLeft, 'the battery starts to the right of the headline').toBeGreaterThanOrEqual(m.headRight - 4);
      expect(m.artLeft, 'and to the right of the paragraph').toBeGreaterThanOrEqual(m.subRight - 4);
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
    await expect(letters).toHaveCount(7);
    // In place: no vertical offset left (the easing can leave a millionth of a pixel).
    const offsets = await letters.evaluateAll((els) => els.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42));
    for (const y of offsets) expect(Math.abs(y)).toBeLessThan(0.5);
    await expect(footer.getByText('Synovra Battery Intelligence, demonstration build')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Demo sign-in' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'What is real' })).toBeVisible();
    // The big wordmark is decoration: a screen reader does not read the name a second time.
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
    for (const o of await footer.locator('[data-f]').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity))) expect(o).toBe('1');
    expect(await footer.locator('.lp-wm span').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test.describe('the pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const centre = async (loc: import('@playwright/test').Locator) => {
    const b = (await loc.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
  };

  test('a cursor follows the pointer, swells over what can be pressed, and never takes a click', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3600);
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
    const cta = await centre(page.getByRole('link', { name: 'Open the demo' }));
    await page.mouse.move(cta.x, cta.y, { steps: 6 });
    await page.waitForTimeout(700);
    expect((await ring.boundingBox())!.width, 'the ring swells over a button').toBeGreaterThan(idle + 20);
    // The cursor layers sit above everything and still let the click through.
    expect(await ring.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await dot.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await page.getByRole('link', { name: 'Open the demo' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a demo role' })).toBeVisible();
  });

  test('a button leans toward the pointer as it nears, then settles back', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3600);
    const link = page.getByRole('link', { name: 'Open the demo' });
    const c = await centre(link);
    const shift = () => link.evaluate((el) => { const t = getComputedStyle(el).translate; return t === 'none' ? [0, 0] : t.split(' ').map(parseFloat); });
    await page.mouse.move(c.x + c.w / 2 + 14, c.y - 6, { steps: 8 });
    await expect.poll(async () => (await shift())[0], { message: 'pulled toward the pointer', timeout: 6000 }).toBeGreaterThan(1);
    expect((await shift())[0], 'by a few pixels, not a lurch').toBeLessThanOrEqual(12);
    await page.mouse.move(c.x, c.y + 400, { steps: 8 });
    await expect.poll(async () => Math.abs((await shift())[0]), { message: 'and settles back', timeout: 6000 }).toBeLessThan(0.5);
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
    expect(await stage.evaluate((el) => parseFloat(el.style.getPropertyValue('--sx')))).toBeGreaterThan(c.w * 0.5);
    const tilt = page.locator('.lp-tilt');
    expect(Math.abs(await tilt.evaluate((el) => parseFloat(el.style.getPropertyValue('--ry'))))).toBeGreaterThan(0.2);
    await page.mouse.move(5, 5, { steps: 4 });
    await page.waitForTimeout(900);
    await expect(stage).not.toHaveAttribute('data-spot-on', '');
  });

  test('a battery cell warms under the cursor and a click in the hero sends out a ripple', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3600);
    const art = page.locator('.hb-svg');
    const b = (await art.boundingBox())!;
    // the right-hand cell: x about 80% across the drawing
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.55, { steps: 8 });
    await page.waitForTimeout(700);
    const k = await page.locator('.hb-cellglow').evaluateAll((els) => els.map((e) => parseFloat((e as SVGElement).style.getPropertyValue('--k'))));
    expect(k).toHaveLength(6);
    expect(k[5]).toBeGreaterThan(k[0]);
    expect(k[5]).toBeGreaterThan(0.4);
    await page.mouse.click(520, 700);
    await expect(page.locator('.lp-hero .lp-pulse')).toHaveCount(1);
  });

  test('footer: letters rise and warm toward the pointer, links quiet their neighbours, the line speeds with scrolling', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(2800);
    const letters = page.locator('.lp-wm span');
    const first = await centre(letters.first());
    const last = await centre(letters.last());
    await page.mouse.move(first.x - 40, first.y, { steps: 5 });
    await page.mouse.move(first.x, first.y, { steps: 5 });
    const read = () => letters.evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.getPropertyValue('--k')) || 0));
    await expect.poll(async () => (await read())[0], { message: 'the letter under the pointer', timeout: 6000 }).toBeGreaterThan(0.5);
    expect((await read())[6], 'a letter far from it').toBeLessThan(0.1);
    expect(await letters.first().evaluate((el) => getComputedStyle(el).translate)).not.toBe('none');
    await page.mouse.move(last.x, last.y, { steps: 20 });
    await expect.poll(async () => { const k = await read(); return k[6] - k[0]; }, { message: 'the warmth follows the pointer', timeout: 6000 }).toBeGreaterThan(0.3);

    // hovering one link quiets the others
    const nav = page.locator('.lp-foot-nav');
    await nav.getByRole('link', { name: 'What is real' }).hover();
    await page.waitForTimeout(700);
    expect(Number(await nav.getByRole('link', { name: 'Demo sign-in' }).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.6);
    expect(Number(await nav.getByRole('link', { name: 'What is real' }).evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
    // an arrow slides in beside the one you are on
    expect(await nav.getByRole('link', { name: 'What is real' }).locator('.lp-arr').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(8);

    // the outlined line drifts, and scrolling changes its speed
    const track = page.locator('.lp-marquee-track');
    const rate = () => track.evaluate((el) => el.getAnimations()[0]?.playbackRate ?? 0);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(600);
    const calm = await rate();
    await page.mouse.move(700, 880); // off the line: resting on it deliberately slows it
    await page.mouse.wheel(0, -260); // a short scroll keeps the line on screen, where its loop runs
    let peak = 0;
    for (let i = 0; i < 14; i++) { peak = Math.max(peak, Math.abs(await rate())); await page.waitForTimeout(40); }
    expect(peak, 'scrolling changes its speed (and turning back reverses it)').toBeGreaterThan(Math.abs(calm) + 0.5);
  });

  test('a word in the drifting line fills with copper under the pointer', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { const m = document.querySelector('.lp-marquee')!; window.scrollTo(0, m.getBoundingClientRect().top + window.scrollY - 300); });
    await page.waitForTimeout(800);
    const word = page.locator('.lp-marquee-list li span').nth(1); // well inside the screen, not at its drifting edge
    const colour = () => word.evaluate((el) => getComputedStyle(el).color);
    expect(await colour()).toBe('rgba(0, 0, 0, 0)');
    // The line drifts, so aim at the word where it is now on every check, as a person's eye tracks it.
    await expect.poll(async () => {
      const box = (await word.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
      return colour();
    }, { timeout: 8000 }).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('with reduced motion the cursor, the lean and the pull are all absent', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.mouse.move(500, 400, { steps: 5 });
    await page.mouse.move(720, 420, { steps: 5 });
    await page.waitForTimeout(500);
    expect(Number(await page.locator('.lp-cursor-ring').evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
    expect(await page.locator('.lp').evaluate((el) => el.classList.contains('has-pointer'))).toBe(false);
    expect(await page.getByRole('link', { name: 'Open the demo' }).evaluate((el) => getComputedStyle(el).translate)).toBe('none');
    expect(await page.locator('.lp-marquee-track').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test.describe('typography', () => {
  test('labels and readouts are set in the mono face, reading text in Inter and statements in the serif', async ({ page }) => {
    await page.goto('/');
    const family = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(await family('.lp-eyebrow')).toMatch(/mono/i);
    expect(await family('.lp-journey')).toMatch(/mono/i);
    expect(await family('.lp-foot-base')).toMatch(/mono/i);
    expect(await family('.lp-h1')).toMatch(/newsreader/i);
    expect(await family('.lp-sub')).not.toMatch(/mono|newsreader/i);
  });

  test('the lifecycle numerals are outlines that fill when their statement is the open one', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('slider', { name: 'Lifecycle stage' }).fill('2');
    await page.waitForTimeout(1100); // the numerals ease between outline and fill
    const nums = page.locator('.lp-statement .lp-num');
    await expect(nums).toHaveCount(4);
    // the first is the open statement until the reader scrolls; either way each numeral is transparent text with a stroke or filled
    const states = await nums.evaluateAll((els) => els.map((e) => ({ colour: getComputedStyle(e).color, on: e.parentElement!.classList.contains('is-on') })));
    for (const s of states) {
      if (s.on) expect(s.colour).not.toBe('rgba(0, 0, 0, 0)');
      else expect(s.colour).toBe('rgba(0, 0, 0, 0)');
    }
  });
});
