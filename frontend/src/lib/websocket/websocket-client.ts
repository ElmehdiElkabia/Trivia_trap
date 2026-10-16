import { apiFetch } from "@/lib/api";
import { parseLobbyMessage } from "./websocket-events";
import type { SessionUser } from "./session-user";
import type {
  GameConnectionState,
  GetQuestionCategoryData,
  GetQuestionMessage,
  KickPlayerData,
  KickPlayerMessage,
  LeaveRoomMessage,
  LobbyServerMessage,
  NextPhaseMessage,
  ReturnToLobbyMessage,
  SubmitBluffMessage,
  SubmitVoteMessage,
  UpdateSettingsData,
} from "./websocket-types";
interface Handlers {
  onStateChange: (state: GameConnectionState) => void;
  onMessage: (message: LobbyServerMessage) => void;
  onMalformedMessage: () => void;
}
const log = (message: string) => {
  if (process.env.NODE_ENV === "development") console.info(`[WS] ${message}`);
};
const API_WS_BASE = "https://trivia-trap-api-3fe6377c53b3.herokuapp.com";

async function requestWebSocketTicket(): Promise<string> {
  const response = await apiFetch("/auth/ws-ticket", { method: "POST" });
  if (!response.ok) throw new Error(`Could not authorize WebSocket (${response.status})`);
  const body = await response.json() as { ticket?: string };
  if (!body.ticket) throw new Error("WebSocket ticket missing from response");
  return body.ticket;
}

function websocketBaseUrl(): string {
  if (process.env.NODE_ENV === "production") return "wss://trivia-trap-api-3fe6377c53b3.herokuapp.com";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? `${window.location.hostname}:8000`
    : window.location.host;
  return `${protocol}//${host}`;
}

export class GameWebSocketClient {
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private generation = 0;
  constructor(private readonly handlers: Handlers, private readonly sessionUser: SessionUser) {}
  async connect(roomId: string) {
    if (!roomId || (this.roomId === roomId && this.socket && this.socket.readyState < WebSocket.CLOSING)) return;
    this.disconnect();
    const generation = ++this.generation;
    this.roomId = roomId;
    this.handlers.onStateChange("CONNECTING");
    log("Requesting WebSocket ticket...");
    try {
      const ticket = await requestWebSocketTicket();
      if (generation !== this.generation) return;
      const url = new URL(`${websocketBaseUrl()}/room/${encodeURIComponent(roomId)}`);
      url.searchParams.set("ticket", ticket);
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => {
        if (generation === this.generation) {
          log("Connected");
          this.handlers.onStateChange("CONNECTED");
        }
      };
      socket.onmessage = (event) => {
        if (generation !== this.generation || typeof event.data !== "string") return;
        const message = parseLobbyMessage(event.data);
        if (!message) {
          log("Ignored malformed message");
          this.handlers.onMalformedMessage();
          return;
        }
        if (message.event === "LOBBY_UPDATE") log("Received LOBBY_UPDATE");
        this.handlers.onMessage(message);
      };
      socket.onerror = () => {
        if (generation === this.generation) {
          log("Error");
          this.handlers.onStateChange("ERROR");
        }
      };
      socket.onclose = () => {
        if (generation === this.generation) {
          log("Disconnected");
          this.socket = null;
          this.handlers.onStateChange("DISCONNECTED");
        }
      };
    } catch (error) {
      if (generation === this.generation) {
        log(error instanceof Error ? error.message : "WebSocket authorization failed");
        this.socket = null;
        this.handlers.onStateChange("ERROR");
      }
    }
  }
  sendChatMessage(message: string) {
    const value = message.trim();
    if (!value || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "CHAT_MESSAGE", data: { message: value } }));
    return true;
  }
  updateSettings(settings: UpdateSettingsData) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "UPDATE_SETTINGS", data: settings }));
    return true;
  }
  kickPlayer(playerId: KickPlayerData["player_id"]) {
    if (!playerId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "KICK_PLAYER", data: { player_id: playerId } } satisfies KickPlayerMessage));
    return true;
  }
  nextPhase() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "NEXT_PHASE", data: {} } satisfies NextPhaseMessage));
    return true;
  }
  returnToLobby() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "RETURN_TO_LOBBY", data: {} } satisfies ReturnToLobbyMessage));
    return true;
  }
  leaveRoom() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "LEAVE_ROOM", data: {} } satisfies LeaveRoomMessage));
    return true;
  }
  getQuestion(category: GetQuestionCategoryData) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "GET_QUESTION", data: { category } } satisfies GetQuestionMessage));
    return true;
  }
  submitBluff(answer: string) {
    const bluffAnswer = answer.trim();
    if (bluffAnswer.length < 1 || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "SUBMIT_BLUFF", data: { bluff_answer: bluffAnswer } } satisfies SubmitBluffMessage));
    return true;
  }
  submitVote(choiceId: string) {
    if (!choiceId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event: "SUBMIT_VOTE", data: { choice_id: choiceId } } satisfies SubmitVoteMessage));
    return true;
  }
  disconnect() {
    this.generation += 1;
    this.roomId = null;
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.onopen = () => socket.close(1000, "Lobby closed");
      return;
    }
    socket.onopen = null;
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, "Lobby closed");
  }
}
