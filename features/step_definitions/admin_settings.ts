import { Then, When } from "../support/fixtures";
import assert from "node:assert/strict";
import { resetGuestRateLimits } from "../support/seed";
import {
  PROFANITY,
  VALID_BODY,
  clickSubmit,
  fillGuestComment,
  guestAlert,
  openGuestbook,
  uniqueName,
  waitForPostedComment,
} from "../support/ui";
import type { PlaywrightWorld } from "../support/world";

When(
  "an admin updates the `title` setting",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "title";
    this.lastTitle = `cucumber title ${Date.now()}`;
    await this.page.locator('input[name="title"]').fill(this.lastTitle);
  },
);

When(
  "they click the `save changes` button",
  async function (this: PlaywrightWorld) {
    const button = this.page.locator(
      ".admin-settings-actions button[type='submit']",
    );
    await button.click();
    await this.page.waitForTimeout(300);
    await this.page.waitForFunction(
      () => {
        const btn = document.querySelector(
          ".admin-settings-actions button[type='submit']",
        );
        return btn instanceof HTMLButtonElement && !btn.disabled;
      },
      undefined,
      { timeout: 10_000 },
    );
    const saveError = this.page.locator(".admin-settings-list p.comment-error");
    if (await saveError.isVisible().catch(() => false)) {
      throw new Error(`Save failed: ${await saveError.innerText()}`);
    }
  },
);

When(
  "they click the `undo changes` button",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("button", { name: "undo changes" }).click();
    await this.page.waitForTimeout(500);
  },
);

When(
  "an admin updates the `placeholder` setting",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "placeholder";
    this.lastPlaceholder = `cucumber placeholder ${Date.now()}`;
    await this.page.locator('textarea[name="placeholder"]').fill(this.lastPlaceholder);
  },
);

When(
  "an admin sets the `marquee` setting to `off`",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "marquee";
    await this.page
      .getByRole("group", { name: "marquee" })
      .getByRole("button", { name: "off" })
      .click();
  },
);

When(
  "an admin updates the `main font` and its `font size`",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "mainFont";
    await this.page.locator('select[name="main-font"]').selectOption("comic-sans");
    await this.page.locator('select[name="main-font-size"]').selectOption("larger");
  },
);

When(
  "an admin updates the `accent font` and its `font size`",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "accentFont";
    await this.page.locator('select[name="accent-font"]').selectOption("times");
    await this.page.locator('select[name="accent-font-size"]').selectOption("larger");
  },
);

When(
  "an admin updates the `comments per page` setting",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "pageSize";
    await this.page.locator('select[name="comments-per-page"]').selectOption("4");
  },
);

When(
  "an admin sets the `capture email` setting to `off`",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "captureEmail";
    await this.page
      .getByRole("group", { name: "capture email" })
      .getByRole("button", { name: "off" })
      .click();
  },
);

When(
  "an admin adjusts the `comment length` setting to an allowed limit",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "commentLength";
    await this.page.getByLabel("maximum comment characters").fill("10");
  },
);

When(
  "an admin adjusts the `rate limits` settings to allowed limits",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "rateLimits";
    await this.page.getByLabel("comments per interval").fill("20");
    await this.page.getByLabel("interval in minutes").fill("1");
    await this.page.getByLabel("comments per day").fill("100");
  },
);

When(
  "an admin enters comma-separated values in the `profanity allow-list`",
  async function (this: PlaywrightWorld) {
    this.lastSetting = "allowList";
    await this.page.locator('textarea[name="profanity-allow-list"]').fill(PROFANITY);
  },
);

When(
  "an admin clicks on the `view example` link for the `custom theme` setting",
  async function (this: PlaywrightWorld) {
    const popupPromise = this.page.waitForEvent("popup");
    await this.page.getByRole("link", { name: "view example" }).click();
    this.page = await popupPromise;
  },
);

Then(
  "those changes are applied to the admin dashboard",
  async function (this: PlaywrightWorld) {
    if (this.lastSetting === "title" && this.lastTitle) {
      assert.equal(await this.page.locator('input[name="title"]').inputValue(), this.lastTitle);
    }
  },
);

