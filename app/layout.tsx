import type { Metadata } from "next";
import "./globals.css";
import "./retained-visuals.css";
import "./interaction-polish.css";
import "./visual-refinement.css";
import "./all-page-polish.css";
import "./x-updates.css";
import "./content-motion.css";
import "./workflow-motion.css";
import "./typography.css";
import "./atelier.css";
import "./console-theme.css";
import { PlatformProvider } from "@/components/platform-provider";
import { AtelierEffects } from "@/components/atelier-effects";
import { AgentTools } from "@/components/agent-tools";
import { LanguageProvider } from "@/components/language-provider";
import { SiteMotion } from "@/components/site-motion";
import { IntroSplash } from "@/components/intro-splash";
import { SmoothScroll } from "@/components/smooth-scroll";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.rovyncore.com"),
  title: {
    default: "ROVYN CORE — A World in the Making",
    template: "%s | ROVYN CORE",
  },
  description:
    "A world in the making on Robinhood Chain: our first game is in development with RVYN at its core. The launchpad and public onchain records are live. Not affiliated with Robinhood Markets.",
  keywords: [
    "Robinhood Chain",
    "Robinhood Chain game",
    "web3 game",
    "RVYN",
    "Robinhood token",
    "onchain asset records",
    "Robinhood launchpad",
    "token launchpad",
    "fixed-supply token",
    "ROVYN CORE",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "ROVYN CORE",
    title: "ROVYN CORE — A World in the Making",
    description:
      "Our first game is in development on Robinhood Chain, with RVYN at its core. Launchpad and public onchain records are live.",
    url: "https://www.rovyncore.com",
    images: [{ url: "/og-rovyncore.jpg", width: 1200, height: 630, alt: "ROVYN CORE — A world in the making. RVYN at its core." }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@RovynCORE",
    title: "ROVYN CORE — A World in the Making",
    description:
      "Our first game is in development on Robinhood Chain, with RVYN at its core.",
    images: ["/og-rovyncore.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{ __html: "(function(){try{var d=document.documentElement;if(location.pathname==='/'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!sessionStorage.getItem('rc-intro')){d.classList.add('intro-on');setTimeout(function(){d.classList.remove('intro-on')},6000)}}catch(e){}})();" }}
        />
        <IntroSplash />
        <SmoothScroll />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "ROVYN CORE",
            url: "https://www.rovyncore.com",
            logo: "https://www.rovyncore.com/rovyncore-logo.png",
            sameAs: ["https://x.com/RovynCORE"],
          }) }}
        />
        <LanguageProvider>
          <PlatformProvider>
            <AgentTools />
            <SiteMotion />
            <AtelierEffects />
            {children}
          </PlatformProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
