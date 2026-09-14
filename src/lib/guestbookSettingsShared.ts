import type { CSSProperties } from "react";

export type FontSize = "smaller" | "regular" | "larger";

export type GuestbookSettings = {
  title: string;
  placeholder: string;
  marquee: boolean;
  captureEmail: boolean;
  mainFont: string;
  mainFontSize: FontSize;
  accentFont: string;
  accentFontSize: FontSize;
  pageSize: string;
  commentLength: string;
  rateLimitCount: string;
  rateLimitMinutes: string;
  rateLimitDaily: string;
  profanityAllowList: string;
  customTheme: string;
};

export type GuestbookSettingsRow = {
  title: string | null;
  placeholder: string | null;
  marquee: boolean | null;
  capture_email: boolean | null;
  main_font: string | null;
  main_font_size: string | null;
  accent_font: string | null;
  accent_font_size: string | null;
  page_size: number | null;
  comment_length: number | null;
  rate_limit_count: number | null;
  rate_limit_minutes: number | null;
  rate_limit_daily: number | null;
  profanity_allow_list: string | null;
  custom_theme: string | null;
};

export const DEFAULT_COMMENT_PLACEHOLDER =
  `This is a demo mockup of the y2k guestbook. Yes, you can change the theme so it's not so eerily 90s.
There's no backend hooked up, so please don't try to submit anything.

([admin login] is accessible to show you what that interface looks like. filters and settings work.)`;

export const MAIN_FONTS = [
  { value: "times", label: "times new roman" },
  { value: "comic-sans", label: "comic sans" },
] as const;

export const ACCENT_FONTS = [
  { value: "comic-sans", label: "comic sans" },
  { value: "times", label: "times new roman" },
] as const;

export const DEFAULT_GUESTBOOK_SETTINGS: GuestbookSettings = {
  title: "",
  placeholder: DEFAULT_COMMENT_PLACEHOLDER,
  marquee: true,
  captureEmail: true,
  mainFont: "times",
  mainFontSize: "regular",
  accentFont: "comic-sans",
  accentFontSize: "regular",
  pageSize: "10",
  commentLength: "1000",
  rateLimitCount: "1",
  rateLimitMinutes: "5",
  rateLimitDaily: "2",
  profanityAllowList: "",
  customTheme: "",
};

const MAIN_FONT_VALUES = new Set<string>(MAIN_FONTS.map((font) => font.value));
const ACCENT_FONT_VALUES = new Set<string>(
  ACCENT_FONTS.map((font) => font.value),
);

const FONT_SIZES = new Set<FontSize>(["smaller", "regular", "larger"]);

function asFontSize(value: string | null | undefined, fallback: FontSize): FontSize {
  if (value && FONT_SIZES.has(value as FontSize)) {
    return value as FontSize;
  }
  return fallback;
}

export function normalizeGuestbookSettings(
  row: Partial<GuestbookSettingsRow> | null | undefined,
): GuestbookSettings {
  const next: GuestbookSettings = {
    ...DEFAULT_GUESTBOOK_SETTINGS,
    title: row?.title ?? DEFAULT_GUESTBOOK_SETTINGS.title,
    placeholder:
      row?.placeholder ?? DEFAULT_GUESTBOOK_SETTINGS.placeholder,
    marquee: row?.marquee ?? DEFAULT_GUESTBOOK_SETTINGS.marquee,
    captureEmail:
      row?.capture_email ?? DEFAULT_GUESTBOOK_SETTINGS.captureEmail,
    mainFont: row?.main_font ?? DEFAULT_GUESTBOOK_SETTINGS.mainFont,
    mainFontSize: asFontSize(
      row?.main_font_size,
      DEFAULT_GUESTBOOK_SETTINGS.mainFontSize,
    ),
    accentFont: row?.accent_font ?? DEFAULT_GUESTBOOK_SETTINGS.accentFont,
    accentFontSize: asFontSize(
      row?.accent_font_size,
      DEFAULT_GUESTBOOK_SETTINGS.accentFontSize,
    ),
    pageSize:
      row?.page_size != null
        ? String(row.page_size)
        : DEFAULT_GUESTBOOK_SETTINGS.pageSize,
    commentLength:
      row?.comment_length != null
        ? String(guestbookCommentLength(row.comment_length))
        : DEFAULT_GUESTBOOK_SETTINGS.commentLength,
    rateLimitCount:
      row?.rate_limit_count != null
        ? String(row.rate_limit_count)
        : DEFAULT_GUESTBOOK_SETTINGS.rateLimitCount,
    rateLimitMinutes:
      row?.rate_limit_minutes != null
        ? String(row.rate_limit_minutes)
        : DEFAULT_GUESTBOOK_SETTINGS.rateLimitMinutes,
    rateLimitDaily:
      row?.rate_limit_daily != null
        ? String(row.rate_limit_daily)
        : DEFAULT_GUESTBOOK_SETTINGS.rateLimitDaily,
    profanityAllowList:
      row?.profanity_allow_list ??
      DEFAULT_GUESTBOOK_SETTINGS.profanityAllowList,
    customTheme: row?.custom_theme ?? DEFAULT_GUESTBOOK_SETTINGS.customTheme,
  };

  if (!MAIN_FONT_VALUES.has(next.mainFont)) {
    next.mainFont = DEFAULT_GUESTBOOK_SETTINGS.mainFont;
  }
  if (!ACCENT_FONT_VALUES.has(next.accentFont)) {
    next.accentFont = DEFAULT_GUESTBOOK_SETTINGS.accentFont;
  }

  return next;
}

