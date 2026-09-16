import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  MOBILE,
  SSO_TIMEOUT_MS,
  ensureIncognitoContext,
} from "../support/hooks";
import { openAdmin, openGuestbook } from "../support/ui";
import type { PlaywrightWorld } from "../support/world";

async function waitForGoogleSignIn(
  world: PlaywrightWorld,
  kind: "admin" | "unauthorized",
) {
  console.log(
    `Sign in with Google in the opened browser (${kind} account). Waiting up to ${SSO_TIMEOUT_MS / 1000}s…`,
  );
  if (kind === "admin") {
    await world.page.waitForURL(
      (url) =>
        url.toString().startsWith(world.adminUrl()) &&
        !url.pathname.endsWith("/login"),
      { timeout: SSO_TIMEOUT_MS },
    );
    return;
  }
  await world.page.waitForURL(
    (url) => url.searchParams.get("admin_error") === "1",
    { timeout: SSO_TIMEOUT_MS },
  );
}

Given(
  "the user has admin authorization",
  async function (this: PlaywrightWorld) {
    this.expectAdmin = true;
  },
);

Given(
  "the user does not have admin authorization",
  async function (this: PlaywrightWorld) {
    await ensureIncognitoContext(this, true);
  },
);

Given(
  "an authorized admin is signed in with Google SSO",
  { timeout: SSO_TIMEOUT_MS },
  async function (this: PlaywrightWorld) {
    this.expectAdmin = true;
    await openAdmin(this);
    if (this.isAdminDashboard()) {
      return;
    }
    await openGuestbook(this);
    await this.page.getByRole("link", { name: "admin login" }).click();
    await waitForGoogleSignIn(this, "admin");
  },
);

Given(
  /^they are on the admin dashboard \(`\/admin`\)$/,
  async function (this: PlaywrightWorld) {
    await openAdmin(this);
    await this.page.getByRole("heading", { name: "comments" }).waitFor();
  },
);

Given(
  /^they are on the admin dashboard on mobile \(`\/admin`\)$/,
  async function (this: PlaywrightWorld) {
    await this.page.setViewportSize(MOBILE);
    await openAdmin(this);
    await this.page.getByRole("heading", { name: "comments" }).waitFor();
  },
);

Given(
  "the user is shown a message that they do not have admin authorization",
  { timeout: SSO_TIMEOUT_MS },
  async function (this: PlaywrightWorld) {
    await ensureIncognitoContext(this, true);
    const close = this.page.getByRole("button", { name: "Close" });
    if (await close.isVisible().catch(() => false)) {
      return;
    }
    await openGuestbook(this);
    await this.page.getByRole("link", { name: "admin login" }).click();
    await waitForGoogleSignIn(this, "unauthorized");
    await close.waitFor({ state: "visible" });
  },
);

When(
  "they sign in successfully with Google",
  { timeout: SSO_TIMEOUT_MS },
  async function (this: PlaywrightWorld) {
    await waitForGoogleSignIn(
      this,
      this.expectAdmin ? "admin" : "unauthorized",
    );
  },
);

Then(
  /^they are redirected to the `\/admin` dashboard$/,
  async function (this: PlaywrightWorld) {
    assert.equal(this.isAdminDashboard(), true);
    await this.page.getByRole("heading", { name: "comments" }).waitFor();
  },
);

Then(
  "they are redirected to the guestbook page",
  async function (this: PlaywrightWorld) {
    assert.equal(this.isGuestbookPage(), true);
  },
);

Then(
  "they are shown a message that they do not have admin authorization",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("button", { name: "Close" }).waitFor();
    const body = this.page.locator("#admin-auth-error-body");
    await body.waitFor();
    assert.match(await body.innerText(), /isn't an administrator/i);
  },
);

Then("the message closes", async function (this: PlaywrightWorld) {
  await this.page
    .getByRole("button", { name: "Close" })
    .waitFor({ state: "hidden" });
});

When("they click the `Close` button", async function (this: PlaywrightWorld) {
  await this.page.getByRole("button", { name: "Close" }).click();
});
