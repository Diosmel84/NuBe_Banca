import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Juan Mecánico P2P",
  description: "Marketplace P2P USDT TRC20 / ARS con escrow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen">
        <Providers>
          <div className="hazard-stripe h-1.5 w-full" />
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
