import { expect, type Page } from '@playwright/test';

/** Demo users per role. Sign-in only selects a demo user; there is no real authentication. */
export const USERS = {
  lab: 'u_lab1',
  engineer: 'u_eng1',
  field: 'u_field1',
  noc: 'u_noc',
  finance: 'u_fin',
  customer: 'u_cust',
  admin: 'u_admin',
} as const;

/** Seeds the demo session before the first navigation. Each test gets a fresh browser context and a fresh seed. */
export async function signInAs(page: Page, user: (typeof USERS)[keyof typeof USERS]) {
  await page.addInitScript((id) => {
    try {
      if (!window.localStorage.getItem('synovra-demo-user')) window.localStorage.setItem('synovra-demo-user', id);
    } catch {
      /* ignore */
    }
  }, user);
}

export async function openApp(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}
