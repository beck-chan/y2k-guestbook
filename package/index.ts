export {
  GuestbookPublicPage,
  guestbookPublicMetadata,
} from "../src/entries/public";
export {
  GuestbookAdminPage,
  guestbookAdminMetadata,
} from "../src/entries/admin";
export { GuestbookProviders } from "../src/providers";

/** Re-export from the host `page.tsx` so the packaged board is not statically baked. */
export const dynamic = "force-dynamic";
