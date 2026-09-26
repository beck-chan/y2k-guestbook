import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "beck-chan/y2k-guestbook";
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 2500;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cacheFile = join(tmpdir(), "y2k-guestbook-update-check.json");

function updateCheckDisabled() {
  if (process.env.CI) return true;
  const flag = (process.env.Y2K_GUESTBOOK_DISABLE_UPDATE_CHECK ?? "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function parseVersion(version) {
  const match = String(version)
    .trim()
    .replace(/^v/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewer(latest, current) {
  const next = parseVersion(latest);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== installed[i]) return next[i] > installed[i];
  }
  return false;
}

export function formatUpdateNotice(current, latest) {
  const installed = parseVersion(current);
  const next = parseVersion(latest);
  if (!installed || !next) return "";
  const from = installed.join(".");
  const to = next.join(".");
  return `y2k-guestbook ${from} → ${to}. Update: npm i github:${REPO}`;
}

function readInstalledVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "";
  } catch {
    return "";
  }
}

function readCache() {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (typeof parsed?.latest !== "string" || typeof parsed?.checkedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(latest) {
  try {
    writeFileSync(
      cacheFile,
      JSON.stringify({ latest, checkedAt: Date.now() }),
    );
  } catch {
    // A failed cache write only means the next command checks again.
  }
}

async function fetchLatestVersion() {
  const response = await fetch(
    `https://raw.githubusercontent.com/${REPO}/main/package.json`,
    {
      headers: { "User-Agent": "y2k-guestbook-update-check" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body?.version === "string" && parseVersion(body.version)
    ? body.version
    : null;
}

let started = false;

export async function checkForUpdate() {
  if (started || updateCheckDisabled()) return;
  started = true;
  try {
    const current = readInstalledVersion();
    if (!parseVersion(current)) return;

    const cached = readCache();
    const fresh = cached && Date.now() - cached.checkedAt < TTL_MS;
    let latest = fresh ? cached.latest : null;
    if (!fresh) {
      latest = await fetchLatestVersion();
      if (latest) writeCache(latest);
    }
    if (!latest || !isNewer(latest, current)) return;

    const notice = formatUpdateNotice(current, latest);
    if (notice) console.error(notice);
  } catch {
    // A failed lookup should not interrupt dev, build, or the CLI.
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("check-update.mjs")) {
  checkForUpdate()
    .catch(() => {})
    .finally(() => {
      process.exit(0);
    });
}
