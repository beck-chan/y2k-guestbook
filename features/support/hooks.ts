import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import {
  After,
  AfterAll,
  Before,
  BeforeAll,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
  type Page,
} from "playwright";
import { PlaywrightWorld } from "./world";
import { resetGuestRateLimits, restoreDefaultSettings } from "./seed";

config({ path: ".env.local" });

const STEP_TIMEOUT_MS = 15_000;
/** Headed Google SSO: pick an account in the opened browser. */
export const SSO_TIMEOUT_MS = 180_000;

setDefaultTimeout(STEP_TIMEOUT_MS);
if (process.env.HEADED === "1") {
  setDefaultTimeout(SSO_TIMEOUT_MS);
}

const AUTH_DIR = path.join("features", "support", ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "admin.json");
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1400, height: 720 };

let browser: Browser | undefined;
let incognitoBrowser: Browser | undefined;
let persistentChrome: BrowserContext | undefined;
let cdpBrowser: Browser | undefined;
let sharedAdminContext: BrowserContext | undefined;
let sharedAdminPage: Page | undefined;
let sharedUnauthorizedContext: BrowserContext | undefined;
let sharedUnauthorizedPage: Page | undefined;

function isUnauthorized(uri: string) {
  return uri.includes("unauthorized");
}

function isHeaded() {
  return process.env.HEADED === "1";
}

function resolveChannel(headed: boolean): string | undefined {
  const raw = process.env.CHANNEL?.trim();
  // Bundled Playwright Chromium (even when headed).
  if (raw === "playwright" || raw === "chromium") return undefined;
  if (raw) return raw;
  // Headed tests use installed Google Chrome. Playwright still drives it
  // through the Chromium protocol; the window should say Google Chrome.
  if (headed) return "chrome";
  return undefined;
}

function launchOptions(): LaunchOptions {
  const headed = isHeaded();
  const channel = resolveChannel(headed);
  const options: LaunchOptions = { headless: !headed };
  if (channel) {
    options.channel = channel;
    if (headed) {
      options.ignoreDefaultArgs = ["--enable-automation"];
    }
  }
  return options;
}

async function hideAutomation(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
}

async function launchBrowser(): Promise<Browser> {
  const options = launchOptions();
  const launched = await chromium.launch(options);
  const via = options.channel ?? "playwright-chromium";
  console.log(
    `Cucumber browser: ${via} ${launched.version()}${options.headless ? " (headless)" : ""}`,
  );
  return launched;
}

async function getMainBrowser() {
  if (!browser) {
    browser = await launchBrowser();
  }
  return browser;
}

async function getIncognitoBrowser() {
  if (!incognitoBrowser) {
    incognitoBrowser = await launchBrowser();
  }
  return incognitoBrowser;
}

async function attachContext(
  world: PlaywrightWorld,
  context: BrowserContext,
  incognito: boolean,
) {
  world.browser = context.browser() ?? cdpBrowser ?? (await getMainBrowser());
  world.context = context;
  world.page =
    context.pages().find((page) => !page.isClosed()) ?? (await context.newPage());
  world.incognito = incognito;
}

/** New tab in the real Chrome window, then localhost — do not reuse restored tabs. */
async function attachSsoTab(world: PlaywrightWorld, context: BrowserContext) {
  world.browser = context.browser() ?? cdpBrowser ?? (await getMainBrowser());
  world.context = context;
  world.page = await context.newPage();
  world.incognito = false;
  await world.page.goto(world.guestbookUrl(), { waitUntil: "domcontentloaded" });
}

function chromeUserDataDir() {
  const fromEnv = process.env.CHROME_USER_DATA?.trim();
  if (fromEnv) return fromEnv;
  // Chrome 136+ ignores --remote-debugging-port on the everyday Default profile.
  return path.resolve(AUTH_DIR, "chrome-debug");
}

