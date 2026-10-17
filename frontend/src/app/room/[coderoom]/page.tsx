import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TriviaTrapGame } from "@/components/game/trivia-trap-game";
import { findMockRoom } from "@/mocks/rooms";
import { requireUser } from "@/lib/require-user";
import { loginPathFor } from "@/lib/auth-routing";

const apiBase = (
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://trivia-trap-api-3fe6377c53b3.herokuapp.com"
    : "http://localhost:8000")
).replace(/\/$/, "");

interface GamePageProps {
  params: Promise<{ coderoom: string }>;
  searchParams: Promise<{ state?: string }>;
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const [{ coderoom }, query] = await Promise.all([params, searchParams]);
  const roomCode = decodeURIComponent(coderoom).trim().toUpperCase();
  const currentUser = await requireUser(`/room/${encodeURIComponent(roomCode)}`);

  if (process.env.NODE_ENV === "development" && query.state) {
    const room = findMockRoom(roomCode);
    if (!room || room.status !== "open") notFound();
    return (
      <TriviaTrapGame
        roomCode={room.code}
        mockState={query.state}
        currentUser={{ id: String(currentUser.id), name: currentUser.username }}
      />
    );
  }

  const accessToken = (await cookies()).get("access_token")?.value;
  if (!accessToken) redirect(loginPathFor(`/room/${encodeURIComponent(roomCode)}`));

  let response: Response;
  try {
    response = await fetch(`${apiBase}/room/${encodeURIComponent(roomCode)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not connect to the game server. Please try again.");
  }

  if (response.status === 400 || response.status === 404) notFound();
  if (response.status === 401) {
    redirect(loginPathFor(`/room/${encodeURIComponent(roomCode)}`));
  }
  if (!response.ok) {
    throw new Error("Could not check the room status. Please try again.");
  }

  return (
    <TriviaTrapGame
      roomCode={roomCode}
      roomId={roomCode}
      currentUser={{ id: String(currentUser.id), name: currentUser.username }}
    />
  );
}
