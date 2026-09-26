import { Then, When } from "../support/fixtures";
import assert from "node:assert/strict";
import { openCommentsMenuIfNeeded } from "../support/ui";
import type { PlaywrightWorld } from "../support/world";

When(
  "an admin clicks the `view guestbook` link",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("link", { name: "view guestbook" }).click();
  },
);

Then(
  "they are taken to the guestbook page",
  async function (this: PlaywrightWorld) {
    await this.page.waitForURL(
      (url) => url.toString().replace(/\/$/, "") === this.guestbookUrl(),
    );
    await this.page.getByRole("button", { name: "submit" }).waitFor();
  },
);

When(
  "an admin clicks the collapsible `comments menu` button",
  async function (this: PlaywrightWorld) {
    await openCommentsMenuIfNeeded(this.page);
    const toggle = this.page.getByRole("button", { name: /comments menu/i });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
  },
);

Then(
  "the `comments menu` opens showing comment sort, filter, and search options",
  async function (this: PlaywrightWorld) {
    const toggle = this.page.getByRole("button", { name: /comments menu/i });
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await this.page.getByLabel("sort comments").waitFor();
    await this.page.getByLabel("search comments").waitFor();
  },
);
