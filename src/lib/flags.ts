function envFlag(name: string, fallback: boolean) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

function envString(name: string, fallback: string) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.trim();
}

export const flags = {
  hitCounter: envFlag("FLAG_COUNTER", true),
  /** Comma-separated paths/URLs for unique-visitor query (empty = all $pageview events). */
  hitCounterUrl: envString("FLAG_COUNTER_URL", ""),
  /** UTC instant YYYY-MM-DDTHH:mm:ssZ for unique-visitor query (empty = all time). */
  hitCounterDate: envString("FLAG_COUNTER_DATE", "")
};
