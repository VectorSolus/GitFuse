import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppAuroraBackground } from "@/components/effects/AppAuroraBackground";

export const metadata: Metadata = {
  title: "GitFuse — Your commits, everywhere",
  description:
    "Sync local git commits across devices without pushing WIP work to GitHub.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppAuroraBackground />

        <div className="gf-app-content-layer">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}