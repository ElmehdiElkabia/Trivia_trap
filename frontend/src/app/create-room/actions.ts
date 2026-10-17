"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/require-user";
import { loginPathFor } from "@/lib/auth-routing";

const apiBase = (
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://trivia-trap-api-3fe6377c53b3.herokuapp.com"
    : "http://localhost:8000")
).replace(/\/$/, "");

export async function createRoomAction(): Promise<never> {
  await requireUser("/create-room");

  const accessToken = (await cookies()).get("access_token")?.value;
  if (!accessToken) redirect(loginPathFor("/create-room"));

  let response: Response;
  try {
    response = await fetch(`${apiBase}/room`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not connect to the game server. Please try again.");
  }

  if (response.status === 401) redirect(loginPathFor("/create-room"));
  if (!response.ok) {
    throw new Error("Could not create a room. Please try again.");
  }

  const data = (await response.json()) as { room_id?: string };
  if (!data.room_id) throw new Error("The server did not return a room code.");

  redirect(`/room/${encodeURIComponent(data.room_id)}`);
}
