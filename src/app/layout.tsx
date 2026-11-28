import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import Sidebar, { SidebarView } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ThemeScript } from "@/components/ThemeToggle";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "D-Notes",
  description: "Track DSA problems, notes and daily progress",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark antialiased", inter.variable, mono.variable)} data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-bg font-sans text-ink">
        <ThemeScript />
        <TooltipProvider delayDuration={300}>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Suspense fallback={<SidebarView path="" />}>
              <Sidebar />
            </Suspense>
            <main className="min-w-0 flex-1 px-5 py-6 md:px-10 md:py-8">
              <div className="mx-auto w-full">{children}</div>
            </main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
