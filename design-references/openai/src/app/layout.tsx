import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OpenAI research references · miRacle design study",
  description: "Local reference recreations retained for miRacle design review.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Keep the inspected CSSOM intact: this stylesheet is a source-design artifact.
  // eslint-disable-next-line @next/next/no-css-tags
  return <html lang="en" className="light"><head><link rel="stylesheet" href="/sites/openai-com-2387c885/shared/reference.css" /></head><body className="text-p1 text-primary-100 bg-background">{children}</body></html>;
}
