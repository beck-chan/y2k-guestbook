import { Given, Then, When } from "../support/fixtures";
import assert from "node:assert/strict";
import { MOBILE } from "../support/hooks";
import { ensureCommentsForPagination, publicPageSize } from "../support/seed";
import { ADMIN_PAGE_SIZE } from "../../src/lib/comments";
import {
  PROFANITY,
  RATE_LIMIT_ERROR,
  VALID_BODY,
  VALID_EMAIL,
  assertNextEnabled,
  clickSubmit,
  emailLongerThan,
  fillGuestComment,
  guestAlert,
  openGuestbook,
  reloadAdmin,
  uniqueName,
  visibleText,
  waitForPostedComment,
} from "../support/ui";
import type { PlaywrightWorld } from "../support/world";

Given("a user is on the guestbook page", async function (this: PlaywrightWorld) {
  await openGuestbook(this);
});

Given(
  "a user is on the guestbook page on mobile",
  async function (this: PlaywrightWorld) {
    await this.page.setViewportSize(MOBILE);
    await openGuestbook(this);
  },
);

Given(
  "there are enough comments to trigger pagination",
  async function (this: PlaywrightWorld) {
    const onAdmin = this.isAdminDashboard();
    const pageSize = onAdmin ? ADMIN_PAGE_SIZE : await publicPageSize();
    await ensureCommentsForPagination(pageSize + 1);
    if (onAdmin) {
      await reloadAdmin(this);
    } else {
      // Feature Background already opened the board before this seed.
      await openGuestbook(this, true);
    }
    await assertNextEnabled(this.page, onAdmin ? "link" : "button");
  },
);

When(
  "a user enters in a valid display name and comment body",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    this.postedBody = VALID_BODY;
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: this.postedBody,
    });
  },
);

When("they click the `submit` button", async function (this: PlaywrightWorld) {
  await clickSubmit(this.page);
});

When(
  "a user leaves the display name empty",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    await fillGuestComment(this.page, { name: "", body: VALID_BODY });
  },
);

When(
  "a user leaves the comment body empty",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    await fillGuestComment(this.page, { name: this.postedName, body: "" });
  },
);

When(
  "a user submits a valid comment with a valid email address",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    this.postedBody = VALID_BODY;
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: this.postedBody,
      email: VALID_EMAIL,
    });
    await clickSubmit(this.page);
  },
);

When(
  "a user submits a comment with an invalid email address",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: VALID_BODY,
      email: "not-an-email",
    });
    await clickSubmit(this.page);
  },
);

When(
  "a user enters a valid display name",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    await this.page.getByLabel("display name").fill(this.postedName);
  },
);

When(
  "enters a comment body that contains English profanity",
  async function (this: PlaywrightWorld) {
    this.postedBody = `please ignore ${PROFANITY}`;
    await this.page.locator('textarea[name="comment"]').fill(this.postedBody);
  },
);

When(
  "a user submits a comment with a display name longer than 128 characters",
  async function (this: PlaywrightWorld) {
    this.postedName = "n".repeat(129);
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: VALID_BODY,
    });
    await clickSubmit(this.page);
  },
);

When(
  "a user submits a comment with an email longer than 254 characters",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    const emailField = this.page.locator('input[name="email"]');
    await emailField.waitFor();
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: VALID_BODY,
      email: emailLongerThan(254),
    });
    await clickSubmit(this.page);
  },
);

When(
  "a user submits a comment with a comment body longer than 1000 characters",
  async function (this: PlaywrightWorld) {
    this.postedName = uniqueName();
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: "x".repeat(1001),
    });
    await clickSubmit(this.page);
  },
);

When(
  "a user submits more than 1 comment within 5 minutes",
  async function (this: PlaywrightWorld) {
    const first = uniqueName();
    await fillGuestComment(this.page, {
      name: first,
      body: VALID_BODY,
    });
    await clickSubmit(this.page);
    await waitForPostedComment(this.page, first);
    this.postedName = uniqueName();
    await fillGuestComment(this.page, {
      name: this.postedName,
      body: `${VALID_BODY} again`,
    });
    await clickSubmit(this.page);
  },
);

