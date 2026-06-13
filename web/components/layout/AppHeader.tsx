"use client";

import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Chat";
  if (pathname === "/jobs") return "Training Jobs";
  if (pathname.startsWith("/jobs/")) return "Job Detail";
  return "POCU";
}

export function AppHeader() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <ConnectWalletButton />
    </header>
  );
}
