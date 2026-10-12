export type HistoryResult = "WIN" | "LOSS";
export type HistoryFilter = "all" | "wins" | "losses";

export type HistoryParticipant = {
  username: string;
  avatar_url: string | null;
  final_score: number;
  final_rank: number;
  is_current_user: boolean;
};

export type GameHistoryItem = {
  match_id: string;
  finished_at: string;
  placement: number;
  final_score: number;
  result: HistoryResult;
  participant_count: number;
  participants: HistoryParticipant[];
  total_rounds: number;
  status: "COMPLETED";
};

export type GameHistoryResponse = {
  items: GameHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    games_played: number;
    wins: number;
    win_rate: number;
    total_points: number;
  };
};
