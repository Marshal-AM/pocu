"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PocuLogo } from "@/components/PocuLogo";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Agent", href: "/" },
  { label: "Jobs", href: "/jobs" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAgentHome = pathname === "/";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <AppHeader pathname={pathname} />
      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col px-[var(--page-gutter)] pb-4 pt-2",
          isAgentHome ? "overflow-hidden" : "overflow-y-auto pt-1"
        )}
      >
        <div
          className={cn(
            "mx-auto w-full max-w-[var(--page-max)] flex-1",
            isAgentHome && "flex h-full min-h-0 flex-col"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function AppHeader({ pathname }: { pathname: string }) {
  return (
    <header className="z-50 flex-shrink-0 pt-4 md:pt-5">
      <div className="mx-auto flex h-14 w-full max-w-[var(--page-max)] items-center justify-between px-[var(--page-gutter)]">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <PocuLogo size={36} priority />
            <span className="text-base font-semibold tracking-tight">POCU</span>
          </Link>

          <nav className="flex items-center gap-1 rounded-full border border-border/50 bg-surface/80 p-1 backdrop-blur-sm">
            {NAV_ITEMS.map(({ label, href }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <ConnectWalletButton />
      </div>
    </header>
  );
}
