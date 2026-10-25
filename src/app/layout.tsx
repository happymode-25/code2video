import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "code2video",
  description: "Write a script, get a narrated video with captions.",
  manifest: "/manifest.webmanifest",
  themeColor: "#0A0E27",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "code2video",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
