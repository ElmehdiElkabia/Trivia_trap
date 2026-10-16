"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, Clock3, LoaderCircle, Search, Send, UserMinus,
  UserPlus, Users, X,
} from "lucide-react";
import { PlayerAvatar } from "@/components/game/players/player-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { apiFetch, apiMediaUrl } from "@/lib/api";

type Friend = { id: string; username: string; avatar_url: string | null; is_online?: boolean };
type FriendshipAction = "request" | "accept" | "reject" | "cancel" | "remove";

const actionRoutes: Record<FriendshipAction, (id: string) => string> = {
  request: (id) => `/friends/request/${id}`,
  accept: (id) => `/friends/accept/${id}`,
  reject: (id) => `/friends/reject/${id}`,
  cancel: (id) => `/friends/request/${id}`,
  remove: (id) => `/friends/${id}`,
};

const actionSuccess: Record<FriendshipAction, string> = {
  request: "Friend request sent.",
  accept: "Friend request accepted.",
  reject: "Friend request declined.",
  cancel: "Friend request canceled.",
  remove: "Friend removed.",
};

async function responseError(response: Response): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
    return data.detail;
  }
  return "Something went wrong. Please try again.";
}

function PlayerIdentity({ player, detail }: { player: Friend; detail?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative shrink-0">
        <PlayerAvatar name={player.username} src={apiMediaUrl(player.avatar_url)} size={40} animated />
        {player.is_online !== undefined ? (
          <span className={`absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-trap-surface ${player.is_online ? "bg-trap-success" : "bg-[#62626b]"}`} aria-label={player.is_online ? "Online" : "Offline"} />
        ) : null}
      </span>
      <div className="min-w-0">
        <Link href={`/users/${encodeURIComponent(player.username)}`} className="block truncate text-sm font-extrabold text-white hover:text-primary">
          {player.username}
        </Link>
        <p className={`mt-0.5 truncate text-[11px] ${player.is_online ? "text-trap-success" : "text-[#85858f]"}`}>{detail ?? (player.is_online === undefined ? `@${player.username}` : player.is_online ? "Online" : "Offline")}</p>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 font-secondary text-lg uppercase text-white">{title}</h2>
      </div>
      {count !== undefined && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-xs font-black text-[#c8c8d0]">{count}</span>}
    </CardHeader>
  );
}

export function FriendsView() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Friend[]>([]);
  const [sent, setSent] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [matches, setMatches] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      const responses = await Promise.all([
        apiFetch("/friends"),
        apiFetch("/friends/requests"),
        apiFetch("/friends/requests/sent"),
      ]);
      if (responses.some((response) => response.status === 401)) {
        setUnauthorized(true);
        return;
      }
      const failed = responses.find((response) => !response.ok);
      if (failed) throw new Error(await responseError(failed));
      const [friendList, incomingList, sentList] = await Promise.all(responses.map((response) => response.json())) as [Friend[], Friend[], Friend[]];
      setFriends(friendList);
      setIncoming(incomingList);
      setSent(sentList);
      setLoadError("");
      setUnauthorized(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load friends. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const prefix = username.trim();
    if (!prefix) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/friends/search?prefix=${encodeURIComponent(prefix)}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setUnauthorized(true);
          return;
        }
        if (!response.ok) throw new Error(await responseError(response));
        const players = await response.json() as Friend[];
        if (controller.signal.aborted) return;
        setMatches(players);
        setSearchMessage(players.length ? "" : "No players found with that username prefix.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMatches([]);
        setSearchMessage(error instanceof Error ? error.message : "Could not search for players.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [username]);

  async function runAction(action: FriendshipAction, player: Friend) {
    if (busyId) return;
    if (action === "remove" && !window.confirm(`Remove ${player.username} from your friends?`)) return;
    setBusyId(player.id);
    setActionError("");
    setNotice("");
    try {
      const response = await apiFetch(actionRoutes[action](player.id), {
        method: action === "cancel" || action === "remove" ? "DELETE" : "POST",
      });
      if (response.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(actionSuccess[action]);
      await loadData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update friendship. Please try again.");
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState title="Loading your friends" description="Finding your crew and requests…" className="mt-8" />;
  if (unauthorized) {
    return (
      <ErrorState
        title="Sign in to see your friends"
        description="Your friends and requests are saved to your account."
        actionLabel="Sign in"
        onAction={() => { router.push("/login?next=/friends"); }}
        className="mt-8"
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">The social side of the game</p>
          <h1 className="mt-2 font-secondary text-2xl uppercase tracking-[-0.025em] text-white sm:text-3xl lg:text-[2.15rem]">Friends & rivals</h1>
          <p className="mt-2 text-sm text-[#a6a6ae]">Find your crew, answer requests, and get ready for the next bluff.</p>
        </div>
        <Button asChild variant="outline" className="h-11 self-start px-4 text-xs">
          <Link href="/dashboard">Back to dashboard <ArrowRight className="size-4" /></Link>
        </Button>
      </header>

      <section aria-label="Friendship overview" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Your friends", value: friends.length, Icon: Users, tone: "text-primary bg-primary/10" },
          { label: "Waiting for you", value: incoming.length, Icon: UserPlus, tone: "text-[#9295ff] bg-secondary/15" },
          { label: "Requests sent", value: sent.length, Icon: Send, tone: "text-accent bg-accent/10" },
        ].map(({ label, value, Icon, tone }) => (
          <Card key={label} className="rounded-2xl border border-white/[0.07] bg-trap-surface py-0 shadow-[0_14px_34px_rgba(0,0,0,0.14)]">
            <CardContent className="flex items-center justify-between p-4 sm:p-5">
              <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#85858f]">{label}</p><p className="mt-2 font-secondary text-2xl text-white">{value}</p></div>
              <span className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon className="size-4" aria-hidden="true" /></span>
            </CardContent>
          </Card>
        ))}
      </section>

      {loadError && <ErrorState title="Could not refresh friends" description={loadError} actionLabel="Try again" onAction={() => { void loadData(); }} />}
      {(actionError || notice) && (
        <p role={actionError ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${actionError ? "border-destructive/30 bg-destructive/10 text-[#ff9aaa]" : "border-trap-success/25 bg-trap-success/10 text-trap-success"}`}>
          {actionError || notice}
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <Card className="rounded-[20px] border border-white/[0.07] bg-trap-surface py-0 shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
            <SectionHeading eyebrow="Find a teammate" title="Add a friend" />
            <CardContent className="p-5 sm:p-6">
              <p className="mb-4 text-xs leading-5 text-[#a6a6ae]">Type the start of a username to see up to 10 matching players.</p>
              <label htmlFor="friend-username" className="sr-only">Player username</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#85858f]" aria-hidden="true" />
                <Input id="friend-username" value={username} onChange={(event) => {
                  const value = event.target.value;
                  setUsername(value);
                  setMatches([]);
                  setSearching(Boolean(value.trim()));
                  setSearchMessage("");
                }} placeholder="Start typing a username" autoComplete="off" maxLength={15} className="h-11 pl-10 pr-10" />
                {searching && <LoaderCircle className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-[#85858f]" aria-label="Searching" />}
              </div>
              {searchMessage && <p role="status" className="mt-3 text-xs text-[#fca5a5]">{searchMessage}</p>}
              {matches.length > 0 && (
                <ul className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035]">
                  {matches.map((player) => {
                    const isFriend = friends.some((friend) => friend.id === player.id);
                    const hasIncoming = incoming.some((request) => request.id === player.id);
                    const hasSent = sent.some((request) => request.id === player.id);
                    return (
                      <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                        <PlayerIdentity player={player} />
                        {isFriend ? <span className="text-xs font-bold text-trap-success">Already friends</span>
                          : hasIncoming ? <span className="text-xs text-[#a6a6ae]">They sent you a request below</span>
                          : hasSent ? <span className="text-xs text-[#a6a6ae]">Request pending</span>
                          : <Button type="button" size="sm" disabled={busyId !== null} onClick={() => { void runAction("request", player); }}><UserPlus className="size-4" /> Add friend</Button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[20px] border border-white/[0.07] bg-trap-surface py-0 shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
            <SectionHeading eyebrow="Your crew" title="All friends" count={friends.length} />
            <CardContent className="px-0 pb-1">
              {friends.length === 0 ? <EmptyState icon={Users} title="No friends yet" description="Find a player by username and start building your crew." className="py-10" /> : (
                <ul className="divide-y divide-white/[0.055]">
                  {friends.map((friend) => (
                    <li key={friend.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-white/[0.025] sm:px-6">
                      <PlayerIdentity player={friend} />
                      <Button type="button" variant="ghost" size="sm" disabled={busyId !== null} onClick={() => { void runAction("remove", friend); }} className="text-[#a6a6ae] hover:text-destructive"><UserMinus className="size-4" /> Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[20px] border border-white/[0.07] bg-trap-surface py-0 shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
            <SectionHeading eyebrow="Needs your answer" title="Friend requests" count={incoming.length} />
            <CardContent className="px-0 pb-1">
              {incoming.length === 0 ? <EmptyState icon={UserPlus} title="You’re all caught up" description="New friend requests will show up here." className="py-9" /> : (
                <ul className="divide-y divide-white/[0.055]">
                  {incoming.map((player) => (
                    <li key={player.id} className="space-y-3 px-5 py-4 sm:px-6">
                      <PlayerIdentity player={player} detail="Wants to be friends" />
                      <div className="flex gap-2 pl-[54px]">
                        <Button type="button" size="sm" disabled={busyId !== null} onClick={() => { void runAction("accept", player); }}><Check className="size-4" /> Accept</Button>
                        <Button type="button" variant="surface" size="sm" disabled={busyId !== null} onClick={() => { void runAction("reject", player); }}><X className="size-4" /> Decline</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[20px] border border-white/[0.07] bg-trap-surface py-0 shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
            <SectionHeading eyebrow="Still waiting" title="Sent requests" count={sent.length} />
            <CardContent className="px-0 pb-1">
              {sent.length === 0 ? <EmptyState icon={Clock3} title="Nothing pending" description="Requests you send will appear here until answered." className="py-9" /> : (
                <ul className="divide-y divide-white/[0.055]">
                  {sent.map((player) => (
                    <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <PlayerIdentity player={player} detail="Waiting for a reply" />
                      <Button type="button" variant="ghost" size="sm" disabled={busyId !== null} onClick={() => { void runAction("cancel", player); }} className="text-[#a6a6ae]"><X className="size-4" /> Cancel</Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
