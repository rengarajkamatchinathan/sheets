import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "highlight.js/styles/github-dark.css";
import "./globals.css";
import { Suspense } from "react";
import Sidebar, { SidebarView } from "@/components/Sidebar";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DSA Log",
  description: "Track DSA problems, notes and daily progress",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen bg-bg font-sans text-ink">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Suspense fallback={<SidebarView path="" />}>
            <Sidebar />
          </Suspense>
          <main className="min-w-0 flex-1 px-5 py-6 md:px-10 md:py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
