import { Suspense, type ReactNode } from "react";
import { AdminAuthErrorOverlay } from "#/components/_shared/AdminAuthErrorOverlay";

export function GuestbookProviders({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <AdminAuthErrorOverlay />
      </Suspense>
    </>
  );
}