function chromeProfileDirectory() {
  return process.env.CHROME_PROFILE?.trim() || "Default";
}

function chromeCdpUrl() {
  return process.env.CHROME_CDP?.trim() || "http://127.0.0.1:9222";
}

function chromeCdpPort() {
  try {
    const port = Number(new URL(chromeCdpUrl()).port);
    return Number.isFinite(port) && port > 0 ? port : 9222;
  } catch {
    return 9222;
  }
}

function chromeExecutable() {
  const fromEnv = process.env.CHROME_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform === "win32") {
    return path.join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    );
  }
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "google-chrome";
}

function chromeDebugCommand() {
  return `"${chromeExecutable()}" --remote-debugging-port=${chromeCdpPort()} --remote-allow-origins=* --user-data-dir="${chromeUserDataDir()}"`;
}

async function connectCdp(timeoutMs: number) {
  const url = chromeCdpUrl();
  const started = Date.now();
  let last: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      return await chromium.connectOverCDP(url, { timeout: 2_000 });
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function spawnChromeWithCdp() {
  spawn(
    chromeExecutable(),
    [
      `--remote-debugging-port=${chromeCdpPort()}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${chromeUserDataDir()}`,
      `--profile-directory=${chromeProfileDirectory()}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    { detached: true, stdio: "ignore" },
  ).unref();
}

async function getNormalChromeProfile() {
  if (persistentChrome && persistentChrome.pages().some((page) => !page.isClosed())) {
    return persistentChrome;
  }

  try {
    cdpBrowser = await connectCdp(2_000);
  } catch {
    spawnChromeWithCdp();
    try {
      cdpBrowser = await connectCdp(20_000);
    } catch {
      throw new Error(
        `Nothing is listening on ${chromeCdpUrl()}. Chrome 136+ ignores --remote-debugging-port unless you also pass a non-default --user-data-dir.\n` +
          `Start Chrome with:\n  ${chromeDebugCommand()}\n` +
          `Then confirm ${chromeCdpUrl()}/json/version loads JSON, and rerun the tests. Sign into Google in that Chrome window (it is a separate profile from your everyday one).`,
      );
    }
  }

  persistentChrome = cdpBrowser.contexts()[0];
  if (!persistentChrome) {
    throw new Error("Connected to Chrome over CDP but found no browser context.");
  }
  await hideAutomation(persistentChrome);
  console.log(`Cucumber SSO: attached to Chrome ${cdpBrowser.version()} at ${chromeCdpUrl()}`);
  return persistentChrome;
}

function isSharedPage(page: Page | undefined) {
  return (
    page === sharedAdminPage ||
    page === sharedUnauthorizedPage
  );
}

async function ensureSharedAdminContext(world: PlaywrightWorld) {
  world.expectAdmin = true;
  if (sharedAdminPage && !sharedAdminPage.isClosed()) {
    await attachContext(world, sharedAdminContext!, false);
    return;
  }
  if (isHeaded()) {
    const context = await getNormalChromeProfile();
    await attachSsoTab(world, context);
    sharedAdminContext = context;
    sharedAdminPage = world.page;
    return;
  }
  const useAuth = existsSync(AUTH_FILE);
  sharedAdminContext = await (await getMainBrowser()).newContext({
    viewport: DESKTOP,
    storageState: useAuth ? AUTH_FILE : undefined,
  });
  sharedAdminPage = await sharedAdminContext.newPage();
  await attachContext(world, sharedAdminContext, false);
}

/**
 * Guest browser so non-admin Google SSO cannot reuse the admin account.
 * Pass `reuse` so unauthorized scenarios share one login.
 * Headed SSO uses your real Chrome Default profile so Google will allow sign-in.
 */
export async function ensureIncognitoContext(
  world: PlaywrightWorld,
  reuse = false,
) {
  world.expectAdmin = false;
  if (reuse && sharedUnauthorizedPage && !sharedUnauthorizedPage.isClosed()) {
    await attachContext(world, sharedUnauthorizedContext!, true);
    return;
  }
  if (isHeaded() && reuse) {
    const context = await getNormalChromeProfile();
    await attachSsoTab(world, context);
    sharedUnauthorizedContext = context;
    sharedUnauthorizedPage = world.page;
    return;
  }
  const guest = await getIncognitoBrowser();
  const context = await guest.newContext({ viewport: DESKTOP });
  await attachContext(world, context, true);
  if (reuse) {
    sharedUnauthorizedContext = context;
    sharedUnauthorizedPage = world.page;
  }
}

function isSettings(uri: string) {
  return uri.includes("admin-settings");
}

function isAdminSuite(uri: string) {
  return uri.includes(`${path.sep}admin${path.sep}`) || uri.includes("/admin/");
}

function isGuestbookSuite(uri: string) {
  return (
    uri.includes(`${path.sep}guestbook${path.sep}`) ||
    uri.includes("/guestbook/")
  );
}

BeforeAll(async function () {
  if (!isHeaded()) {
    browser = await launchBrowser();
  }
});

Before({ timeout: SSO_TIMEOUT_MS }, async function (this: PlaywrightWorld, { pickle }) {
  this.scenarioName = pickle.name;
  const unauthorized = isUnauthorized(pickle.uri);
  const guestbook = isGuestbookSuite(pickle.uri);
  const admin = isAdminSuite(pickle.uri);
  setDefaultTimeout(admin ? SSO_TIMEOUT_MS : STEP_TIMEOUT_MS);
  if (unauthorized) {
    await ensureIncognitoContext(this, true);
  } else if (guestbook) {
    await ensureIncognitoContext(this, false);
  } else if (admin) {
    await ensureSharedAdminContext(this);
  } else {
    const main = await getMainBrowser();
    this.browser = main;
    this.context = await main.newContext({ viewport: DESKTOP });
    this.page = await this.context.newPage();
    this.incognito = false;
  }
  if (guestbook) {
    try {
      await resetGuestRateLimits();
    } catch (err) {
      console.error("Failed to reset guest rate limits:", err);
    }
  }
  if (isSettings(pickle.uri)) {
    try {
      await restoreDefaultSettings();
      await resetGuestRateLimits();
    } catch (err) {
      console.error("Failed to reset guestbook settings:", err);
    }
  }
});

After(async function (this: PlaywrightWorld, { pickle }) {
  if (
    isAdminSuite(pickle.uri) &&
    !isUnauthorized(pickle.uri) &&
    sharedAdminContext &&
    !isHeaded()
  ) {
    try {
      await mkdir(AUTH_DIR, { recursive: true });
      await sharedAdminContext.storageState({ path: AUTH_FILE });
    } catch (err) {
      console.error("Failed to save admin storage state:", err);
    }
  }

  if (isSettings(pickle.uri)) {
    try {
      await restoreDefaultSettings();
      await resetGuestRateLimits();
    } catch (err) {
      console.error("Failed to restore default guestbook settings:", err);
    }
  }

  if (!isSharedPage(this.page) && this.context) {
    await this.context.close();
  }
});

AfterAll(async function () {
  if (cdpBrowser) {
    await sharedUnauthorizedPage?.close().catch(() => undefined);
    if (sharedAdminPage && sharedAdminPage !== sharedUnauthorizedPage) {
      await sharedAdminPage.close().catch(() => undefined);
    }
    return;
  }
  if (sharedAdminContext) {
    await sharedAdminContext.close().catch(() => undefined);
  }
  if (sharedUnauthorizedContext) {
    await sharedUnauthorizedContext.close().catch(() => undefined);
  }
  await persistentChrome?.close().catch(() => undefined);
  await browser?.close();
  if (incognitoBrowser) {
    await incognitoBrowser.close();
  }
});

export { MOBILE, DESKTOP, AUTH_FILE };
