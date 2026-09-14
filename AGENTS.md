# y2k-guestbook agent notes

This app has no `/docs` site. Next still bundles *framework* docs at `node_modules/next/dist/docs/`. Do not glob that tree. If a Next 16 API is unfamiliar, Read **one** file there.

Never glob `node_modules` or `.next`. Scope searches to `src/app`, `src/components`, `src/lib`, `scripts`.

Do not start `next dev` if port 3000 is already taken. Stop a leftover server with `npm run dev:stop` (or Ctrl+C in that terminal). Closing a browser preview does **not** stop the process.

For browser checks, wait for `domcontentloaded` or a selector — not `networkidle0`. This app keeps POSTing comments, so network idle often never arrives.