Then(
  "those changes are not applied to the admin dashboard",
  async function (this: PlaywrightWorld) {
    if (this.lastTitle) {
      assert.notEqual(
        await this.page.locator('input[name="title"]').inputValue(),
        this.lastTitle,
      );
    }
  },
);

Then(
  "the settings revert to the previously entered values",
  async function (this: PlaywrightWorld) {
    if (this.lastTitle) {
      assert.notEqual(
        await this.page.locator('input[name="title"]').inputValue(),
        this.lastTitle,
      );
    }
  },
);

Then(
  "those changes are applied to the guestbook page",
  async function (this: PlaywrightWorld) {
    const setting = this.lastSetting;
    if (setting === "commentLength") {
      await openGuestbook(this, true);
      await fillGuestComment(this.page, {
        name: uniqueName(),
        body: "x".repeat(11),
      });
      await clickSubmit(this.page);
      const alert = guestAlert(this.page);
      await alert.waitFor();
      assert.match(await alert.innerText(), /10 characters/i);
      return;
    }
    if (setting === "rateLimits") {
      await resetGuestRateLimits();
      await openGuestbook(this, true);
      const first = uniqueName();
      await fillGuestComment(this.page, { name: first, body: VALID_BODY });
      await clickSubmit(this.page);
      await waitForPostedComment(this.page, first);
      const second = uniqueName();
      await fillGuestComment(this.page, {
        name: second,
        body: `${VALID_BODY} two`,
      });
      await clickSubmit(this.page);
      await waitForPostedComment(this.page, second);
      const alertCount = await guestAlert(this.page).count();
      if (alertCount) {
        assert.doesNotMatch(
          await guestAlert(this.page).innerText(),
          /every 5 minutes/i,
        );
      }
      return;
    }
    if (setting === "allowList") {
      await resetGuestRateLimits();
      await openGuestbook(this, true);
      const name = uniqueName();
      await fillGuestComment(this.page, {
        name,
        body: `please ignore ${PROFANITY}`,
      });
      await clickSubmit(this.page);
      await waitForPostedComment(this.page, name);
      return;
    }

    await openGuestbook(this, true);
    if (setting === "title" && this.lastTitle) {
      const heading = this.page.locator("h1.guestbook-title");
      await heading.waitFor();
      const escaped = this.lastTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(await heading.innerText(), new RegExp(escaped));
      assert.match(await this.page.title(), new RegExp(escaped));
      return;
    }
    if (setting === "placeholder" && this.lastPlaceholder) {
      const ph = await this.page.locator('textarea[name="comment"]').getAttribute("placeholder");
      assert.equal(ph, this.lastPlaceholder);
      return;
    }
    if (setting === "mainFont") {
      const input = this.page.locator("form.comment-compose textarea[name='comment']");
      const family = await input.evaluate((el) => getComputedStyle(el).fontFamily);
      const scale = await this.page
        .locator(".guestbook-themed")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--guestbook-main-scale").trim(),
        );
      assert.match(family, /comic sans/i);
      assert.equal(scale, "1.18");
      return;
    }
    if (setting === "accentFont") {
      const family = await this.page
        .locator("h1.guestbook-title")
        .evaluate((el) => getComputedStyle(el).fontFamily);
      assert.match(family, /times/i);
    }
  },
);

Then(
  "the guestbook title displays without a marquee",
  async function (this: PlaywrightWorld) {
    await openGuestbook(this, true);
    const title = this.page.locator("h1.guestbook-title");
    await title.waitFor();
    const className = await title.getAttribute("class");
    assert.match(className ?? "", /is-static/);
  },
);

Then(
  "the guestbook page paginates at that page size",
  async function (this: PlaywrightWorld) {
    await openGuestbook(this, true);
    const figures = this.page.getByRole("figure");
    const count = await figures.count();
    assert.ok(count <= 4, `expected at most 4 comments on a page, got ${count}`);
  },
);

Then(
  "the email field is not shown on the guestbook page",
  async function (this: PlaywrightWorld) {
    await openGuestbook(this, true);
    assert.equal(await this.page.locator('input[name="email"]').count(), 0);
  },
);

Then(
  "a new tab or window opens to the custom CSS example file",
  async function (this: PlaywrightWorld) {
    assert.match(this.page.url(), /example(\.css)?/);
  },
);
