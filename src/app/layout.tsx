import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Puzzle IQ — How Smart Are You?",
  description:
    "Test your Puzzle IQ with this addictive color-sorting brain game. Only 1% reach Genius level.",
  openGraph: {
    title: "Puzzle IQ — How Smart Are You?",
    description: "Only 1% reach Genius level. What's your Puzzle IQ?",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f0b2e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-[#0f0b2e] text-white overflow-x-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
