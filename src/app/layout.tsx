import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPAR GKJW — Aplikasi Internal",
  description:
    "Aplikasi internal untuk kegiatan dan pelayanan KPAR GKJW.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
