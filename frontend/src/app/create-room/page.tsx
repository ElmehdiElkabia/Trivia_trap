import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/require-user";

const apiBase = (
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://trivia-trap-api-3fe6377c53b3.herokuapp.com"
    : "http://localhost:8000")
).replace(/\/$/, "");

export default async function CreateRoomPage() {
  await requireUser("/create-room");
  const accessToken = (await cookies()).get("access_token")?.value;
  if (!accessToken) redirect("/login?next=%2Fcreate-room");

  const response = await fetch(`${apiBase}/room`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fcreate-room");
  if (!response.ok) throw new Error("Could not create a room. Please try again.");

  const data = await response.json() as { room_id?: string };
  if (!data.room_id) throw new Error("The server did not return a room code.");
  redirect(`/room/${encodeURIComponent(data.room_id)}`);
}
