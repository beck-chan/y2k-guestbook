# y2k-guestbook agent notes

This app has no `/docs` site. Next still bundles *framework* docs at `node_modules/next/dist/docs/`. Do not glob that tree. If a Next 16 API is unfamiliar, Read **one** file there.

Never glob `node_modules` or `.next`. Scope searches to `src/app`, `src/components`, `src/lib`, `scripts`.

Do not start `next dev` if port 3000 is already taken. Stop a leftover server with `npm run dev:stop` (or Ctrl+C in that terminal). Closing a browser preview does **not** stop the process.

For browser checks, wait for `domcontentloaded` or a selector — not `networkidle0`. This app keeps POSTing comments, so network idle often never arrives.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
