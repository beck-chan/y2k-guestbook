#!/usr/bin/env node
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

function usage(exit = true) {
  console.error("Usage: npx y2k-guestbook allow-admin you@gmail.com");
  console.error("       npx y2k-guestbook delete-admin you@gmail.com");
  if (exit) process.exit(1);
}

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
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
} else {
  usage();
}
