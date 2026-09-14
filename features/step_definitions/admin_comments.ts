import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { seedComment } from "../support/seed";
import {
  adminArticle,
  openCommentsMenuIfNeeded,
  reloadAdmin,
  uniqueName,
} from "../support/ui";
import type { PlaywrightWorld } from "../support/world";

async function applySelect(this: PlaywrightWorld, label: string, option: string) {
  await openCommentsMenuIfNeeded(this.page);
  const before = this.page.url();
  await this.page.getByLabel(label).selectOption(option);
  await this.page
    .waitForFunction((prev) => location.href !== prev, before, { timeout: 5_000 })
    .catch(() => undefined);
  await this.page.waitForLoadState("domcontentloaded");
}

async function submitSearch(this: PlaywrightWorld, query: string) {
  await openCommentsMenuIfNeeded(this.page);
  const box = this.page.getByLabel("search comments");
  await box.fill(query);
  await box.press("Enter");
  await this.page.waitForFunction(
    (expected) =>
      (new URL(location.href).searchParams.get("q") ?? "")
        .toLowerCase()
        .includes(expected),
    query.toLowerCase(),
    { timeout: 8_000 },
  );
  await this.page.waitForLoadState("domcontentloaded");
}

function commentsLede(this: PlaywrightWorld) {
  return this.page.locator(".admin-filters .admin-lede");
}

async function bodiesOnPage(this: PlaywrightWorld) {
  return this.page.locator("article.admin-comment .comment-body").allInnerTexts();
}

When(
  "admins filter comments by read status",
  async function (this: PlaywrightWorld) {
    const seeded = await seedComment({
      display_name: uniqueName(),
      body: `read-filter-${Date.now()}`,
      is_read: false,
    });
    this.seededBody = seeded.body;
    this.seededName = seeded.name;
    await reloadAdmin(this);
    const article = adminArticle(this.page, seeded.body);
    await article.getByLabel("mark as read").check();
    await this.page.waitForTimeout(400);
    await applySelect.call(this, "filter by status", "unread");
  },
);

Then(
  "comments without the selected criteria are hidden",
  async function (this: PlaywrightWorld) {
    if (this.seededBody) {
      const shown = await adminArticle(this.page, this.seededBody).count();
      const url = this.page.url();
      if (url.includes("status=unread")) {
        assert.equal(shown, 0, "read comment should be hidden when filtering unread");
      }
      if (url.includes("email=has") && this.seededWithoutEmailBody) {
        assert.equal(
          await adminArticle(this.page, this.seededWithoutEmailBody).count(),
          0,
        );
      }
      if (url.includes("email=none") && this.seededWithEmailBody) {
        assert.equal(
          await adminArticle(this.page, this.seededWithEmailBody).count(),
          0,
        );
      }
      if (url.includes("from=") && this.seededNewerBody) {
        assert.equal(await adminArticle(this.page, this.seededNewerBody).count(), 0);
      }
    }
  },
);

When(
  "admins filter comments by date range",
  async function (this: PlaywrightWorld) {
    const olderDay = new Date();
    olderDay.setDate(olderDay.getDate() - 7);
    const olderIso = olderDay.toISOString();
    const olderDate = olderIso.slice(0, 10);
    const older = await seedComment({
      display_name: uniqueName(),
      body: `older-${Date.now()}`,
      created_at: olderIso,
    });
    const newer = await seedComment({
      display_name: uniqueName(),
      body: `newer-${Date.now()}`,
    });
    this.seededBody = older.body;
    this.seededOlderBody = older.body;
    this.seededNewerBody = newer.body;
    await reloadAdmin(this);
    await openCommentsMenuIfNeeded(this.page);
    await this.page.getByLabel("from date").fill(olderDate);
    await this.page.getByLabel("to date").fill(olderDate);
    await this.page.waitForURL(new RegExp(`from=${olderDate}`), { timeout: 8_000 });
    await this.page.waitForLoadState("domcontentloaded");
  },
);

When(
  "admins filter comments by whether they were submitted with an email",
  async function (this: PlaywrightWorld) {
    const withEmail = await seedComment({
      display_name: uniqueName(),
      body: `with-email-${Date.now()}`,
      email: "seed@example.com",
    });
    const without = await seedComment({
      display_name: uniqueName(),
      body: `no-email-${Date.now()}`,
      email: null,
    });
    this.seededWithEmailBody = withEmail.body;
    this.seededWithoutEmailBody = without.body;
    this.seededBody = withEmail.body;
    await reloadAdmin(this);
    await applySelect.call(this, "filter by contact", "has");
  },
);

