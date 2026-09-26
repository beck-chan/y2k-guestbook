#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function canonical(file) {
  return realpathSync.native(file);
}

const packageRoot = canonical(fileURLToPath(new URL("..", import.meta.url)));
const projectRoot = canonical(process.cwd());

loadEnvLocal();

function loadEnvLocal() {
  const file = resolve(projectRoot, ".env.local");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function usage(exit = true) {
  console.error("Usage: npx y2k-guestbook allow-admin you@gmail.com");
  console.error("       npx y2k-guestbook delete-admin you@gmail.com");
  console.error("       npx y2k-guestbook deploy-notifs [--project-ref <ref>]");
  console.error("       npx y2k-guestbook init-instrumentation");
  console.error("       npx y2k-guestbook test [feature path] [--name <scenario>] [--tags <expression>] [-p admin]");
  if (exit) process.exit(1);
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function parseProjectRef(args) {
  const flag = args.indexOf("--project-ref");
  if (flag >= 0) {
    const value = args[flag + 1]?.trim();
    if (!value || value.startsWith("-")) {
      console.error("Missing value for --project-ref");
      process.exit(1);
    }
    return value.startsWith("http") ? projectRefFromUrl(value) : value;
  }
  const positional = args.find((arg) => arg !== "--" && !arg.startsWith("-"));
  if (positional) {
    return positional.startsWith("http")
      ? projectRefFromUrl(positional)
      : positional;
  }
  return projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

function deployNotifs(args) {
  const functionsDir = resolve(packageRoot, "supabase/functions");
  const configFile = resolve(packageRoot, "supabase/config.toml");
  if (!existsSync(functionsDir) || !existsSync(configFile)) {
    console.error(
      `No supabase Edge Functions at ${resolve(packageRoot, "supabase")}`,
    );
    process.exit(1);
  }

  const projectRef = parseProjectRef(args);
  if (!projectRef) {
    console.error(
      "Missing project ref. Pass --project-ref <id> or set NEXT_PUBLIC_SUPABASE_URL in .env.local",
    );
    process.exit(1);
  }

  if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN in the environment (or .env.local)",
    );
    process.exit(1);
  }

  const result = spawnSync(
    "npx",
    [
      "--yes",
      "supabase",
      "functions",
      "deploy",
      "notify-admins",
      "on-user-created",
      "--project-ref",
      projectRef,
      "--use-api",
    ],
    { cwd: packageRoot, env: process.env, stdio: "inherit", shell: true },
  );
  process.exit(result.status ?? 1);
}

function posix(file) {
  return file.replaceAll("\\", "/");
}

function relToCwd(abs) {
  return posix(relative(projectRoot, abs));
}

function packagedFeatureArg(arg) {
  const normalized = arg.replaceAll("\\", "/");
  if (normalized === "features" || normalized.startsWith("features/")) {
    return relToCwd(resolve(packageRoot, normalized));
  }
  return posix(normalized);
}

function isFeatureArg(arg) {
  if (arg.startsWith("-")) return false;
  const normalized = arg.replaceAll("\\", "/");
  return (
    normalized.endsWith(".feature") ||
    normalized === "features" ||
    normalized.startsWith("features/")
  );
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    console.error(`Missing value for ${flag}`);
    process.exit(1);
  }
  return value;
}

