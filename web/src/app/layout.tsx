import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./globals.css";

const siteUrl = "https://miracle-vienna.tech";
const title = "miRacle: Explainable microRNA Precursor Prediction";
const description =
  "Find pre-miRNA-like hairpins in human DNA or RNA. miRacle folds sequences with ViennaRNA, ranks candidates, and shows the evidence, all in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | miRacle",
  },
  description,
  applicationName: "miRacle",
  authors: [
    { name: "Hayat", url: "https://github.com/o-hayat" },
    { name: "Helena", url: "https://github.com/halinamai" },
    { name: "Julian", url: "https://github.com/julian-at" },
  ],
  creator: "miRacle",
  category: "science",
  keywords: [
    "microRNA",
    "pre-miRNA prediction",
    "hairpin",
    "RNA secondary structure",
    "ViennaRNA",
    "RNAfold",
    "hg38",
    "bioinformatics",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "miRacle",
    locale: "en_US",
    url: "/",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#workspace" tabIndex={0}>
          Skip to sequence analysis
        </a>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
