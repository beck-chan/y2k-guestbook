# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: features\guestbook\guestbook-comments.feature.spec.js >> Guestbook page >> Guestbook allows users to submit comments >> User submits an empty display name
- Location: features\reports\.features-gen\features\guestbook\guestbook-comments.feature.spec.js:18:9

# Error details

```
Error: browserType.launch: Executable doesn't exist at C:\Users\9char\AppData\Local\Temp\cursor-sandbox-cache\9bc7d2b766213f0d741c641569904646\playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```

# Test source

```ts
  1   | import { spawn } from "node:child_process";
  2   | import { mkdir } from "node:fs/promises";
  3   | import { existsSync } from "node:fs";
  4   | import path from "node:path";
  5   | import type { TestInfo } from "@playwright/test";
  6   | import { config } from "dotenv";
  7   | import {
  8   |   chromium,
  9   |   type Browser,
  10  |   type BrowserContext,
  11  |   type LaunchOptions,
  12  |   type Page,
  13  | } from "playwright";
  14  | import { PlaywrightWorld } from "./world";
  15  | import { resetGuestRateLimits, restoreDefaultSettings } from "./seed";
  16  | 
  17  | config({ path: ".env.local" });
  18  | 
  19  | /** Headed Google SSO: pick an account in the opened browser. */
  20  | export const SSO_TIMEOUT_MS = 180_000;
  21  | 
  22  | const AUTH_DIR = path.join("features", "support", ".auth");
  23  | const AUTH_FILE = path.join(AUTH_DIR, "admin.json");
  24  | const MOBILE = { width: 390, height: 844 };
  25  | const DESKTOP = { width: 1400, height: 720 };
  26  | 
  27  | let browser: Browser | undefined;
  28  | let incognitoBrowser: Browser | undefined;
  29  | let persistentChrome: BrowserContext | undefined;
  30  | let cdpBrowser: Browser | undefined;
  31  | let sharedAdminContext: BrowserContext | undefined;
  32  | let sharedAdminPage: Page | undefined;
  33  | let sharedUnauthorizedContext: BrowserContext | undefined;
  34  | let sharedUnauthorizedPage: Page | undefined;
  35  | 
  36  | function isUnauthorized(uri: string) {
  37  |   return uri.includes("unauthorized");
  38  | }
  39  | 
  40  | function isHeaded() {
  41  |   return process.env.HEADED === "1";
  42  | }
  43  | 
  44  | function resolveChannel(headed: boolean): string | undefined {
  45  |   const raw = process.env.CHANNEL?.trim();
  46  |   // Bundled Playwright Chromium (even when headed).
  47  |   if (raw === "playwright" || raw === "chromium") return undefined;
  48  |   if (raw) return raw;
  49  |   // Headed tests use installed Google Chrome. Playwright still drives it
  50  |   // through the Chromium protocol; the window should say Google Chrome.
  51  |   if (headed) return "chrome";
  52  |   return undefined;
  53  | }
  54  | 
  55  | function launchOptions(): LaunchOptions {
  56  |   const headed = isHeaded();
  57  |   const channel = resolveChannel(headed);
  58  |   const options: LaunchOptions = { headless: !headed };
  59  |   if (channel) {
  60  |     options.channel = channel;
  61  |     if (headed) {
  62  |       options.ignoreDefaultArgs = ["--enable-automation"];
  63  |     }
  64  |   }
  65  |   return options;
  66  | }
  67  | 
  68  | async function hideAutomation(context: BrowserContext) {
  69  |   await context.addInitScript(() => {
  70  |     Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  71  |   });
  72  | }
  73  | 
  74  | async function launchBrowser(): Promise<Browser> {
  75  |   const options = launchOptions();
> 76  |   const launched = await chromium.launch(options);
      |                                   ^ Error: browserType.launch: Executable doesn't exist at C:\Users\9char\AppData\Local\Temp\cursor-sandbox-cache\9bc7d2b766213f0d741c641569904646\playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe
  77  |   const via = options.channel ?? "playwright-chromium";
  78  |   console.log(
  79  |     `Playwright browser: ${via} ${launched.version()}${options.headless ? " (headless)" : ""}`,
  80  |   );
  81  |   return launched;
  82  | }
  83  | 
  84  | async function getMainBrowser() {
  85  |   if (!browser) {
  86  |     browser = await launchBrowser();
  87  |   }
  88  |   return browser;
  89  | }
  90  | 
  91  | async function getIncognitoBrowser() {
  92  |   if (!incognitoBrowser) {
  93  |     incognitoBrowser = await launchBrowser();
  94  |   }
  95  |   return incognitoBrowser;
  96  | }
  97  | 
  98  | async function attachContext(
  99  |   world: PlaywrightWorld,
  100 |   context: BrowserContext,
  101 |   incognito: boolean,
  102 | ) {
  103 |   world.browser = context.browser() ?? cdpBrowser ?? (await getMainBrowser());
  104 |   world.context = context;
  105 |   world.page =
  106 |     context.pages().find((page) => !page.isClosed()) ?? (await context.newPage());
  107 |   world.incognito = incognito;
  108 | }
  109 | 
  110 | /** New tab in the real Chrome window, then localhost — do not reuse restored tabs. */
  111 | async function attachSsoTab(world: PlaywrightWorld, context: BrowserContext) {
  112 |   world.browser = context.browser() ?? cdpBrowser ?? (await getMainBrowser());
  113 |   world.context = context;
  114 |   world.page = await context.newPage();
  115 |   world.incognito = false;
  116 |   await world.page.goto(world.guestbookUrl(), { waitUntil: "domcontentloaded" });
  117 | }
  118 | 
  119 | function chromeUserDataDir() {
  120 |   const fromEnv = process.env.CHROME_USER_DATA?.trim();
  121 |   if (fromEnv) return fromEnv;
  122 |   // Chrome 136+ ignores --remote-debugging-port on the everyday Default profile.
  123 |   return path.resolve(AUTH_DIR, "chrome-debug");
  124 | }
  125 | 
  126 | function chromeProfileDirectory() {
  127 |   return process.env.CHROME_PROFILE?.trim() || "Default";
  128 | }
  129 | 
  130 | function chromeCdpUrl() {
  131 |   return process.env.CHROME_CDP?.trim() || "http://127.0.0.1:9222";
  132 | }
  133 | 
  134 | function chromeCdpPort() {
  135 |   try {
  136 |     const port = Number(new URL(chromeCdpUrl()).port);
  137 |     return Number.isFinite(port) && port > 0 ? port : 9222;
  138 |   } catch {
  139 |     return 9222;
  140 |   }
  141 | }
  142 | 
  143 | function chromeExecutable() {
  144 |   const fromEnv = process.env.CHROME_PATH?.trim();
  145 |   if (fromEnv) return fromEnv;
  146 |   if (process.platform === "win32") {
  147 |     return path.join(
  148 |       process.env.PROGRAMFILES || "C:\\Program Files",
  149 |       "Google",
  150 |       "Chrome",
  151 |       "Application",
  152 |       "chrome.exe",
  153 |     );
  154 |   }
  155 |   if (process.platform === "darwin") {
  156 |     return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  157 |   }
  158 |   return "google-chrome";
  159 | }
  160 | 
  161 | function chromeDebugCommand() {
  162 |   return `"${chromeExecutable()}" --remote-debugging-port=${chromeCdpPort()} --remote-allow-origins=* --user-data-dir="${chromeUserDataDir()}"`;
  163 | }
  164 | 
  165 | async function connectCdp(timeoutMs: number) {
  166 |   const url = chromeCdpUrl();
  167 |   const started = Date.now();
  168 |   let last: unknown;
  169 |   while (Date.now() - started < timeoutMs) {
  170 |     try {
  171 |       return await chromium.connectOverCDP(url, { timeout: 2_000 });
  172 |     } catch (err) {
  173 |       last = err;
  174 |       await new Promise((resolve) => setTimeout(resolve, 400));
  175 |     }
  176 |   }
```