export function guestbookHomePath() {
  const raw = process.env.NEXT_PUBLIC_GUESTBOOK_PATH?.trim();
  if (!raw) return "/";
  return raw.replace(/\/$/, "") || "/";
}

export function guestbookAdminPath() {
  const raw = process.env.NEXT_PUBLIC_GUESTBOOK_ADMIN_PATH?.trim();
  if (!raw) return "/admin";
  return raw.replace(/\/$/, "") || "/admin";
}

export function guestbookAdminLoginPath() {
  return `${guestbookAdminPath()}/login`;
}

export function guestbookAdminExamplePath() {
  return `${guestbookAdminPath()}/example`;
}

export function guestbookHomeErrorPath() {
  const home = guestbookHomePath();
  return home === "/" ? "/?admin_error=1" : `${home}?admin_error=1`;
}
