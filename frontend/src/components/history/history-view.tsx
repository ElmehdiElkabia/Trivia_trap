"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Gamepad2, Trophy, Users } from "lucide-react";
import { apiFetch, apiMediaUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PlayerAvatar } from "@/components/game/players/player-avatar";
import { cn } from "@/lib/utils";
import type { GameHistoryResponse, HistoryFilter, HistoryResult } from "@/types/history";

const PAGE_SIZE = 10;
const filters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All results" },
  { value: "wins", label: "Wins" },
  { value: "losses", label: "Losses" },
];

const resultStyles: Record<HistoryResult, string> = {
  WIN: "bg-trap-success/10 text-trap-success",
  LOSS: "bg-trap-danger/10 text-trap-danger",
};

export function HistoryView({ initialData }: { initialData: GameHistoryResponse }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function load(nextFilter: HistoryFilter, offset: number) {
    setError("");
    startTransition(async () => {
      try {
        const response = await apiFetch(`/users/me/history?limit=${PAGE_SIZE}&offset=${offset}&result=${nextFilter}`);
        if (response.status === 401) {
          router.push(`/login?next=${encodeURIComponent("/history")}`);
          return;
        }
        if (!response.ok) throw new Error("Could not load game history.");
        setData(await response.json() as GameHistoryResponse);
        setFilter(nextFilter);
      } catch {
        setError("We couldn't load your matches. Please try again.");
      }
    });
  }

  const page = Math.floor(data.offset / data.limit) + 1;
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Match archive</p>
        <h1 className="mt-2 font-secondary text-3xl uppercase text-white sm:text-4xl">Game History</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every match has a story.</p>
      </header>

      <section aria-label="History summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Games played", data.summary.games_played],
          ["Wins", data.summary.wins],
          ["Win rate", `${Math.round(data.summary.win_rate)}%`],
          ["Total points", data.summary.total_points],
        ].map(([label, value]) => (
          <Card key={label} className="border-white/[0.07] bg-trap-surface">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-black text-white" >{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter matches by result">
        {filters.map((item) => (
          <Button key={item.value} type="button" size="sm" variant={filter === item.value ? "default" : "surface"} disabled={isPending} aria-pressed={filter === item.value} onClick={() => load(item.value, 0)}>
            {item.label}
          </Button>
        ))}
      </div>

      {error ? <ErrorState title="History unavailable" description={error} actionLabel="Try again" onAction={() => load(filter, data.offset)} /> : null}

      <section aria-live="polite" aria-busy={isPending} className={cn("space-y-3 transition-opacity", isPending && "opacity-50")}>
        {!error && data.items.length === 0 ? (
          <Card className="border-white/[0.07] bg-trap-surface">
            <EmptyState icon={Gamepad2} title="No games played yet" description="Your completed matches will appear here. Invite your friends and start your first game." actionLabel="Create a room" onAction={() => router.push("/create-room")} className="py-14" />
          </Card>
        ) : data.items.map((game) => {
          const opponents = game.participants.filter((participant) => !participant.is_current_user);
          return (
            <Card key={game.match_id} className="overflow-hidden border-white/[0.07] bg-trap-surface">
              <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <div className={cn("grid size-12 place-items-center rounded-2xl text-sm font-black", resultStyles[game.result])}>{game.result[0]}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("border-0 text-[9px] font-black", resultStyles[game.result])}>{game.result}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">#{game.match_id.slice(0, 8)}</span>
                    <span className="text-[10px] font-bold text-trap-success">{game.status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(game.finished_at))}</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{game.participant_count} players</span>
                    <span>{game.total_rounds} rounds</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5" aria-label="Participants">
                    {game.participants.slice(0, 6).map((participant) => <PlayerAvatar key={`${participant.username}-${participant.final_rank}`} name={participant.username} src={apiMediaUrl(participant.avatar_url)} size={24} />)}
                    <span className="ml-1 truncate text-[10px] text-muted-foreground">vs {opponents.map((opponent) => opponent.username).join(", ") || "—"}</span>
                  </div>
                </div>
                <div className="flex items-end justify-between border-t border-white/[0.06] pt-3 sm:block sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
                  <p className="inline-flex items-center gap-1 text-xs font-black uppercase text-white"><Trophy className="size-3.5 text-accent" />#{game.placement} place</p>
                  <p className="mt-1 text-lg font-black text-accent">{game.final_score} pts</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {data.total > 0 ? (
        <nav aria-label="Game history pagination" className="flex items-center justify-center gap-3">
          <Button type="button" variant="surface" size="sm" disabled={isPending || data.offset === 0} onClick={() => load(filter, Math.max(0, data.offset - data.limit))}><ChevronLeft className="size-4" />Previous</Button>
          <span className="text-xs font-bold text-muted-foreground">Page {page} of {pages}</span>
          <Button type="button" variant="surface" size="sm" disabled={isPending || data.offset + data.limit >= data.total} onClick={() => load(filter, data.offset + data.limit)}>Next<ChevronRight className="size-4" /></Button>
        </nav>
      ) : null}
    </div>
  );
}
