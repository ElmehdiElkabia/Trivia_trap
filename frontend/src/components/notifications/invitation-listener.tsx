"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, X } from "lucide-react";
import { PlayerAvatar } from "@/components/game/players/player-avatar";
import { Button } from "@/components/ui/button";
import { apiFetch, apiMediaUrl } from "@/lib/api";
import type { RoomInvitationNotification } from "@/types/notifications";

const API_WS_BASE = "https://trivia-trap-api-3fe6377c53b3.herokuapp.com";

function websocketBaseUrl() {
  if (process.env.NODE_ENV === "production") return "wss://trivia-trap-api-3fe6377c53b3.herokuapp.com";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const isLoopback = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const host = isLoopback ? `${window.location.hostname}:8000` : window.location.host;
  return `${protocol}//${host}`;
}

async function requestWebSocketTicket(): Promise<string> {
  const response = await apiFetch("/auth/ws-ticket", { method: "POST" });
  if (!response.ok) throw new Error(`Could not authorize invitation WebSocket (${response.status})`);
  const body = await response.json() as { ticket?: string };
  if (!body.ticket) throw new Error("WebSocket ticket missing from response");
  return body.ticket;
}

export function InvitationListener() {
  const router = useRouter();
  const [invitation, setInvitation] = useState<RoomInvitationNotification | null>(null);
  const [busy, setBusy] = useState(false);
  const reconnect = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    const connect = async () => {
      if (stopped) return;
      try {
        const ticket = await requestWebSocketTicket();
        if (stopped) return;
        const url = new URL(`${websocketBaseUrl()}/invitations/ws`);
        url.searchParams.set("ticket", ticket);
        socket = new WebSocket(url);
        socket.onopen = () => socket?.send("ready");
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as { event?: string; data?: RoomInvitationNotification };
            if (message.event === "ROOM_INVITATION" && message.data) {
              setInvitation(message.data);
              window.dispatchEvent(new CustomEvent("trivia:room-invitation", { detail: message.data }));
            }
          } catch { /* Ignore malformed server messages. */ }
        };
        socket.onclose = () => {
          if (!stopped) reconnect.current = window.setTimeout(() => { void connect(); }, 3000);
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!stopped) reconnect.current = window.setTimeout(() => { void connect(); }, 5000);
      }
    };
    void connect();
    return () => {
      stopped = true;
      if (reconnect.current) window.clearTimeout(reconnect.current);
      socket?.close();
    };
  }, []);

  async function respond(action: "accept" | "decline") {
    if (!invitation) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/invitations/${encodeURIComponent(invitation.id)}/${action}`, { method: "POST" });
      if (response.ok && action === "accept") {
        const body = await response.json() as { room_code: string };
        router.push(`/join?code=${encodeURIComponent(body.room_code)}`);
      }
      if (response.ok) setInvitation(null);
    } finally {
      setBusy(false);
    }
  }

  if (!invitation) return null;
  return <aside className="fixed bottom-4 right-4 z-[80] w-[min(92vw,390px)] rounded-2xl border border-secondary/30 bg-[#1c1c22] p-4 shadow-2xl" aria-live="assertive">
    <button type="button" onClick={() => setInvitation(null)} className="absolute right-3 top-3 text-[#85858f] hover:text-white" aria-label="Dismiss invitation"><X className="size-4" /></button>
    <div className="flex gap-3 pr-6"><PlayerAvatar name={invitation.inviter_username} src={apiMediaUrl(invitation.inviter_avatar_url)} size={48} /><div><p className="text-sm font-extrabold text-white">Game invitation</p><p className="mt-1 text-xs text-[#a6a6ae]"><strong className="text-white">{invitation.inviter_username}</strong> invited you to join a game.</p><p className="mt-1 font-mono text-[10px] text-accent">Room {invitation.room_code}</p></div></div>
    <div className="mt-4 flex gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => { void respond("accept"); }}><Gamepad2 className="size-4" /> Join game</Button><Button type="button" variant="surface" size="sm" disabled={busy} onClick={() => { void respond("decline"); }}>Decline</Button></div>
  </aside>;
}
