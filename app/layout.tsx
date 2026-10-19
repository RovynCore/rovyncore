import type { Metadata } from "next";
import { cookies } from "next/headers";
import { localeNames, type Locale } from "@/lib/translations";
import "./rv.css";
import { PlatformProvider } from "@/components/platform-provider";
import { AgentTools } from "@/components/agent-tools";
import { LanguageProvider } from "@/components/language-provider";
import { IntroSplash } from "@/components/intro-splash";
import { RevealObserver } from "@/components/rv/ui";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // the language the visitor chose last (a cookie the language picker writes), so the server renders the page in it
  // and there is no flash of English before the saved language loads; crawlers without the cookie get English
  const saved = (await cookies()).get("rovyncore-lang")?.value;
  const initial: Locale = saved && Object.hasOwn(localeNames, saved) ? (saved as Locale) : "en";
  return (
    <html lang={initial} className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{ __html: "(function(){try{var d=document.documentElement;if(location.pathname==='/'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!localStorage.getItem('rv-intro')){d.classList.add('intro-on');setTimeout(function(){d.classList.remove('intro-on')},4500)}}catch(e){}})();" }}
        />
        <IntroSplash />
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
        <LanguageProvider initial={initial}>
          <PlatformProvider>
            <AgentTools />
            <RevealObserver />
            {children}
          </PlatformProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