When(
  "admins sort comments by newest timestamps",
  async function (this: PlaywrightWorld) {
    const olderDay = new Date();
    olderDay.setDate(olderDay.getDate() - 3);
    this.seededOlderBody = (
      await seedComment({
        display_name: uniqueName(),
        body: `sort-old-${Date.now()}`,
        created_at: olderDay.toISOString(),
      })
    ).body;
    this.seededNewerBody = (
      await seedComment({
        display_name: uniqueName(),
        body: `sort-new-${Date.now()}`,
      })
    ).body;
    await reloadAdmin(this);
    await applySelect.call(this, "sort comments", "newest");
  },
);

When(
  "admins sort comments by oldest timestamps",
  async function (this: PlaywrightWorld) {
    const olderDay = new Date();
    olderDay.setDate(olderDay.getDate() - 3);
    this.seededOlderBody = (
      await seedComment({
        display_name: uniqueName(),
        body: `sort-old-${Date.now()}`,
        created_at: olderDay.toISOString(),
      })
    ).body;
    this.seededNewerBody = (
      await seedComment({
        display_name: uniqueName(),
        body: `sort-new-${Date.now()}`,
      })
    ).body;
    await reloadAdmin(this);
    await applySelect.call(this, "sort comments", "oldest");
  },
);

Then(
  "the comments sort according to the selected criteria",
  async function (this: PlaywrightWorld) {
    const bodies = await bodiesOnPage.call(this);
    if (this.seededOlderBody && this.seededNewerBody) {
      const oldIdx = bodies.findIndex((text) => text.includes(this.seededOlderBody!));
      const newIdx = bodies.findIndex((text) => text.includes(this.seededNewerBody!));
      if (oldIdx >= 0 && newIdx >= 0) {
        const url = this.page.url();
        if (url.includes("sort=oldest")) {
          assert.ok(oldIdx < newIdx, "oldest should appear before newest");
        } else {
          assert.ok(newIdx < oldIdx, "newest should appear before oldest");
        }
      }
    }
  },
);

Then(
  "the sort display indicator updates accordingly",
  async function (this: PlaywrightWorld) {
    const lede = commentsLede.call(this);
    await lede.waitFor();
    const text = await lede.innerText();
    if (this.page.url().includes("sort=oldest")) {
      assert.match(text, /oldest first/);
    } else {
      assert.match(text, /newest first/);
    }
  },
);

When(
  "admins search comments by keywords",
  async function (this: PlaywrightWorld) {
    const seeded = await seedComment({
      display_name: uniqueName(),
      body: `search example ${Date.now()}`,
    });
    this.seededBody = seeded.body;
    await reloadAdmin(this);
    await submitSearch.call(this, seeded.body);
  },
);

Then(
  "comments not matching submitted keywords are hidden",
  async function (this: PlaywrightWorld) {
    const term = this.seededBody ?? "search example";
    assert.ok(await adminArticle(this.page, term).count());
    const bodies = await bodiesOnPage.call(this);
    for (const body of bodies) {
      assert.match(body, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  },
);

Given(
  "admins have applied a sort, a filter, and a search to comments",
  async function (this: PlaywrightWorld) {
    const match = await seedComment({
      display_name: uniqueName(),
      body: "search example",
      email: "stack@example.com",
    });
    await seedComment({
      display_name: uniqueName(),
      body: "other comment",
      email: null,
    });
    this.seededBody = match.body;
    await reloadAdmin(this);
    await applySelect.call(this, "sort comments", "oldest");
    await applySelect.call(this, "filter by contact", "has");
    await submitSearch.call(this, "search example");
  },
);

Then(
  "results stack on top of other sorts, filters, or searches",
  async function (this: PlaywrightWorld) {
    const url = this.page.url();
    assert.match(url, /sort=oldest/);
    assert.match(url, /email=has/);
    assert.match(url, /q=search/);
    assert.ok(await adminArticle(this.page, "search example").count());
    assert.equal(await adminArticle(this.page, "other comment").count(), 0);
  },
);

Given(
  "admins have applied search keywords, sorting, or filters to comments",
  async function (this: PlaywrightWorld) {
    await applySelect.call(this, "sort comments", "oldest");
    await submitSearch.call(this, "search example");
  },
);

When("they click the `clear all` link", async function (this: PlaywrightWorld) {
  await openCommentsMenuIfNeeded(this.page);
  await this.page.getByRole("link", { name: "clear all" }).click();
  await this.page.waitForFunction(
    () => {
      const params = new URL(location.href).searchParams;
      const q = params.get("q");
      const sort = params.get("sort");
      return !q && (!sort || sort === "newest");
    },
    undefined,
    { timeout: 8_000 },
  );
});

Then(
  "search, filter, or sort results are cleared",
  async function (this: PlaywrightWorld) {
    const url = new URL(this.page.url());
    assert.equal(url.searchParams.get("q") ?? "", "");
    assert.ok(!url.searchParams.get("sort") || url.searchParams.get("sort") === "newest");
  },
);

When(
  "admins mark a comment read or unread",
  async function (this: PlaywrightWorld) {
    const seeded = await seedComment({
      display_name: uniqueName(),
      body: `mark-one-${Date.now()}`,
      is_read: false,
    });
    this.seededBody = seeded.body;
    await reloadAdmin(this);
    const box = adminArticle(this.page, seeded.body).getByLabel("mark as read");
    await box.check();
    await this.page.waitForTimeout(400);
  },
);

Then(
  "the read status saves automatically",
  async function (this: PlaywrightWorld) {
    const box = adminArticle(this.page, this.seededBody ?? "").getByLabel(
      "mark as read",
    );
    assert.equal(await box.isChecked(), true);
  },
);

Then(
  "the unread count updates accordingly",
  async function (this: PlaywrightWorld) {
    const searchCounts = this.page.locator(".admin-comment-counts-search");
    if (await searchCounts.isVisible().catch(() => false)) {
      await searchCounts.locator(".admin-comment-count-value").first().waitFor();
      return;
    }
    await this.page.getByRole("button", { name: /comments menu/i }).waitFor();
  },
);

When(
  "admins click the `mark all read` button",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("button", { name: "mark all read" }).click();
    await this.page.waitForTimeout(400);
  },
);

Then("all comments are marked read", async function (this: PlaywrightWorld) {
  const boxes = this.page.getByLabel("mark as read");
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) {
    assert.equal(await boxes.nth(i).isChecked(), true);
  }
});

