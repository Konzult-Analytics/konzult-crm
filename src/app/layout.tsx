import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Konzult CRM",
  description: "Konzult's prospects, clients and relationships in one place.",
  appleWebApp: { capable: true, title: "Konzult CRM", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ff3210",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA" className={inter.variable}>
      <body className="min-h-screen px-4">{children}</body>
    </html>
  );
}