function htmlReportDir(spec) {
  const normalized = spec.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.toLowerCase().endsWith(".html")
    ? normalized.slice(0, -".html".length)
    : normalized;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function testArgv(rawArgs) {
  const forwarded = [];
  const featurePaths = [];
  const tagExprs = [];
  const extraReports = [];
  let grep = "";
  let profileAdmin = false;
  const args = rawArgs.filter((item) => item !== "--");
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--tags" || arg === "-t") {
      tagExprs.push(takeValue(args, i, arg));
      i += 1;
      continue;
    }
    if (arg.startsWith("--tags=")) {
      tagExprs.push(arg.slice("--tags=".length));
      continue;
    }
    if (arg === "--name" || arg === "-n") {
      grep = escapeRegex(takeValue(args, i, arg));
      i += 1;
      continue;
    }
    if (arg.startsWith("--name=")) {
      grep = escapeRegex(arg.slice("--name=".length));
      continue;
    }
    if (arg === "--format" || arg === "-f") {
      const value = takeValue(args, i, arg);
      i += 1;
      if (!value.startsWith("html:")) {
        console.error("Only --format html:<path> is supported");
        process.exit(1);
      }
      extraReports.push(htmlReportDir(value.slice("html:".length)));
      continue;
    }
    if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (!value.startsWith("html:")) {
        console.error("Only --format html:<path> is supported");
        process.exit(1);
      }
      extraReports.push(htmlReportDir(value.slice("html:".length)));
      continue;
    }
    if (arg === "-p" || arg === "--profile") {
      const value = takeValue(args, i, arg);
      i += 1;
      if (value !== "admin") {
        console.error(`Unknown profile ${value}. Use -p admin.`);
        process.exit(1);
      }
      profileAdmin = true;
      continue;
    }
    if (arg === "--profile=admin") {
      profileAdmin = true;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      console.error(`Unknown profile ${arg.slice("--profile=".length)}. Use -p admin.`);
      process.exit(1);
    }
    if (isFeatureArg(arg)) {
      featurePaths.push(packagedFeatureArg(arg));
    } else {
      forwarded.push(arg);
    }
  }
  if (featurePaths.length === 0) {
    featurePaths.push(relToCwd(resolve(packageRoot, "features/features")));
  }
  return {
    forwarded,
    featurePaths,
    tags: tagExprs.length ? tagExprs.join(" and ") : "",
    grep,
    profileAdmin,
    extraReports,
  };
}

function resolvePkgDir(name) {
  const direct = [
    join(projectRoot, "node_modules", name),
    join(packageRoot, "node_modules", name),
  ];
  for (const dir of direct) {
    if (existsSync(join(dir, "package.json"))) return canonical(dir);
  }
  for (const origin of [projectRoot, packageRoot]) {
    try {
      const req = createRequire(join(origin, "package.json"));
      return canonical(dirname(req.resolve(`${name}/package.json`)));
    } catch {
      // Try the package root next, then tell the user to install.
    }
  }
  return "";
}

function pkgBin(pkgDir, binName) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[binName];
  const cli = bin ? resolve(pkgDir, bin) : "";
  if (!cli || !existsSync(cli)) {
    console.error(`Could not find ${binName} in ${pkgDir}`);
    process.exit(1);
  }
  return cli;
}

function installedRuntimeRoot() {
  const normalized = packageRoot.replaceAll("\\", "/");
  if (!normalized.includes("/node_modules/y2k-guestbook")) return "";
  return resolve(projectRoot, "features/reports/.y2k-runtime");
}

function materializeInstalledTests() {
  const dest = installedRuntimeRoot();
  if (!dest) return packageRoot;
  // Node will not run the TypeScript that ships inside node_modules.
  // Copy the steps next to the host project, which is where the clone runs them.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(resolve(dest, "src/lib"), { recursive: true });
  cpSync(resolve(packageRoot, "features/support"), resolve(dest, "features/support"), {
    recursive: true,
  });
  cpSync(
    resolve(packageRoot, "features/step_definitions"),
    resolve(dest, "features/step_definitions"),
    { recursive: true },
  );
  for (const file of [
    "src/lib/comments.ts",
    "src/lib/guestbookPaths.ts",
    "src/lib/guestbookSettingsShared.ts",
  ]) {
    cpSync(resolve(packageRoot, file), resolve(dest, file));
  }
  return dest;
}

function uniqueExisting(paths) {
  const unique = [];
  for (const file of paths) {
    const posixFile = posix(file);
    if (!existsSync(posixFile)) continue;
    const key = process.platform === "win32" ? posixFile.toLowerCase() : posixFile;
    const seen = unique.some((item) => {
      const itemKey = process.platform === "win32" ? item.toLowerCase() : item;
      return itemKey === key;
    });
    if (!seen) unique.push(posixFile);
  }
  return unique;
}

