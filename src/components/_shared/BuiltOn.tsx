const Y2K_GUESTBOOK_REPO = "https://github.com/beck-chan/y2k-guestbook";

export function BuiltOn() {
  return (
    <div className="built-on">
      built on{" "}
      <a href={Y2K_GUESTBOOK_REPO} target="_blank" rel="noopener noreferrer">
        y2k-guestbook
      </a>
    </div>
  );
}