export function guestbookSettingsToRow(settings: GuestbookSettings) {
  return {
    title: settings.title,
    placeholder: settings.placeholder,
    marquee: settings.marquee,
    capture_email: settings.captureEmail,
    main_font: settings.mainFont,
    main_font_size: settings.mainFontSize,
    accent_font: settings.accentFont,
    accent_font_size: settings.accentFontSize,
    page_size: guestbookPageSize(settings.pageSize),
    comment_length: guestbookCommentLength(settings.commentLength),
    rate_limit_count: positiveInt(settings.rateLimitCount, 1),
    rate_limit_minutes: positiveInt(settings.rateLimitMinutes, 5),
    rate_limit_daily: positiveInt(settings.rateLimitDaily, 2),
    profanity_allow_list: settings.profanityAllowList,
    custom_theme: settings.customTheme,
  };
}

function positiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function guestbookRateLimits(settings: GuestbookSettings) {
  return {
    count: positiveInt(settings.rateLimitCount, 1),
    minutes: positiveInt(settings.rateLimitMinutes, 5),
    daily: positiveInt(settings.rateLimitDaily, 2),
  };
}

export function guestbookDisplayTitle(title: string) {
  const trimmed = title.trim();
  return trimmed || "y2k guestbook";
}

export function guestbookCommentPlaceholder(placeholder: string) {
  const trimmed = placeholder.trim();
  return trimmed || DEFAULT_COMMENT_PLACEHOLDER;
}

const FONT_STACKS: Record<string, string> = {
  times: '"Times New Roman", Times, serif',
  "comic-sans": '"Comic Sans MS", "Comic Sans", cursive',
};

const SIZE_SCALE: Record<FontSize, string> = {
  smaller: "0.88",
  regular: "1",
  larger: "1.18",
};

export function guestbookPageSize(pageSize: string) {
  const parsed = Number.parseInt(pageSize, 10);
  return Number.isFinite(parsed) && parsed >= 4 && parsed <= 10 ? parsed : 10;
}

export const DEFAULT_COMMENT_BODY_MAX_LENGTH = 1000;
export const COMMENT_BODY_MAX_LENGTH_MIN = 1;
export const COMMENT_BODY_MAX_LENGTH_MAX = 10000;

export function guestbookCommentLength(
  value: string | number | null | undefined,
) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_COMMENT_BODY_MAX_LENGTH;
  }
  return Math.min(
    COMMENT_BODY_MAX_LENGTH_MAX,
    Math.max(COMMENT_BODY_MAX_LENGTH_MIN, Math.floor(parsed)),
  );
}

export function guestbookThemeVars(settings: GuestbookSettings): CSSProperties {
  return {
    "--guestbook-main-font":
      FONT_STACKS[settings.mainFont] ?? FONT_STACKS.times,
    "--guestbook-accent-font":
      FONT_STACKS[settings.accentFont] ?? FONT_STACKS["comic-sans"],
    "--guestbook-main-scale": SIZE_SCALE[settings.mainFontSize] ?? "1",
    "--guestbook-accent-scale": SIZE_SCALE[settings.accentFontSize] ?? "1",
  } as CSSProperties;
}