function stepGlobs(runtime) {
  const dirs = uniqueExisting([
    resolve(runtime, "features/step_definitions"),
    resolve(projectRoot, "features/step_definitions"),
  ]);
  const fixtures = posix(resolve(runtime, "features/support/fixtures.ts"));
  return [fixtures, ...dirs];
}

function writePlaywrightConfig(featurePaths, reportDir, runtime) {
  const featuresRoot = posix(resolve(packageRoot, "features"));
  const outputDir = posix(resolve(projectRoot, "features/reports/.features-gen"));
  const source = `import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: ${JSON.stringify(featurePaths.map((file) => posix(resolve(projectRoot, file))))},
  steps: ${JSON.stringify(stepGlobs(runtime))},
  featuresRoot: ${JSON.stringify(featuresRoot)},
  outputDir: ${JSON.stringify(outputDir)},
  missingSteps: "fail-on-run",
});

export default defineConfig({
  testDir,
  workers: 1,
  timeout: process.env.HEADED === "1" ? 360_000 : 180_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: ${JSON.stringify(posix(reportDir))}, open: "never" }],
  ],
  use: {
    screenshot: "only-on-failure",
    viewport: { width: 1400, height: 720 },
    headless: true,
  },
});
`;
  const relative = "features/reports/playwright.config.ts";
  writeFileSync(resolve(projectRoot, relative), source);
  return relative;
}

function testEnv(runtime) {
  const extra = dirname(packageRoot);
  const sep = process.platform === "win32" ? ";" : ":";
  const current = process.env.NODE_PATH || "";
  const parts = current.split(sep).filter(Boolean);
  if (!parts.includes(extra)) parts.unshift(extra);
  const env = { ...process.env, NODE_PATH: parts.join(sep) };
  if (runtime !== packageRoot) {
    env.Y2K_GUESTBOOK_TESTING_ENTRY = resolve(
      runtime,
      "features/support/fixtures.ts",
    );
  }
  return env;
}

function runNode(script, args, runtime) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    env: testEnv(runtime),
    stdio: "inherit",
    shell: false,
  });
}

