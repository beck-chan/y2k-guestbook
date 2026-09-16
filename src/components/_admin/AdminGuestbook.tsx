import Link from "next/link";
import { AdminCommentThread } from "./AdminCommentThread";
import { AdminFilters } from "./AdminFilters";
import { AdminPageFrame } from "./AdminPageFrame";
import { AdminSettings } from "./AdminSettings";
import {
  adminHref,
  type AdminFilters as FilterState,
  type GuestbookComment,
} from "../../lib/comments";
import { guestbookAdminPath, guestbookHomePath } from "../../lib/guestbookPaths";

type AdminGuestbookProps = {
  comments: GuestbookComment[];
  page: number;
  totalPages: number;
  filters: FilterState;
  totalComments?: number;
  unreadComments?: number;
  basePath?: string;
  homeHref?: string;
};

export function AdminGuestbook({
  comments,
  page,
  totalPages,
  filters,
  totalComments = 0,
  unreadComments = 0,
  basePath = guestbookAdminPath(),
  homeHref = guestbookHomePath(),
}: AdminGuestbookProps) {
  return (
    <AdminPageFrame className="admin-page guestbook-page">
      <nav className="admin-fixed-nav">
        <a className="guestbook-login" href={homeHref}>
          view guestbook
        </a>
      </nav>
      <div className="page-split">
        <section className="admin-main" aria-label="Comments">
          <div className="admin-shell">
            <AdminFilters
              filters={filters}
              basePath={basePath}
              totalComments={totalComments}
              unreadComments={unreadComments}
            />
            <AdminCommentThread
              key={comments.map((note) => note.id).join("|")}
              comments={comments}
            />
            <nav className="comment-pages" aria-label="Admin comment pages">
              {page > 1 ? (
                <Link
                  className="comment-page"
                  href={adminHref(page - 1, filters, basePath)}
                  scroll={false}
                >
                  prev
                </Link>
              ) : (
                <span className="comment-page is-disabled">prev</span>
              )}
              <span className="comment-page is-status" aria-current="page">
                <span className="comment-page-current">{page}</span>
                {" / "}
                {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  className="comment-page"
                  href={adminHref(page + 1, filters, basePath)}
                  scroll={false}
                >
                  next
                </Link>
              ) : (
                <span className="comment-page is-disabled">next</span>
              )}
            </nav>
          </div>
        </section>
        <aside className="page-side admin-settings" aria-label="Settings">
          <AdminSettings />
        </aside>
      </div>
    </AdminPageFrame>
  );
}
