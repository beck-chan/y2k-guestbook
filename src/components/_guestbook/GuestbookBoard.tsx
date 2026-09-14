"use client";

import { CommentBubbles } from "#/components/_guestbook/CommentBubbles";
import type { GuestbookComment } from "#/lib/comments";
import {
  guestbookDisplayTitle,
  guestbookPageSize,
  useGuestbookDocumentTitle,
  useGuestbookSettings,
} from "#/lib/guestbookSettings";

type GuestbookBoardProps = {
  initialComments: GuestbookComment[];
  initialPage: number;
  initialTotalPages: number;
};

export function GuestbookBoard({
  initialComments,
  initialPage,
  initialTotalPages,
}: GuestbookBoardProps) {
  const [settings] = useGuestbookSettings();
  const title = guestbookDisplayTitle(settings.title);
  useGuestbookDocumentTitle(title);

  return (
    <div className="guestbook-themed">
      <title>{title}</title>
      <h1 className={`guestbook-title${settings.marquee ? "" : " is-static"}`}>
        {settings.marquee ? (
          <span className="guestbook-marquee">{title}</span>
        ) : (
          title
        )}
      </h1>
      <CommentBubbles
        limit={guestbookPageSize(settings.pageSize)}
        initialComments={initialComments}
        initialPage={initialPage}
        initialTotalPages={initialTotalPages}
      />
    </div>
  );
}
