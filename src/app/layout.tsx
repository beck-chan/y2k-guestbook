import type { Metadata } from "next";
import { GuestbookProviders } from "#/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "y2k guestbook",
  description: "Sign the guestbook.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <GuestbookProviders>{children}</GuestbookProviders>
      </body>
    </html>
  );
}
