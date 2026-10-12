import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-mono", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });

const description = "A weekly digest of what developers are struggling with in code review, CI/CD and workflow, from live Hacker News, Dev.to and Stack Overflow discussions.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Developer Community Pulse", template: "%s | Developer Community Pulse" },
  description,
  openGraph: { title: "Developer Community Pulse", description, type: "website" },
  twitter: { card: "summary_large_image", title: "Developer Community Pulse", description },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark" };

/** Runs before paint: applies the saved theme and marks that motion is allowed (so no flash, no flicker). */
const EARLY = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('pulse-theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('motion');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
