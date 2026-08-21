"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  Mail,
  UserRoundPen,
  SendHorizontal,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Matches", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: SendHorizontal },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/linkedin", label: "LinkedIn", icon: UserRoundPen },
  { href: "/digests", label: "Daily email", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <SendHorizontal className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Career Agent</div>
            <div className="text-[11px] text-muted-foreground">DS &amp; AI roles</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t px-5 py-4 text-[11px] leading-relaxed text-muted-foreground">
          Runs locally against your own SQLite file. Nothing is sent anywhere you have not configured.
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <SendHorizontal className="size-3.5" />
          </div>
          <span className="text-sm font-semibold">Career Agent</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b px-5 py-6 sm:px-8 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
