import type { Metadata } from "next";
import { getPublicCommentsPage } from "../app/actions/comments";
import { GuestbookBoard } from "../components/_guestbook/GuestbookBoard";
import { HitCounter } from "../components/_guestbook/HitCounter";
import { BuiltOn } from "../components/_shared/BuiltOn";
import { GuestbookSettingsShell } from "../components/_shared/GuestbookSettingsShell";
import { PageReveal } from "../components/_shared/PageReveal";
import { flags } from "../lib/flags";
import { guestbookAdminLoginPath } from "../lib/guestbookPaths";
import { loadGuestbookSettings } from "../lib/loadGuestbookSettings";
import { getUniqueVisitors } from "../lib/uniqueVisitors";

export const guestbookPublicMetadata: Metadata = {
  title: "y2k guestbook",
  description: "Sign the guestbook.",
};

export function GuestbookPublicPage() {
  return (
    <PageReveal as="main" className="admin-page guestbook-page guestbook-public">
      <HomeBody />
    </PageReveal>
  );
}

async function HomeBody() {
  const [settings, hitCount, commentsPage] = await Promise.all([
    loadGuestbookSettings(),
    getUniqueVisitors(),
    getPublicCommentsPage(1),
  ]);

  return (
    <GuestbookSettingsShell settings={settings}>
      <a className="guestbook-login" href={guestbookAdminLoginPath()}>
        admin login
      </a>
      <BuiltOn />
      <HitCounter count={hitCount.count} error={hitCount.error} enabled={flags.hitCounter} />
      <div className="admin-shell">
        <GuestbookBoard
          initialComments={commentsPage.comments}
          initialPage={commentsPage.page}
          initialTotalPages={commentsPage.totalPages}
        />
      </div>
    </GuestbookSettingsShell>
  );
}
