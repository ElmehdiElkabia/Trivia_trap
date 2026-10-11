"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Gamepad2,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Medal,
  Settings,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/game/players/player-avatar";
import { apiFetch, apiMediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UserData } from "@/types/userData";
import { logoutSession } from "@/lib/session-actions";

const navigation = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  { label: "Play / Create Room", icon: Gamepad2, href: "/create-room" },
  { label: "Profile", icon: UserRound, href: "/profile" },
  { label: "Friends", icon: Users, href: "/friends" },
  { label: "Game History", icon: History, href: "/history" },
  { label: "Achievements", icon: Medal, href: "/achievements" },
  { label: "Notifications", icon: Bell, href: "/notifications" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function DashboardBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-2.5 font-black tracking-wide text-primary"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Zap className="size-5 fill-current" aria-hidden="true" />
      </div>
      {!compact && <span>TRIVIA TRAP</span>}
    </Link>
  );
}

export function DashboardSidebar({
  onNavigate,
  className,
  user,
}: {
  onNavigate?: () => void;
  className?: string;
  user?: UserData;
}) {
  const pathname = usePathname();
  const [fetchedUser, setFetchedUser] = useState<Pick<UserData, "username" | "avatar"> | null>(null);
  const [loadingFallbackUser, setLoadingFallbackUser] = useState(!user);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    if (user) return;

    const controller = new AbortController();
    async function loadSidebarUser() {
      try {
        const response = await apiFetch("/users/me", { signal: controller.signal });
        if (response.status === 401) {
          window.location.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!response.ok) throw new Error("Could not load user");
        const profile = await response.json() as { username: string; avatar: string | null };
        setFetchedUser({
          username: profile.username,
          avatar: apiMediaUrl(profile.avatar) ?? null,
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFetchedUser(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingFallbackUser(false);
      }
    }

    void loadSidebarUser();
    return () => controller.abort();
  }, [pathname, user]);

  const sidebarUser = user
    ? { username: user.username, avatar: user.avatar }
    : fetchedUser;
  const loadingUser = !user && loadingFallbackUser;

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");

    try {
      await logoutSession();
      window.location.replace("/login");
    } catch {
      setLogoutError("Could not log out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <aside className={cn("flex h-full flex-col bg-[#151519]", className)}>
      <div className="flex h-20 items-center border-b border-white/[0.07] px-6">
        <DashboardBrand />
      </div>

      <nav
        aria-label="Dashboard navigation"
        className="flex-1 space-y-1.5 px-3 py-6"
      >
        {navigation.map((item) => {
          const active = item.href === pathname;
          const content = (
            <>
              <item.icon className="size-[18px]" aria-hidden="true" />
              <span>{item.label}</span>
              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              )}
            </>
          );
          const styles = cn(
            "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-bold tracking-[0.02em] transition-colors",
            active
              ? "bg-primary/12 text-primary"
              : "text-[#8f8f99] hover:bg-white/[0.045] hover:text-white",
          );

          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={styles}
              aria-current={active ? "page" : undefined}
            >
              {content}
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={onNavigate}
              className={styles}
            >
              {content}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.035] p-3">
          <span className="relative">
            <PlayerAvatar
              name={sidebarUser?.username ?? "Loading user"}
              src={sidebarUser?.avatar ?? undefined}
              size={40}
              animated={!loadingUser}
            />
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-trap-success ring-2 ring-[#202026]" aria-label="Online" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-extrabold text-white", loadingUser && "animate-pulse text-[#777782]")}>{loadingUser ? "Loading…" : sidebarUser?.username ?? "Account unavailable"}</p>
            {!loadingUser && sidebarUser ? (
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-trap-success">
                <span className="size-1.5 rounded-full bg-current" /> Online
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Log out"
            onClick={logout}
            disabled={loggingOut}
            className="text-[#8f8f99] hover:bg-trap-danger/10 hover:text-trap-danger"
          >
            {loggingOut ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
          </Button>
        </div>
        {logoutError && <p role="alert" className="px-3 pt-2 text-xs text-trap-danger">{logoutError}</p>}
        <Link href="/privacy" onClick={onNavigate} className="mt-3 block px-3 text-[11px] font-semibold text-[#8f8f99] transition-colors hover:text-white">Privacy Policy</Link>
      </div>
    </aside>
  );
}
