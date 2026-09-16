import {
  guestbookAdminExamplePath,
  guestbookAdminPath,
} from "./guestbookPaths";

type Rewrite = { source: string; destination: string };

type RewriteResult =
  | Rewrite[]
  | {
      beforeFiles?: Rewrite[];
      afterFiles?: Rewrite[];
      fallback?: Rewrite[];
    };

type GuestbookHostConfig = {
  transpilePackages?: string[];
  serverExternalPackages?: string[];
  rewrites?: RewriteResult | (() => RewriteResult | Promise<RewriteResult>);
};

function guestbookRewrites(): Rewrite[] {
  return [
    {
      source: `${guestbookAdminPath()}/example.css`,
      destination: guestbookAdminExamplePath(),
    },
  ];
}

export function withGuestbookConfig<T extends GuestbookHostConfig>(
  config: T = {} as T,
) {
  const extra = guestbookRewrites();

  return {
    ...config,
    transpilePackages: [
      ...new Set([...(config.transpilePackages ?? []), "y2k-guestbook"]),
    ],
    serverExternalPackages: [
      ...new Set([...(config.serverExternalPackages ?? []), "pg"]),
    ],
    async rewrites() {
      const existing = config.rewrites;
      if (!existing) return extra;
      const resolved =
        typeof existing === "function" ? await existing() : existing;
      if (Array.isArray(resolved)) return [...resolved, ...extra];
      return {
        beforeFiles: resolved.beforeFiles,
        afterFiles: [...(resolved.afterFiles ?? []), ...extra],
        fallback: resolved.fallback,
      };
    },
  };
}
