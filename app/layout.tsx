import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://byucalendar.com";
const title = "BYU Calendar — Find your next Event at BYU";
const description = "All BYU campus events in one searchable calendar. Find free food, club meetings, career fairs, workshops, and devotionals across BYU, Marriott School, club, and Handshake listings — with smart search, filters, and .ics export.";
const ogImage = { url: "/og-image.png", width: 1200, height: 630, alt: "BYU Calendar — BYU campus events in one searchable place" };

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s · BYU Calendar" },
  description,
  applicationName: "BYU Calendar",
  keywords: ["BYU events", "BYU calendar", "Brigham Young University events", "BYU free food", "BYU clubs", "BYU career fairs", "BYU workshops", "Marriott School events", "BYU student activities", "Provo college events", "BYU devotional"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "BYU Calendar",
    title,
    description,
    locale: "en_US",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  category: "education",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": siteUrl + "/#organization",
      name: "BYU Calendar",
      url: siteUrl + "/",
      logo: { "@type": "ImageObject", url: siteUrl + "/icon-512.png", width: 512, height: 512 },
      description: "Independent student project that collects publicly published BYU campus events into one searchable calendar. Not an official BYU service.",
    },
    {
      "@type": "WebSite",
      "@id": siteUrl + "/#website",
      url: siteUrl + "/",
      name: "BYU Calendar",
      description,
      publisher: { "@id": siteUrl + "/#organization" },
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: siteUrl + "/?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><meta name="theme-color" content="#ffffff"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="BYU Calendar"/><meta name="apple-mobile-web-app-status-bar-style" content="default"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet"/></head><body>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/><script dangerouslySetInnerHTML={{__html:"if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}"}}/></body></html>;}