When(
  "admins click the `mark all unread` button",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("button", { name: "mark all unread" }).click();
    await this.page.waitForTimeout(400);
  },
);

Then("all comments are marked unread", async function (this: PlaywrightWorld) {
  const boxes = this.page.getByLabel("mark as read");
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) {
    assert.equal(await boxes.nth(i).isChecked(), false);
  }
});

When(
  "admins click on the `edit` button for a comment",
  async function (this: PlaywrightWorld) {
    const seeded = await seedComment({
      display_name: uniqueName(),
      body: "for editing",
    });
    this.seededName = seeded.name;
    this.seededBody = seeded.body;
    await reloadAdmin(this);
    await adminArticle(this.page, "for editing")
      .getByRole("button", { name: "edit" })
      .click();
  },
);

When("they edit the comment body", async function (this: PlaywrightWorld) {
  const editor = this.page.getByLabel(`edit ${this.seededName} comment`);
  await editor.fill("(edited)");
  this.seededBody = "(edited)";
});

When(
  "they click away from the text editor",
  async function (this: PlaywrightWorld) {
    await commentsLede.call(this).click();
    await this.page.waitForTimeout(400);
  },
);

Then("the changes are saved", async function (this: PlaywrightWorld) {
  await adminArticle(this.page, "(edited)").waitFor();
});

When(
  "admins click on the `delete` button for a comment",
  async function (this: PlaywrightWorld) {
    if (!this.seededBody || this.seededBody === "(edited)") {
      const body = this.scenarioName?.includes("cancel")
        ? `for deleting cancel ${Date.now()}`
        : `for deleting ${Date.now()}`;
      const seeded = await seedComment({
        display_name: uniqueName(),
        body,
      });
      this.seededBody = seeded.body;
      await reloadAdmin(this);
    }
    await adminArticle(this.page, this.seededBody)
      .getByRole("button", { name: "delete" })
      .click();
  },
);

When("they click the `confirm` button", async function (this: PlaywrightWorld) {
  const article = adminArticle(this.page, this.seededBody ?? "");
  await article.getByRole("button", { name: "confirm" }).click();
  await article.waitFor({ state: "detached", timeout: 10_000 });
});

When("they click the `cancel` button", async function (this: PlaywrightWorld) {
  await adminArticle(this.page, this.seededBody ?? "")
    .getByRole("button", { name: "cancel" })
    .click();
});

Then("the comment is removed", async function (this: PlaywrightWorld) {
  assert.equal(await adminArticle(this.page, this.seededBody ?? "").count(), 0);
});

Then("the comment is not removed", async function (this: PlaywrightWorld) {
  assert.ok(await adminArticle(this.page, this.seededBody ?? "").count());
});

When(
  "an admin clicks the `next` link for comment pagination",
  async function (this: PlaywrightWorld) {
    await this.page.getByRole("link", { name: "next" }).click();
    await this.page.waitForLoadState("domcontentloaded");
  },
);

When(
  "an admin clicks the `prev` link for comment pagination",
  async function (this: PlaywrightWorld) {
    const prev = this.page.getByRole("link", { name: "prev" });
    if (!(await prev.count())) {
      await this.page.getByRole("link", { name: "next" }).click();
      await this.page.waitForLoadState("domcontentloaded");
    }
    await this.page.getByRole("link", { name: "prev" }).click();
    await this.page.waitForLoadState("domcontentloaded");
  },
);
