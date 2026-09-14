import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { PlaywrightWorld } from "./world";

export const VALID_BODY = "hello from cucumber";
export const VALID_EMAIL = "email@example.com";
export const PROFANITY = "fuck";
export const RATE_LIMIT_ERROR =
  /You can post \d+ message\(s\) every \d+ minutes and at most \d+ messages every 24 hours\. Please wait about \d+ minutes?\./;

export function uniqueName() {
  return `cucumber-${Date.now()}`;
}

const READY_MS = 10_000;
const SUBMIT_MS = 10_000;

async function waitForReactSubmit(page: Page, selector: string) {
  await page.locator(selector).waitFor({ state: "attached" });
  await page
    .locator(".route-loading-layer")
    .waitFor({ state: "detached", timeout: READY_MS })
    .catch(() => undefined);
  await page.waitForFunction(
    (sel) => {
      const form = document.querySelector(sel);
      if (!(form instanceof HTMLFormElement) || form.closest("[inert]")) {
        return false;
      }
      const propsKey = Object.keys(form).find((key) =>
        key.startsWith("__reactProps$"),
      );
      if (propsKey) {
        const props = (
          form as unknown as Record<string, { onSubmit?: unknown }>
        )[propsKey];
        if (typeof props?.onSubmit === "function") return true;
      }
      const fiberKey = Object.keys(form).find((key) =>
        key.startsWith("__reactFiber$"),
      );
      if (!fiberKey) return false;
      const fiber = (
        form as unknown as Record<
          string,
          {
            memoizedProps?: { onSubmit?: unknown };
            pendingProps?: { onSubmit?: unknown };
          }
        >
      )[fiberKey];
      const props = fiber?.memoizedProps ?? fiber?.pendingProps;
      return typeof props?.onSubmit === "function";
    },
    selector,
    { timeout: READY_MS },
  );
}

/** PageReveal keeps the SSR form inert until the client overlay unmounts. */
export async function waitForGuestbookReady(page: Page) {
  await waitForReactSubmit(page, "form.comment-compose");
  await page.locator("nav.comment-pages").waitFor({ timeout: READY_MS });
}

export async function waitForAdminReady(page: Page) {
  await waitForReactSubmit(page, "form.admin-filters");
  await page.getByRole("heading", { name: "comments" }).waitFor({
    timeout: READY_MS,
  });
}

export async function openGuestbook(world: PlaywrightWorld, force = false) {
  if (force || !world.isGuestbookPage()) {
    await world.page.goto(world.guestbookUrl(), {
      waitUntil: "domcontentloaded",
    });
  }
  await waitForGuestbookReady(world.page);
}

export async function openAdmin(world: PlaywrightWorld) {
  if (!world.isAdminDashboard()) {
    await world.page.goto(world.adminUrl(), { waitUntil: "domcontentloaded" });
  }
  await waitForAdminReady(world.page);
}

export async function reloadAdmin(world: PlaywrightWorld) {
  await world.page.goto(world.adminUrl(), { waitUntil: "domcontentloaded" });
  await waitForAdminReady(world.page);
}

export async function fillGuestComment(
  page: Page,
  input: { name: string; body: string; email?: string },
) {
  const form = page.locator("form.comment-compose");
  await form.getByLabel("display name").fill(input.name);
  if (input.email != null) {
    await form.locator('input[name="email"]').waitFor();
    await form.locator('input[name="email"]').fill(input.email);
  }
  await form.locator('textarea[name="comment"]').fill(input.body);
}

export async function clickSubmit(page: Page) {
  const button = page
    .locator("form.comment-compose")
    .getByRole("button", { name: "submit" });
  await button.click();
  const submitted = new URL(page.url());
  if (
    submitted.searchParams.has("name") ||
    submitted.searchParams.has("comment")
  ) {
    throw new Error(
      "Guestbook form did a native GET submit; React onSubmit did not run.",
    );
  }
  await page.waitForFunction(
    () => {
      const btn = document.querySelector(
        "form.comment-compose button.comment-action",
      );
      const error = document.querySelector("form.comment-compose p.comment-error");
      if (error && (error.textContent ?? "").trim().length > 0) return true;
      return btn instanceof HTMLButtonElement && !btn.disabled;
    },
    undefined,
    { timeout: SUBMIT_MS },
  );
}

export function guestAlert(page: Page) {
  // Next.js App Router injects an empty `[role=alert]` route announcer.
  // Matching that node makes waitFor succeed immediately with blank text.
  return page.locator("p.comment-error").first();
}

export function visibleText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** HTML5 `type=email` rejects a single DNS label over 63 characters. */
export function emailLongerThan(maxChars: number) {
  const local = "a".repeat(64);
  const label = "b".repeat(63);
  let domain = `${label}.com`;
  let email = `${local}@${domain}`;
  while (email.length <= maxChars) {
    domain = `${label}.${domain}`;
    email = `${local}@${domain}`;
  }
  return email;
}

export async function waitForPostedComment(page: Page, name: string) {
  const posted = page.getByRole("figure").filter({
    has: page.locator(".comment-name", { hasText: name }),
  });
  try {
    await posted.first().waitFor({ timeout: SUBMIT_MS });
  } catch (err) {
    const alert = guestAlert(page);
    const errorText =
      (await alert.count()) > 0 ? visibleText(await alert.innerText()) : "";
    const reason = errorText
      ? `Form error: ${errorText}`
      : err instanceof Error
        ? err.message
        : String(err);
    throw new Error(
      `Posted comment ${JSON.stringify(name)} did not appear. ${reason}`,
    );
  }
  return page.getByRole("figure").first();
}

export async function topFigure(page: Page) {
  const figure = page.getByRole("figure").first();
  await figure.waitFor();
  return figure;
}

export async function openCommentsMenuIfNeeded(page: Page) {
  const sort = page.getByLabel("sort comments");
  if (await sort.isVisible().catch(() => false)) {
    return;
  }
  const toggle = page.getByRole("button", { name: /comments menu/i });
  await toggle.click();
  await sort.waitFor({ state: "visible" });
}

export function adminArticle(page: Page, body: string) {
  return page.locator("article.admin-comment", { hasText: body });
}

export async function assertNextEnabled(page: Page, role: "button" | "link") {
  const pages = page.locator("nav.comment-pages");
  await pages.waitFor({ state: "attached", timeout: 8_000 });
  const next =
    role === "link"
      ? pages.locator("a.comment-page").filter({ hasText: /^next$/i })
      : pages.locator("button.comment-page").filter({ hasText: /^next$/i });
  // `visible` excludes PageReveal's inert tree; the control is already in SSR HTML.
  await next.waitFor({ state: "attached", timeout: 8_000 }).catch(async () => {
    const shown = visibleText(
      await pages.locator(".is-status").innerText().catch(() => ""),
    );
    const figures = await page.getByRole("figure").count();
    throw new Error(
      `Pagination \`next\` is not available (status ${JSON.stringify(shown)}, ${figures} comments on screen). Seed page size + 1 comments and rerun.`,
    );
  });
  assert.equal(await next.count(), 1, "expected an enabled next control");
}