When(
  "a user clicks the `next` button for comment pagination",
  async function (this: PlaywrightWorld) {
    const pages = this.page.locator('nav[aria-label="Guestbook pages"]');
    await pages
      .locator("button.comment-page")
      .filter({ hasText: /^next$/ })
      .click();
    await pages.locator(".comment-page-current").filter({ hasText: /^2$/ }).waitFor();
  },
);

When(
  "a user clicks the `prev` button for comment pagination",
  async function (this: PlaywrightWorld) {
    const pages = this.page.locator('nav[aria-label="Guestbook pages"]');
    const prev = pages
      .locator("button.comment-page")
      .filter({ hasText: /^prev$/ });
    if (!(await prev.count())) {
      await pages
        .locator("button.comment-page")
        .filter({ hasText: /^next$/ })
        .click();
      await prev.waitFor();
    }
    await prev.click();
    await pages.locator(".comment-page-current").filter({ hasText: /^1$/ }).waitFor();
  },
);

When(
  "a user clicks the `admin login` link",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("link", { name: "admin login" }).click();
  },
);

Then(
  "their comment displays below the submission form as the topmost entry",
  async function (this: PlaywrightWorld) {
    const name = this.postedName ?? "";
    const body = this.postedBody ?? VALID_BODY;
    const top = await waitForPostedComment(this.page, name);
    const text = await top.innerText();
    assert.match(text, new RegExp(name));
    assert.match(text, new RegExp(body));
  },
);

Then("the comment is not submitted", async function (this: PlaywrightWorld) {
  const name = this.postedName ?? "";
  if (name) {
    const top = this.page.getByRole("figure").first();
    if (await top.count()) {
      const text = await top.innerText();
      assert.doesNotMatch(text, new RegExp(`^${name}$`, "m"));
      assert.ok(!text.includes(name) || (await guestAlert(this.page).count()));
    }
  }
  const stillOnBoard = this.page.url().startsWith(this.guestbookUrl());
  assert.equal(stillOnBoard, true);
});

Then(
  "their comment displays without their email",
  async function (this: PlaywrightWorld) {
    const name = this.postedName ?? "";
    const top = await waitForPostedComment(this.page, name);
    const text = await top.innerText();
    assert.match(text, new RegExp(name));
    assert.doesNotMatch(text, /email@example\.com/);
  },
);

Then(
  "their comment is rejected and not submitted",
  async function (this: PlaywrightWorld) {
    const alert = guestAlert(this.page);
    await alert.waitFor({ state: "visible", timeout: 8_000 });
    const message = visibleText(await alert.innerText());
    if (this.postedBody?.includes(PROFANITY)) {
      assert.equal(
        message,
        "Oops. No cursing allowed. Please edit your message body.",
      );
    } else if (this.scenarioName === "User submissions are rate limited") {
      assert.match(message, RATE_LIMIT_ERROR);
    }
    const name = this.postedName ?? "";
    if (name && !name.startsWith("n")) {
      const top = this.page.getByRole("figure").first();
      if (await top.count()) {
        assert.ok(!(await top.innerText()).includes(name));
      }
    }
  },
);

Then(
  "the user is shown an error message",
  async function (this: PlaywrightWorld) {
    const alert = guestAlert(this.page);
    await alert.waitFor({ state: "visible", timeout: 8_000 });
    const text = visibleText(await alert.innerText());
    assert.ok(text.length > 0, "expected a guestbook error message");
  },
);

Then(
  "the next page of comments displays",
  async function (this: PlaywrightWorld) {
    const status = this.page.locator(".comment-page-current");
    await status.waitFor();
    const text = await status.innerText();
    assert.match(text.trim(), /^2$/);
  },
);

Then(
  "the previous page of comments displays",
  async function (this: PlaywrightWorld) {
    const status = this.page.locator(".comment-page-current");
    await status.waitFor();
    const text = await status.innerText();
    assert.match(text.trim(), /^1$/);
  },
);

Then(
  "they are directed to the Google SSO page for the admin dashboard",
  async function (this: PlaywrightWorld) {
    await this.page.waitForURL(/https:\/\/accounts\.google\.com\//, {
      timeout: 15_000,
    });
    assert.match(this.page.url(), /^https:\/\/accounts\.google\.com\//);
  },
);
