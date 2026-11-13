import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { LayoutWrapper } from "@/components/LayoutWrapper";

const ui = Schibsted_Grotesk({ subsets: ["latin"], weight: "variable", variable: "--font-ui" });

export const metadata: Metadata = {
  title: "BODHI Admin",
  description: "Operations console for BODHI payments, wallets, trips and clubs.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1512" },
  ],
};

// Applies a saved light/dark choice before first paint, so there is no flash.
const themeScript = `try{var t=localStorage.getItem('bodhi_admin_theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={ui.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans bg-paper text-ink antialiased">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
