import { ArrowUpRight, Crown } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GameHistoryResponse } from "@/types/history";

export function RecentGames({ history }: { history: GameHistoryResponse | null }) {
  return (
    <Card className="rounded-[20px] border border-white/[0.07] bg-trap-surface shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
      <CardHeader className="flex-row items-center justify-between border-b border-white/[0.06] pb-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Match log</p>
          <CardTitle className="mt-1 font-secondary text-lg uppercase">Recent games</CardTitle>
        </div>
        <Crown className="size-5 text-accent" aria-hidden="true" />
      </CardHeader>
      <CardContent className="px-0">
        <div className="divide-y divide-white/[0.055]">
          {!history ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Recent games are temporarily unavailable.</p> : null}
          {history?.items.length === 0 ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">No completed games yet.</p> : null}
          {history?.items.map((game) => (
            <div key={game.match_id} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025]">
              <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-[10px] font-black", game.result === "WIN" ? "bg-trap-success/10 text-trap-success" : "bg-white/[0.05] text-[#8f8f99]")}>
                {game.result[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-extrabold text-white">Match #{game.match_id.slice(0, 8)}</p>
                  <Badge className={cn("h-5 border-0 px-1.5 text-[8px] font-black", game.result === "WIN" ? "bg-trap-success/10 text-trap-success" : "bg-trap-danger/10 text-trap-danger")}>
                    {game.result}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-[10px] text-[#777782]">#{game.placement} place · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(game.finished_at))}</p>
              </div>
              <p className="shrink-0 text-xs font-black text-accent">{game.final_score} pts</p>
            </div>
          ))}
        </div>
        <div className="px-4 pt-4">
          <Button asChild variant="ghost" size="sm" className="w-full text-[10px] text-[#a6a6ae]">
            <Link href="/history">View all games <ArrowUpRight className="size-3.5" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
