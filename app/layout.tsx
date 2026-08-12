import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gaming Oasis Production OS",
  description: "A focused broadcast operations workspace for Gaming Oasis production staff.",
  icons: { icon: "/gaming-oasis-favicon.png", shortcut: "/gaming-oasis-favicon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
