"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock3,
  DoorOpen,
  Gamepad2,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { getAvailableRooms, type AvailableRoom } from "@/lib/available-rooms";

export function AvailableRooms() {
  const router = useRouter();
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const refreshRooms = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError("");
    setRefreshing(true);

    try {
      setRooms(await getAvailableRooms(controller.signal));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      setError("We couldn't load the available rooms. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    getAvailableRooms(controller.signal)
      .then((availableRooms) => {
        if (!controller.signal.aborted) setRooms(availableRooms);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        if (!controller.signal.aborted)
          setError("We couldn't load the available rooms. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="available-rooms-title" className="mt-4">
      <Card className="rounded-[20px] border border-white/[0.07] bg-trap-surface shadow-[0_18px_42px_rgba(0,0,0,0.16)]">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-white/[0.06] pb-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">
              Find a match
            </p>
            <CardTitle
              id="available-rooms-title"
              className="mt-1 font-secondary text-lg uppercase"
            >
              Available Rooms
            </CardTitle>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            disabled={loading || refreshing}
            onClick={() => void refreshRooms()}
            aria-label="Refresh available rooms"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState
              title="LOADING ROOMS"
              description="Looking for open lobbies…"
              className="my-2"
            />
          ) : error ? (
            <ErrorState
              title="ROOMS UNAVAILABLE"
              description={error}
              actionLabel="Try again"
              onAction={() => void refreshRooms()}
              className="my-2"
            />
          ) : rooms.length === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title="No rooms available"
              description="There aren't any joinable rooms right now. Start one and invite your crew."
              actionLabel="Create a room"
              onAction={() => router.push("/create-room")}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rooms.map((room) => (
                <article
                  key={room.roomId}
                  className="flex flex-col rounded-2xl border border-white/[0.07] bg-black/10 p-4 transition-colors hover:border-primary/30 hover:bg-white/[0.025]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#777782]">
                        Room code
                      </p>
                      <h3 className="mt-1 truncate font-mono text-xl font-black tracking-[0.14em] text-white">
                        {room.roomId}
                      </h3>
                    </div>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Gamepad2 className="size-5" aria-hidden="true" />
                    </span>
                  </div>

                  <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#d8d8dd]">
                    <UsersRound
                      className="size-4 text-trap-success"
                      aria-hidden="true"
                    />
                    {room.playerCount}/{room.settings.max_players ?? "?"}{" "}
                    players
                  </p>

                  <dl className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#a6a6ae]">
                    {room.settings.total_rounds !== undefined ? (
                      <Setting
                        label="Rounds"
                        value={room.settings.total_rounds}
                      />
                    ) : null}
                    {room.settings.bluff_time !== undefined ? (
                      <Setting
                        label="Bluff"
                        value={`${room.settings.bluff_time}s`}
                      />
                    ) : null}
                    {room.settings.vote_time !== undefined ? (
                      <Setting
                        label="Vote"
                        value={`${room.settings.vote_time}s`}
                      />
                    ) : null}
                  </dl>

                  <Button asChild size="sm" className="mt-5 w-full">
                    <Link
                      href={`/join?code=${encodeURIComponent(room.roomId)}`}
                    >
                      Join Room
                    </Link>
                  </Button>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Setting({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
      <Clock3 className="size-3 text-[#9295ff]" aria-hidden="true" />
      <dt className="font-bold uppercase tracking-wider text-[#777782]">
        {label}
      </dt>
      <dd className="font-black text-white">{value}</dd>
    </div>
  );
}
