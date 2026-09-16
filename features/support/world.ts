import { config } from "dotenv";
import {
  IWorldOptions,
  setWorldConstructor,
  World,
} from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "playwright";

config({ path: ".env.local" });

function stripSlash(value: string) {
  return value.replace(/\/$/, "") || "/";
}

function joinUrl(baseUrl: string, path: string) {
  const base = `${stripSlash(baseUrl)}/`;
  const relative = path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return new URL(relative, base).toString().replace(/\/$/, "") || stripSlash(baseUrl);
}

export type LastSetting =
  | "title"
  | "placeholder"
  | "marquee"
  | "mainFont"
  | "accentFont"
  | "pageSize"
  | "captureEmail"
  | "commentLength"
  | "rateLimits"
  | "allowList";

export class PlaywrightWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  baseUrl: string;
  guestbookPath: string;
  adminPath: string;
  expectAdmin = true;
  incognito = false;
  postedName?: string;
  postedBody?: string;
  lastSetting?: LastSetting;
  lastTitle?: string;
  lastPlaceholder?: string;
  seededName?: string;
  seededBody?: string;
  seededWithoutEmailBody?: string;
  seededWithEmailBody?: string;
  seededOlderBody?: string;
  seededNewerBody?: string;
  scenarioName?: string;

  constructor(options: IWorldOptions) {
    super(options);
    const fromEnv = process.env.BASE_URL;
    const fromConfig = options.parameters.baseUrl;
    this.baseUrl = String(fromEnv ?? fromConfig ?? "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    const guestbook =
      process.env.NEXT_PUBLIC_GUESTBOOK_PATH ||
      options.parameters.guestbookPath ||
      "/";
    const admin =
      process.env.NEXT_PUBLIC_GUESTBOOK_ADMIN_PATH ||
      options.parameters.adminPath ||
      "/admin";
    this.guestbookPath = stripSlash(String(guestbook)) === "" ? "/" : stripSlash(String(guestbook));
    this.adminPath = stripSlash(String(admin));
  }

  guestbookUrl() {
    return joinUrl(this.baseUrl, this.guestbookPath === "/" ? "/" : this.guestbookPath);
  }

  adminUrl() {
    return joinUrl(this.baseUrl, this.adminPath);
  }

  adminLoginUrl() {
    return `${this.adminUrl()}/login`;
  }

  isGuestbookPage() {
    if (!this.page || this.page.isClosed()) return false;
    try {
      const here = new URL(this.page.url());
      const home = new URL(this.guestbookUrl());
      const homePath = home.pathname || "/";
      return here.origin === home.origin && here.pathname === homePath;
    } catch {
      return false;
    }
  }

  isAdminDashboard() {
    if (!this.page || this.page.isClosed()) return false;
    try {
      const here = new URL(this.page.url());
      const admin = new URL(this.adminUrl());
      const adminPath = admin.pathname.replace(/\/$/, "") || "/admin";
      const path = here.pathname.replace(/\/$/, "") || "/";
      return (
        here.origin === admin.origin &&
        path === adminPath &&
        !path.endsWith("/login")
      );
    } catch {
      return false;
    }
  }
}

setWorldConstructor(PlaywrightWorld);
