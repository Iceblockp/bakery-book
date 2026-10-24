import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bakery Book",
  description: "Simple sales, baking, and stock records for a small bakery.",
  applicationName: "Bakery Book",
  appleWebApp: { capable: true, title: "Bakery Book", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f8f4ed", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