function copyReport(fromDir, toSpec) {
  const dest = resolve(projectRoot, toSpec);
  if (resolve(dest) === resolve(fromDir)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(fromDir, dest, { recursive: true });
  console.log(`HTML report: ${posix(join(dest, "index.html"))}`);
}

function runFeatureTests(args) {
  const featuresDir = resolve(packageRoot, "features/features");
  if (!existsSync(featuresDir)) {
    console.error(`No feature files at ${featuresDir}`);
    process.exit(1);
  }
  const bddDir = resolvePkgDir("playwright-bdd");
  const playwrightDir = resolvePkgDir("@playwright/test");
  if (!bddDir || !playwrightDir) {
    console.error(
      "Install @playwright/test and playwright-bdd in this app (refer to the Feature Tests guide).",
    );
    process.exit(1);
  }

  const reportsDir = resolve(projectRoot, "features/reports");
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(resolve(projectRoot, "features/support/.auth"), {
    recursive: true,
  });
  const runtime = materializeInstalledTests();

  const { forwarded, featurePaths, tags, grep, profileAdmin, extraReports } =
    testArgv(args);
  const reportDir = resolve(reportsDir, profileAdmin ? "admin" : "results");
  const configFile = writePlaywrightConfig(featurePaths, reportDir, runtime);

  console.log(
    `Feature files:\n${featurePaths.map((file) => `  ${file}`).join("\n")}`,
  );
  if (tags) console.log(`Tags: ${tags}`);
  if (grep) console.log(`Scenario: ${grep}`);
  console.log(`HTML report: ${posix(join(reportDir, "index.html"))}`);

  const bddArgs = ["-c", configFile];
  if (tags) bddArgs.push("--tags", tags);
  const generated = runNode(pkgBin(bddDir, "bddgen"), bddArgs, runtime);
  if (generated.error) {
    console.error(generated.error.message);
    process.exit(1);
  }
  if ((generated.status ?? 1) !== 0) process.exit(generated.status ?? 1);

  const playwrightArgs = ["test", "-c", configFile, "--workers=1", ...forwarded];
  if (grep) playwrightArgs.push("--grep", grep);
  const result = runNode(pkgBin(playwrightDir, "playwright"), playwrightArgs, runtime);
  if (existsSync(reportDir)) {
    for (const extra of extraReports) copyReport(reportDir, extra);
  }
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function initInstrumentation() {
  const src = resolve(packageRoot, "instrumentation-client.ts.example");
  if (!existsSync(src)) {
    console.error(`No instrumentation-client.ts.example at ${src}`);
    process.exit(1);
  }
  const destDir = existsSync(resolve(projectRoot, "src"))
    ? resolve(projectRoot, "src")
    : projectRoot;
  const dest = resolve(destDir, "instrumentation-client.ts");
  if (existsSync(dest)) {
    console.error(`${dest} already exists`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Wrote ${dest}`);
}

function requireEnv() {
  const envFile = resolve(projectRoot, ".env.local");
  if (!existsSync(envFile)) {
    console.error(`No .env.local at ${envFile}`);
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    console.error(
      `Missing ${missing.join(" and ")} in ${resolve(projectRoot, ".env.local")}`,
    );
    process.exit(1);
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseEmail(args) {
  const email = args.find((arg) => arg !== "--")?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    usage();
  }
  return email;
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      return { error };
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return { user: match };
    if (data.users.length < 200) break;
  }
  return { user: null };
}

async function allowAdmin(email) {
  const supabase = requireEnv();
  const { error } = await supabase.from("admin_allowlist").upsert({ email });
  if (error) {
    console.error("Failed to allow admin:", error.message);
    process.exit(1);
  }

  const { user, error: listError } = await findUserByEmail(supabase, email);
  if (listError) {
    console.error("Allowlist saved, but listing users failed:", listError.message);
    process.exit(1);
  }

  console.log(`Allowed admin: ${email}`);
  if (!user) {
    console.log(
      "No existing Auth user with that email yet; role will be set on first signup.",
    );
    return;
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { app_metadata: { ...user.app_metadata, role: "admin" } },
  );
  if (updateError) {
    console.error(
      "Allowlist saved, but failed to set app_metadata.role:",
      updateError.message,
    );
    process.exit(1);
  }
  console.log("Set app_metadata.role=admin on existing Auth user.");
}

async function deleteAdmin(email) {
  const supabase = requireEnv();
  const { error, count } = await supabase
    .from("admin_allowlist")
    .delete({ count: "exact" })
    .eq("email", email);

  if (error) {
    console.error("Failed to remove from allowlist:", error.message);
    process.exit(1);
  }

  if ((count ?? 0) === 0) {
    console.log(`No allowlist row for ${email} (already absent).`);
  } else {
    console.log(`Removed ${email} from admin_allowlist.`);
  }

  const { user, error: listError } = await findUserByEmail(supabase, email);
  if (listError) {
    console.error(
      "Allowlist updated, but listing users failed:",
      listError.message,
    );
    process.exit(1);
  }

  if (!user) {
    console.log("No existing Auth user with that email; allowlist-only change.");
    return;
  }

  const rest = { ...(user.app_metadata ?? {}) };
  delete rest.role;
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { app_metadata: { ...rest, role: null } },
  );
  if (updateError) {
    console.error(
      "Allowlist updated, but failed to clear app_metadata.role:",
      updateError.message,
    );
    process.exit(1);
  }
  console.log("Cleared app_metadata.role on existing Auth user.");
  console.log(
    "They should sign out (or wait for the session to refresh) before admin access is gone.",
  );
}

const [command, ...rest] = process.argv.slice(2);

if (command === "allow-admin") {
  await allowAdmin(parseEmail(rest));
} else if (command === "delete-admin") {
  await deleteAdmin(parseEmail(rest));
} else if (command === "deploy-notifs") {
  deployNotifs(rest);
} else if (command === "init-instrumentation") {
  initInstrumentation();
} else if (command === "test") {
  runFeatureTests(rest);
} else {
  usage();
}
