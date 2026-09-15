#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

loadEnvLocal();

function loadEnvLocal() {
  const file = resolve(process.cwd(), ".env.local");
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
  console.error("       npx y2k-guestbook test [cucumber-js args]");
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
  return posix(relative(process.cwd(), abs));
}

function packagedFeatureArg(arg) {
  const normalized = arg.replaceAll("\\", "/");
  if (normalized === "features" || normalized.startsWith("features/")) {
    return relToCwd(resolve(packageRoot, normalized));
  }
  return arg;
}

function tsFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => posix(resolve(dir, name)));
}

function cucumberRequireFiles() {
  const files = [
    ...tsFiles(resolve(packageRoot, "features/support")),
    ...tsFiles(resolve(packageRoot, "features/step_definitions")),
    ...tsFiles(resolve(process.cwd(), "features/step_definitions")),
  ];
  return [...new Set(files)].map(relToCwd);
}

function cucumberProfileYaml(htmlFile, requireFiles) {
  const requireBlock = requireFiles
    .map((file) => `    - ${JSON.stringify(file)}`)
    .join("\n");
  return `  requireModule:
    - tsx/cjs
  require:
${requireBlock}
  format:
    - progress-bar
    - html:${htmlFile}
  formatOptions:
    snippetInterface: async-await
  worldParameters:
    baseUrl: http://localhost:3000
    guestbookPath: /
    adminPath: /admin
`;
}

function writeCucumberConfig() {
  const requireFiles = cucumberRequireFiles();
  const yaml = `default:
${cucumberProfileYaml("features/reports/results.html", requireFiles)}
admin:
${cucumberProfileYaml("features/reports/admin.html", requireFiles)}
`;
  const relative = "features/reports/y2k-guestbook-cucumber.yaml";
  writeFileSync(resolve(process.cwd(), relative), yaml);
  return relative;
}

function cucumberArgv(rawArgs) {
  let sawFeature = false;
  const forwarded = [];
  for (const arg of rawArgs.filter((item) => item !== "--")) {
    const mapped = packagedFeatureArg(arg);
    if (mapped !== arg) sawFeature = true;
    forwarded.push(mapped);
  }
  if (!sawFeature) {
    forwarded.push(relToCwd(resolve(packageRoot, "features/features")));
  }
  return forwarded;
}

function resolveCucumberCli() {
  const hostRequire = createRequire(join(process.cwd(), "package.json"));
  let pkgDir = existsSync(
    join(process.cwd(), "node_modules/@cucumber/cucumber/package.json"),
  )
    ? join(process.cwd(), "node_modules/@cucumber/cucumber")
    : "";
  if (!pkgDir) {
    try {
      let dir = dirname(hostRequire.resolve("@cucumber/cucumber"));
      while (dir !== dirname(dir)) {
        const pkgFile = join(dir, "package.json");
        if (existsSync(pkgFile)) {
          const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
          if (pkg.name === "@cucumber/cucumber") {
            pkgDir = dir;
            break;
          }
        }
        dir = dirname(dir);
      }
    } catch {
      pkgDir = "";
    }
  }
  if (!pkgDir) {
    console.error(
      "Install @cucumber/cucumber, playwright, and tsx in this app (refer to the Cucumber Test guide).",
    );
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["cucumber-js"];
  const cli = bin ? resolve(pkgDir, bin) : join(pkgDir, "bin/cucumber.js");
  if (!existsSync(cli)) {
    console.error(`Could not find cucumber-js at ${cli}`);
    process.exit(1);
  }
  return cli;
}

function runCucumber(args) {
  const featuresDir = resolve(packageRoot, "features/features");
  if (!existsSync(featuresDir)) {
    console.error(`No Cucumber features at ${featuresDir}`);
    process.exit(1);
  }
  const reportsDir = resolve(process.cwd(), "features/reports");
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(resolve(process.cwd(), "features/support/.auth"), {
    recursive: true,
  });

  const configFile = writeCucumberConfig();
  const cucumberArgs = cucumberArgv(args);
  const profileAdmin = cucumberArgs.some((arg, i) => {
    const prev = cucumberArgs[i - 1];
    return (
      (arg === "admin" && (prev === "-p" || prev === "--profile")) ||
      arg === "--profile=admin"
    );
  });
  const htmlReport = profileAdmin
    ? resolve(reportsDir, "admin.html")
    : resolve(reportsDir, "results.html");

  console.log(`Running Cucumber from ${featuresDir}`);
  console.log(`HTML report: ${htmlReport}`);

  const result = spawnSync(
    process.execPath,
    [resolveCucumberCli(), "--config", configFile, ...cucumberArgs],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false,
    },
  );
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
  const destDir = existsSync(resolve(process.cwd(), "src"))
    ? resolve(process.cwd(), "src")
    : process.cwd();
  const dest = resolve(destDir, "instrumentation-client.ts");
  if (existsSync(dest)) {
    console.error(`${dest} already exists`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Wrote ${dest}`);
}

function requireEnv() {
  const envFile = resolve(process.cwd(), ".env.local");
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
      `Missing ${missing.join(" and ")} in ${resolve(process.cwd(), ".env.local")}`,
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
  runCucumber(rest);
} else {
  usage();
}
