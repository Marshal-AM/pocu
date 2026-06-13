import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "../components/WalletProvider";
import { WalletGate } from "../components/WalletGate";
import { AppShell } from "../components/layout/AppShell";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "POCU — On-Chain ML Training",
  description: "POCU — Hedera agent kit + Kaggle on-chain ML training",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jakarta.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <WalletProvider>
          <WalletGate>
            <AppShell>{children}</AppShell>
          </WalletGate>
        </WalletProvider>
      </body>
    </html>
  );
}
