import { apiFetch } from "@/lib/api";

export type AvailableRoomSettings = {
  total_rounds?: number;
  bluff_time?: number;
  vote_time?: number;
  max_players?: number;
  language?: string;
};

export type AvailableRoom = {
  roomId: string;
  playerCount: number;
  settings: AvailableRoomSettings;
};

type AvailableRoomsPayload = Record<string, {
  player_count?: unknown;
  settings?: Record<string, unknown>;
}>;

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function getAvailableRooms(signal?: AbortSignal): Promise<AvailableRoom[]> {
  const response = await apiFetch("/rooms", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not load available rooms.");

  const payload = await response.json() as AvailableRoomsPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The server returned an invalid room list.");
  }

  return Object.entries(payload).flatMap(([roomId, room]) => {
    const playerCount = optionalNumber(room?.player_count);
    if (playerCount === undefined) return [];

    const rawSettings = room?.settings ?? {};
    const settings: AvailableRoomSettings = {
      total_rounds: optionalNumber(rawSettings.total_rounds),
      bluff_time: optionalNumber(rawSettings.bluff_time),
      vote_time: optionalNumber(rawSettings.vote_time),
      max_players: optionalNumber(rawSettings.max_players),
      language: typeof rawSettings.language === "string" ? rawSettings.language : undefined,
    };

    return [{ roomId, playerCount, settings }];
  }).filter((room) => room.settings.max_players === undefined || room.playerCount < room.settings.max_players);
}
