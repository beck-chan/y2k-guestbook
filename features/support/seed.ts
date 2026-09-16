import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import {
  DEFAULT_GUESTBOOK_SETTINGS,
  guestbookPageSize,
  guestbookSettingsToRow,
} from "../../src/lib/guestbookSettingsShared";

export type SeedComment = {
  display_name?: string;
  body: string;
  email?: string | null;
  created_at?: string;
  is_read?: boolean;
};

let cached: SupabaseClient | null = null;

export function serviceClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export async function seedComment(input: SeedComment) {
  const display_name = input.display_name ?? `cucumber-seed-${Date.now()}`;
  const pool = guestbookDb();
  try {
    const { rows } = await pool.query<{
      id: string;
      display_name: string;
      body: string;
    }>(
      `insert into comments (display_name, body, email, created_at, is_read)
       values (
         $1,
         $2,
         $3,
         coalesce($4::timestamptz, now()),
         coalesce($5::boolean, false)
       )
       returning id, display_name, body`,
      [
        display_name,
        input.body,
        input.email ?? null,
        input.created_at ?? null,
        input.is_read ?? null,
      ],
    );
    const data = rows[0];
    if (!data) {
      throw new Error("Failed to seed comment: no row returned");
    }
    return {
      id: String(data.id),
      name: String(data.display_name),
      body: String(data.body),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to seed comment: ${message}`);
  } finally {
    await pool.end();
  }
}

function guestbookDb() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return new Pool({
    connectionString,
    max: 1,
    ssl: /localhost|127\.0\.0\.1/i.test(connectionString)
      ? undefined
      : { rejectUnauthorized: false },
  });
}

/** Public board page size from guestbook settings (4–10, default 10). */
export async function publicPageSize() {
  const pool = guestbookDb();
  try {
    const { rows } = await pool.query<{ page_size: string | number | null }>(
      "select page_size from guestbook_settings where id = 1",
    );
    return guestbookPageSize(String(rows[0]?.page_size ?? "10"));
  } finally {
    await pool.end();
  }
}

/** Insert only the extra rows needed so `count >= min` (page size + 1). */
export async function ensureCommentsForPagination(min: number) {
  const pool = guestbookDb();
  try {
    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from comments",
    );
    const have = rows[0]?.n ?? 0;
    const need = Math.max(0, min - have);
    if (need === 0) return have;
    const stamp = Date.now();
    const names = Array.from(
      { length: need },
      (_, i) => `cucumber-page-${stamp}-${i}`,
    );
    const bodies = Array.from(
      { length: need },
      (_, i) => `pagination seed ${stamp}-${i}`,
    );
    await pool.query(
      `insert into comments (display_name, body)
       select unnest($1::text[]), unnest($2::text[])`,
      [names, bodies],
    );
    return have + need;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to seed pagination comments: ${message}`);
  } finally {
    await pool.end();
  }
}

export async function resetGuestRateLimits() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return;
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: /localhost|127\.0\.0\.1/i.test(connectionString)
      ? undefined
      : { rejectUnauthorized: false },
  });
  try {
    await pool.query("delete from guestbook_rate_limits");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/does not exist|relation/i.test(message)) {
      throw new Error(`Failed to reset guest rate limits: ${message}`);
    }
  } finally {
    await pool.end();
  }
}

export async function restoreDefaultSettings() {
  const row = guestbookSettingsToRow(DEFAULT_GUESTBOOK_SETTINGS);
  const pool = guestbookDb();
  try {
    const result = await pool.query(
      `update guestbook_settings
       set title = $1,
           placeholder = $2,
           marquee = $3,
           capture_email = $4,
           main_font = $5,
           main_font_size = $6,
           accent_font = $7,
           accent_font_size = $8,
           page_size = $9,
           comment_length = $10,
           rate_limit_count = $11,
           rate_limit_minutes = $12,
           rate_limit_daily = $13,
           profanity_allow_list = $14,
           custom_theme = $15
       where id = 1`,
      [
        row.title,
        row.placeholder,
        row.marquee,
        row.capture_email,
        row.main_font,
        row.main_font_size,
        row.accent_font,
        row.accent_font_size,
        row.page_size,
        row.comment_length,
        row.rate_limit_count,
        row.rate_limit_minutes,
        row.rate_limit_daily,
        row.profanity_allow_list,
        row.custom_theme,
      ],
    );
    if (!result.rowCount) {
      throw new Error("no guestbook_settings row with id = 1");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to restore default settings: ${message}`);
  } finally {
    await pool.end();
  }
}
