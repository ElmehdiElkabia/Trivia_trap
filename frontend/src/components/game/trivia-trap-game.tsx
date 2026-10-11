"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { animationPacing } from "@/animations/pacing";
import { mockChatMessages } from "@/mocks/chat";
import { mockGame } from "@/mocks/game";
import { mockQuestions } from "@/mocks/questions";
import {
  mockAnswerReveal,
  mockFinalResults,
  mockRoundResults,
} from "@/mocks/results";
import { GameHud } from "./hud/game-hud";
import { PlayerActivityDock } from "./players/player-activity-dock";
import { FullScreenPhaseTransition } from "./transitions/phase-transition";
import { GameIntro } from "./system/game-intro";
import { LobbyPhase, type LobbyConnectionState } from "./phases/lobby-phase";
import { CategoryPhase, type CategoryOption } from "./phases/category-phase";
import { TrapPhase } from "./phases/trap-phase";
import { VotingPhase } from "./phases/voting-phase";
import { ResultsRevealPhase } from "./phases/results-reveal-phase";
import { RoundResultsPhase } from "./phases/round-results-phase";
import { FinalResultsPhase } from "./phases/final-results-phase";
import { WaitingArena } from "./voting/waiting/waiting-arena";
import { WaitingMotionContext } from "./voting/waiting/waiting-motion";
import type { Category } from "./question/category-card";
import type { ChatMessageData } from "@/types/chat";
import type { GamePhase, GameSettings } from "@/types/game";
import type { Player } from "@/types/player";
import type { Question, VotingOption } from "@/types/question";
import type { AnswerReveal, FinalResults, RoundResults } from "@/types/results";
import { useGameWebSocket } from "@/hooks/use-game-websocket";
import { ErrorState } from "@/components/ui/error-state";
import type { SessionUser } from "@/lib/websocket/session-user";
import { InvitationListener } from "@/components/notifications/invitation-listener";
import { gameErrorPresentation } from "@/lib/game-error";
import { RoomNotFound } from "@/components/errors/room-not-found";
import { apiFetch, apiMediaUrl } from "@/lib/api";

interface MockGameFlowState {
  currentPhase: GamePhase;
  roomCode: string;
  settings: GameSettings;
  players: Player[];
  chatMessages: ChatMessageData[];
  currentRound: number;
  totalRounds: number;
  selectedCategory: Category | null;
  currentQuestion: Question;
  submittedTrapAnswer: string;
  votingOptions: VotingOption[];
  selectedVote: VotingOption["id"] | null;
  playerSubmitted: boolean;
  playerVoted: boolean;
  revealState: AnswerReveal | null;
  roundStandings: RoundResults;
  finalStandings: FinalResults;
  timeRemaining: number;
}

const timedPhases: GamePhase[] = ["CATEGORY", "TRAP", "VOTING"];
// Simulated remote-player latency for this mock flow, not an animation/UI lock.
// A real multiplayer connection advances immediately on the server's phase event.
const mockPlayerWaitMs = 4800;
const activePlayerIds = new Set(mockGame.players.map((player) => player.id));
const mockRoundStandings: RoundResults = {
  players: mockRoundResults.players.filter((player) =>
    activePlayerIds.has(player.id),
  ),
};
const mockGameFinalStandings: FinalResults = {
  standings: mockFinalResults.standings.filter((player) =>
    activePlayerIds.has(player.id),
  ),
};

interface TriviaTrapGameProps {
  roomCode: string;
  roomId?: string;
  mockState?: string;
  currentUser: SessionUser;
}

export function TriviaTrapGame({ roomCode, roomId, mockState, currentUser }: TriviaTrapGameProps) {
  const router = useRouter();
  const websocket = useGameWebSocket(roomId, currentUser);
  const [game, setGame] = useState<MockGameFlowState>(() =>
    createInitialState(roomCode, undefined, mockState),
  );
  const [showGameIntro, setShowGameIntro] = useState(false);
  const [connectionState] = useState<LobbyConnectionState>(() =>
    lobbyConnectionForMockState(mockState),
  );
  const introTimeoutRef = useRef<number | null>(null);
  const categoryTimeoutRef = useRef<number | null>(null);
  const categoryRequestedRef = useRef(false);
  const leavingRoomRef = useRef(false);
  const avatarRequestsRef = useRef(new Set<string>());
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string | null>>({});
  const lobbyPlayers = websocket.lobby?.players;

  useEffect(() => {
    if (!lobbyPlayers) return;

    const avatarRequests = avatarRequestsRef.current;
    const pendingPlayers = lobbyPlayers.filter(
      (player) => !avatarRequests.has(player.id),
    );
    if (pendingPlayers.length === 0) return;

    const controller = new AbortController();
    let settled = false;
    for (const player of pendingPlayers) avatarRequests.add(player.id);

    void Promise.all(pendingPlayers.map(async (player) => {
      try {
        const response = await apiFetch(
          `/users/${encodeURIComponent(player.username)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load player avatar");

        const profile = await response.json() as { avatar?: string | null };
        return [player.id, apiMediaUrl(profile.avatar) ?? null] as const;
      } catch {
        if (!controller.signal.aborted) avatarRequests.delete(player.id);
        return null;
      }
    })).then((avatars) => {
      settled = true;
      if (controller.signal.aborted) return;
      setPlayerAvatars((current) => {
        const next = { ...current };
        for (const avatar of avatars) {
          if (avatar) next[avatar[0]] = avatar[1];
        }
        return next;
      });
    });

    return () => {
      controller.abort();
      if (!settled) {
        for (const player of pendingPlayers) avatarRequests.delete(player.id);
      }
    };
  }, [lobbyPlayers]);

  const isHost = game.players.some(
    (player) => player.isYou && player.role === "HOST",
  );
  const isLiveHost = Boolean(
    websocket.lobby &&
      websocket.sessionUser &&
      websocket.lobby.host_id === websocket.sessionUser.id,
  );
  const activePhase: GamePhase = roomId
    ? (websocket.phase ?? "LOBBY")
    : game.currentPhase;
  const serverPlayers: Player[] = websocket.lobby?.players.map((player) => ({
    id: player.id, name: player.username, role: player.id === websocket.lobby?.host_id ? "HOST" : "PLAYER",
    status: !player.is_present
      ? "OFFLINE"
      : activePhase === "TRAP"
        ? websocket.bluffSubmittedPlayerIds.includes(player.id) ? "SUBMITTED" : "THINKING"
        : activePhase === "VOTING"
          ? websocket.voteSubmittedPlayerIds.includes(player.id) ? "VOTED" : "THINKING"
          : "ONLINE",
    isYou: player.id === websocket.sessionUser?.id,
    score: player.score,
    avatar: playerAvatars[player.id] ?? undefined,
  })) ?? [];
  const serverSettings: GameSettings | null = websocket.lobby ? {
    totalRounds: websocket.lobby.settings.total_rounds, bluffTime: websocket.lobby.settings.bluff_time,
    voteTime: websocket.lobby.settings.vote_time, maxPlayers: websocket.lobby.settings.max_players, language: websocket.lobby.settings.language,
  } : null;
  const activePlayers = roomId ? serverPlayers : game.players;
  const categoryRound = websocket.categoryPhase?.round ?? game.currentRound;
  const categoryChooser = getCategoryChooser(activePlayers, categoryRound);
  const isCategoryChooser = Boolean(categoryChooser?.isYou);
  const getQuestion = websocket.getQuestion;
  const roomLanguage = websocket.lobby?.settings.language ?? "en";
  const liveQuestion: Question | null = websocket.questionPhase ? {
    id: String(websocket.questionPhase.question_id),
    category: websocket.questionPhase.category,
    text: websocket.questionPhase.question,
    type: websocket.questionPhase.image_url ? "IMAGE" : "TEXT",
    image: websocket.questionPhase.image_url ?? undefined,
    imageAlt: websocket.questionPhase.image_url
      ? `${websocket.questionPhase.category} question`
      : undefined,
    answers: [],
  } : null;
  const liveVotingQuestion: Question | null = websocket.votingPhase ? {
    id: websocket.questionPhase ? String(websocket.questionPhase.question_id) : "live-vote",
    category: websocket.questionPhase?.category ?? "TRIVIA",
    text: websocket.votingPhase.question.text,
    type: websocket.votingPhase.question.image_url ? "IMAGE" : "TEXT",
    image: websocket.votingPhase.question.image_url ?? undefined,
    imageAlt: websocket.votingPhase.question.image_url ? "Voting question" : undefined,
    answers: [],
  } : null;
  const liveReveal: AnswerReveal | null = websocket.resultsRevealed ? (() => {
    const correctChoice = websocket.resultsRevealed.choices.find((choice) => choice.is_correct);
    if (!correctChoice) return null;
    return {
      correctAnswer: correctChoice.text,
      correctVoterNames: correctChoice.voters,
      submissions: websocket.resultsRevealed.choices
        .filter((choice) => !choice.is_correct)
        .map((choice) => {
          const authorName = choice.authors_names?.join(" & ") || "TRIVIA TRAP";
          const player = serverPlayers.find((candidate) => candidate.name === choice.authors_names?.[0]);
          return {
            id: choice.id,
            text: choice.text,
            author: { id: player?.id ?? `answer-${choice.id}`, name: authorName, avatar: player?.avatar },
            voterNames: choice.voters,
          };
        }),
    };
  })() : null;
  const liveRoundResults: RoundResults | null = websocket.resultsRevealed ? {
    players: websocket.resultsRevealed.leaderboard.map((entry) => ({
      id: entry.player_id,
      rank: entry.rank,
      name: entry.username,
      avatar: entry.avatar_url ?? undefined,
      isYou: entry.player_id === websocket.sessionUser?.id,
      isHost: entry.player_id === websocket.lobby?.host_id,
      rankChange: entry.rank_change,
      roundPoints: entry.round_points,
      totalScore: entry.score,
    })),
  } : null;
  const liveFinalResults: FinalResults | null = websocket.podiumPhase ? {
    standings: websocket.podiumPhase.leaderboard.map((entry) => ({
      id: entry.player_id,
      rank: entry.rank,
      name: entry.username,
      avatar: entry.avatar_url ?? undefined,
      isYou: entry.player_id === websocket.sessionUser?.id,
      finalScore: entry.score,
    })),
  } : null;
  const voteDeadlinePassed =
    game.currentPhase === "VOTING" && game.timeRemaining <= 0;
  const playerScores = Object.fromEntries(
    game.roundStandings.players.map((player) => [player.id, player.totalScore]),
  );
  const displayedError = websocket.error
    ? gameErrorPresentation(websocket.error)
    : null;

  useEffect(() => {
    return () => {
      if (introTimeoutRef.current !== null) {
        window.clearTimeout(introTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const categoryPhase = websocket.categoryPhase;
    if (!roomId || !isCategoryChooser || activePhase !== "CATEGORY" || !categoryPhase) {
      return;
    }
    categoryRequestedRef.current = false;
    categoryTimeoutRef.current = window.setTimeout(() => {
      const categories = categoryPhase.categories;
      if (categoryRequestedRef.current || categories.length === 0) return;
      const category = categories[Math.floor(Math.random() * categories.length)];
      categoryRequestedRef.current = true;
      getQuestion({
        id: category.id,
        name: category.name,
        language: roomLanguage,
      });
    }, categoryPhase.duration * 1000);
    return () => {
      if (categoryTimeoutRef.current !== null) {
        window.clearTimeout(categoryTimeoutRef.current);
        categoryTimeoutRef.current = null;
      }
    };
  }, [activePhase, getQuestion, isCategoryChooser, roomId, roomLanguage, websocket.categoryPhase]);

  useEffect(() => {
    if (!timedPhases.includes(game.currentPhase) || game.timeRemaining <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setGame((current) => {
        const next = {
          ...current,
          timeRemaining: Math.max(0, current.timeRemaining - 1),
        };
        return next.timeRemaining === 0 ? advanceExpiredPhase(next) : next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [game.currentPhase, game.timeRemaining]);

  useEffect(() => {
    const phase = game.currentPhase;
    const round = game.currentRound;
    if (!(
      (phase === "TRAP" && game.playerSubmitted) ||
      (phase === "VOTING" && (game.playerVoted || voteDeadlinePassed))
    ))
      return;

    const completedStatus = phase === "TRAP" ? "SUBMITTED" : "VOTED";
    const markRemotePlayers = (count: number) => {
      setGame((current) => {
        if (current.currentPhase !== phase || current.currentRound !== round)
          return current;
        let completed = 0;
        return {
          ...current,
          players: current.players.map((player) => {
            if (
              player.isYou ||
              player.status === "OFFLINE" ||
              completed >= count
            )
              return player;
            completed += 1;
            return { ...player, status: completedStatus };
          }),
        };
      });
    };

    const activityTimers = voteDeadlinePassed
      ? []
      : [
          window.setTimeout(() => markRemotePlayers(2), 900),
          window.setTimeout(() => markRemotePlayers(4), 2300),
        ];

    const timeout = window.setTimeout(
      () => {
        setGame((current) => {
          if (current.currentPhase !== phase || current.currentRound !== round)
            return current;
          return phase === "TRAP"
            ? {
                ...current,
                currentPhase: "VOTING",
                timeRemaining: current.settings.voteTime,
                players: current.players.map((player) =>
                  player.status === "OFFLINE"
                    ? player
                    : { ...player, status: "THINKING" },
                ),
              }
            : { ...current, currentPhase: "RESULTS_REVEAL", timeRemaining: 0 };
        });
      },
      voteDeadlinePassed ? 0 : mockPlayerWaitMs,
    );

    return () => {
      window.clearTimeout(timeout);
      activityTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    game.currentPhase,
    game.currentRound,
    game.playerSubmitted,
    game.playerVoted,
    voteDeadlinePassed,
  ]);

  function startGame() {
    setGame((current) =>
      resetRound({ ...current, totalRounds: current.settings.totalRounds }, 1),
    );
    setShowGameIntro(true);
    if (introTimeoutRef.current !== null) {
      window.clearTimeout(introTimeoutRef.current);
    }
    introTimeoutRef.current = window.setTimeout(() => {
      setShowGameIntro(false);
      introTimeoutRef.current = null;
    }, 1650);
  }


  function kickPlayer(playerId: Player["id"]) {
    setGame((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== playerId),
      roundStandings: {
        players: current.roundStandings.players.filter(
          (player) => player.id !== playerId,
        ),
      },
      finalStandings: {
        standings: current.finalStandings.standings.filter(
          (player) => player.id !== playerId,
        ),
      },
    }));
  }

  function updateSettings(settings: GameSettings) {
    setGame((current) => ({
      ...current,
      settings,
      totalRounds: settings.totalRounds,
    }));
  }

  function selectCategory(category: Category) {
    setGame((current) => ({
      ...current,
      selectedCategory: category,
      currentQuestion: questionForRound(current.currentRound, category),
    }));

    window.setTimeout(() => {
      setGame((current) =>
        current.currentPhase === "CATEGORY" &&
        current.selectedCategory === category
          ? {
              ...current,
              currentPhase: "TRAP",
              timeRemaining: current.settings.bluffTime,
              players: current.players.map((player) =>
                player.status === "OFFLINE"
                  ? player
                  : { ...player, status: "THINKING" },
              ),
            }
          : current,
      );
    }, animationPacing.categoryReactionMs);
  }

  function sendChatMessage(text: string) {
    setGame((current) => {
      const player = current.players.find((candidate) => candidate.isYou);
      if (!player) return current;

      return {
        ...current,
        chatMessages: [
          ...current.chatMessages,
          {
            id: `message-${Date.now()}`,
            playerId: player.id,
            playerName: player.name,
            playerAvatar: player.avatar,
            text,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            isYou: true,
          },
        ],
      };
    });
  }

  function submitTrapAnswer(answer: string) {
    setGame((current) => {
      if (current.currentPhase !== "TRAP" || current.playerSubmitted)
        return current;
      const revealState = buildRevealState(
        answer,
        current.players,
        correctAnswerForQuestion(current.currentQuestion),
      );
      return {
        ...current,
        submittedTrapAnswer: answer,
        playerSubmitted: true,
        players: current.players.map((player) =>
          player.isYou ? { ...player, status: "SUBMITTED" } : player,
        ),
        revealState,
        votingOptions: buildVotingOptions(revealState, current.currentRound),
        selectedVote: null,
        playerVoted: false,
      };
    });
  }

  function castVote(optionId: VotingOption["id"]) {
    setGame((current) => {
      if (
        current.currentPhase !== "VOTING" ||
        current.playerVoted ||
        current.timeRemaining <= 0
      )
        return current;
      return {
        ...current,
        selectedVote: optionId,
        playerVoted: true,
        players: current.players.map((player) =>
          player.isYou ? { ...player, status: "VOTED" } : player,
        ),
      };
    });
  }

  function continueAfterRound() {
    setGame((current) => {
      if (current.currentRound >= current.totalRounds) {
        return { ...current, currentPhase: "FINAL_RESULTS" };
      }

      const nextRound = current.currentRound + 1;
      return resetRound(current, nextRound);
    });
  }

  function playAgain() {
    setGame(createInitialState(roomCode, "LOBBY"));
  }

  function leaveRoom() {
    if (leavingRoomRef.current) return;
    leavingRoomRef.current = true;
    if (roomId) websocket.leaveRoom();
    setShowGameIntro(false);
    router.push("/dashboard");
  }

  function retryServerAction() {
    websocket.clearError();
    if (activePhase === "LOBBY" && isLiveHost) {
      websocket.nextPhase();
    }
  }

  function requestQuestion(category: CategoryOption) {
    if (categoryRequestedRef.current) return;
    categoryRequestedRef.current = true;
    if (categoryTimeoutRef.current !== null) {
      window.clearTimeout(categoryTimeoutRef.current);
      categoryTimeoutRef.current = null;
    }
    getQuestion({
      id: category.id,
      name: category.name,
      language: roomLanguage,
    });
  }

  function renderPhase(phase: GamePhase) {
    switch (phase) {
      case "LOBBY":
        return (
          <LobbyPhase
            players={roomId ? serverPlayers : game.players}
            roomCode={game.roomCode}
            settings={serverSettings ?? game.settings}
            chatMessages={roomId ? websocket.chatMessages : game.chatMessages}
            isHost={roomId ? isLiveHost : isHost}
            onStartGame={roomId ? websocket.nextPhase : startGame}
            onKickPlayer={roomId ? websocket.kickPlayer : kickPlayer}
            onSettingsChange={roomId ? (settings) => {
              websocket.updateSettings({
                total_rounds: settings.totalRounds,
                bluff_time: settings.bluffTime,
                vote_time: settings.voteTime,
                max_players: settings.maxPlayers,
                language: settings.language,
              });
            } : updateSettings}
            onSendMessage={roomId ? websocket.sendChatMessage : sendChatMessage}
            showMockChatTyping={!roomId}
            connectionState={roomId ? websocketConnectionState(websocket.connectionState) : connectionState}
            connectionError={roomId ? websocket.error : null}
            onLeaveRoom={leaveRoom}
          />
        );
      case "CATEGORY":
        return (
          <CategoryPhase
            currentRound={categoryRound}
            totalRounds={
              websocket.categoryPhase?.total_rounds ??
              serverSettings?.totalRounds ??
              game.totalRounds
            }
            duration={roomId ? websocket.categoryPhase?.duration : undefined}
            categories={websocket.categoryPhase?.categories.map((category) => ({
              id: category.id,
              name: category.name,
              imageUrl: category.image_url,
            }))}
            selectedCategory={game.selectedCategory}
            onSelectCategory={selectCategory}
            onSelectCategoryOption={roomId ? requestQuestion : undefined}
            canChoose={isCategoryChooser}
            chooserName={categoryChooser?.name}
            language={roomLanguage}
          />
        );
      case "TRAP":
        return (
          <TrapPhase
            players={activePlayers}
            question={liveQuestion ?? game.currentQuestion}
            currentRound={websocket.questionPhase?.round ?? game.currentRound}
            totalRounds={websocket.questionPhase?.total_rounds ?? game.totalRounds}
            answer={roomId ? websocket.bluffAnswer : game.submittedTrapAnswer}
            language={roomId ? roomLanguage : (game.settings.language ?? "en")}
            submitted={roomId ? websocket.bluffSubmitted : game.playerSubmitted}
            onAnswerChange={roomId ? websocket.setBluffAnswer : (answer) =>
              setGame((current) => ({
                ...current,
                submittedTrapAnswer: answer,
              }))
            }
            onSubmitAnswer={roomId ? websocket.submitBluff : submitTrapAnswer}
          />
        );
      case "VOTING":
        return (
          <VotingPhase
            players={activePlayers}
            question={liveVotingQuestion ?? game.currentQuestion}
            options={websocket.votingPhase?.choices ?? game.votingOptions}
            selectedVote={roomId ? websocket.selectedVote : game.selectedVote}
            hasVoted={roomId ? websocket.voteSubmitted : game.playerVoted}
            seconds={websocket.votingPhase?.duration ?? game.timeRemaining}
            onCastVote={roomId ? websocket.submitVote : castVote}
            language={roomLanguage}
          />
        );
      case "RESULTS_REVEAL":
        return (roomId ? liveReveal : game.revealState) ? (
          <ResultsRevealPhase
            reveal={(roomId ? liveReveal : game.revealState)!}
            isHost={roomId ? isLiveHost : isHost}
            onShowResults={roomId ? websocket.showResults : () =>
              setGame((current) => ({
                ...current,
                currentPhase: "ROUND_RESULTS",
              }))
            }
            language={roomLanguage}
          />
        ) : (
          <div className="mx-auto w-full max-w-4xl px-4 py-8">
            <WaitingArena
              players={game.players}
              message="WAITING FOR RESULTS"
            />
          </div>
        );
      case "ROUND_RESULTS":
        return (
          <RoundResultsPhase
            players={activePlayers}
            results={roomId && liveRoundResults ? liveRoundResults : game.roundStandings}
            currentRound={websocket.resultsRevealed?.round ?? game.currentRound}
            totalRounds={websocket.resultsRevealed?.total_rounds ?? game.totalRounds}
            isHost={roomId ? isLiveHost : isHost}
            onContinue={roomId ? websocket.nextPhase : continueAfterRound}
          />
        );
      case "FINAL_RESULTS":
        return (
          <FinalResultsPhase
            players={activePlayers}
            results={roomId && liveFinalResults ? liveFinalResults : game.finalStandings}
            isHost={roomId ? isLiveHost : isHost}
            onPlayAgain={roomId ? websocket.returnToLobby : playAgain}
            onLeaveRoom={leaveRoom}
          />
        );
    }
  }

  if (roomId && websocket.error?.code === "ROOM_NOT_FOUND") {
    return <RoomNotFound />;
  }

  const showHud = activePhase !== "LOBBY";
  const showRoster =
    activePhase !== "LOBBY" &&
    activePhase !== "ROUND_RESULTS" &&
    activePhase !== "FINAL_RESULTS";

  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden bg-background text-foreground">
      {roomId ? <InvitationListener /> : null}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute left-[-12rem] top-[-12rem] size-[min(38rem,60vw)] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-[-14rem] right-[-12rem] size-[min(42rem,65vw)] rounded-full bg-secondary/15 blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-[40vh] bg-gradient-to-b from-white/[0.025] to-transparent" />
      </div>

      {showGameIntro ? <GameIntro round={game.currentRound} /> : null}

      <div className="relative flex min-h-dvh flex-col">
        {showHud ? (
          <GameHud
            round={
              websocket.resultsRevealed?.round ??
              websocket.votingPhase?.round ??
              websocket.questionPhase?.round ??
              websocket.categoryPhase?.round ??
              (roomId ? (websocket.lobby?.round ?? 1) : game.currentRound)
            }
            totalRounds={
              websocket.resultsRevealed?.total_rounds ??
              websocket.votingPhase?.total_rounds ??
              websocket.questionPhase?.total_rounds ??
              websocket.categoryPhase?.total_rounds ??
              serverSettings?.totalRounds ??
              game.totalRounds
            }
            seconds={
              activePhase === "RESULTS_REVEAL" ? 0 :
              websocket.votingPhase?.duration ??
              websocket.questionPhase?.duration ??
              websocket.categoryPhase?.duration ??
              game.timeRemaining
            }
            roomCode={game.roomCode}
            phase={activePhase}
            timerMode={roomId ? "countdown" : "controlled"}
            chatMessages={roomId ? websocket.chatMessages : game.chatMessages}
            onSendChatMessage={roomId ? websocket.sendChatMessage : sendChatMessage}
            onLeaveRoom={leaveRoom}
          />
        ) : null}

        <FullScreenPhaseTransition phase={activePhase}>
          {(displayedPhase) => (
            <WaitingMotionContext.Provider
              value={displayedPhase === activePhase}
            >
              {renderPhase(displayedPhase)}
            </WaitingMotionContext.Provider>
          )}
        </FullScreenPhaseTransition>

        {showRoster && (
          <PlayerActivityDock players={activePlayers} scores={roomId ? websocket.playerScores : playerScores} />
        )}
      </div>

      {roomId &&
      websocket.error &&
      websocket.connectionState === "CONNECTED" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <ErrorState
            title={displayedError?.title ?? "GAME ERROR"}
            description={displayedError?.message ?? "Something went wrong. Please try again."}
            actionLabel={
              activePhase === "LOBBY" && isLiveHost ? "TRY AGAIN" : "DISMISS"
            }
            onAction={
              activePhase === "LOBBY" && isLiveHost
                ? retryServerAction
                : websocket.clearError
            }
            secondaryActionLabel={
              activePhase === "LOBBY" && isLiveHost ? "DISMISS" : undefined
            }
            onSecondaryAction={websocket.clearError}
            className="bg-card/95 shadow-2xl backdrop-blur-xl"
          />
        </div>
      ) : null}
    </main>
  );
}

function playersForMockState(mockState?: string): Player[] {
  const players = mockGame.players.map((player) => ({ ...player }));
  if (mockState === "lobby-empty") return players.filter((player) => player.role === "HOST");
  if (mockState === "lobby-player") {
    return players.map((player) =>
      player.id === "mehdi"
        ? { ...player, isYou: false }
        : player.id === "alex"
          ? { ...player, isYou: true, role: "PLAYER" }
          : player,
    );
  }
  return players;
}

function lobbyConnectionForMockState(mockState?: string): LobbyConnectionState {
  if (mockState === "lobby-loading") return "joining";
  if (mockState === "lobby-reconnecting") return "reconnecting";
  if (mockState === "lobby-connection-lost") return "failed";
  if (mockState === "lobby-restored") return "restored";
  return "connected";
}

function websocketConnectionState(state: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR"): LobbyConnectionState {
  if (state === "CONNECTED") return "connected";
  if (state === "CONNECTING") return "connecting";
  return "failed";
}

function createInitialState(
  roomCode: string,
  currentPhase: GamePhase = mockGame.phase,
  mockState?: string,
): MockGameFlowState {
  const state: MockGameFlowState = {
    currentPhase,
    roomCode,
    settings: { ...mockGame.settings },
    players: playersForMockState(mockState),
    chatMessages: mockState === "lobby-empty" ? [] : mockChatMessages.map((message) => ({ ...message })),
    currentRound: 1,
    totalRounds: mockGame.totalRounds,
    selectedCategory: null,
    currentQuestion: questionForRound(1),
    submittedTrapAnswer: "",
    votingOptions: [],
    selectedVote: null,
    playerSubmitted: false,
    playerVoted: false,
    revealState: null,
    roundStandings: mockRoundStandings,
    finalStandings: mockGameFinalStandings,
    timeRemaining: mockGame.settings.bluffTime,
  };

  if (!mockState || mockState.startsWith("lobby-")) return state;

  if (mockState === "category-waiting") {
    state.currentPhase = "CATEGORY";
    state.players = playersForMockState("lobby-player");
    return state;
  }

  if (mockState === "trap-normal") state.currentPhase = "TRAP";
  if (mockState === "trap-submitted" || mockState === "trap-timeout") {
    state.currentPhase = "TRAP";
    state.submittedTrapAnswer = mockState === "trap-timeout" ? "No answer submitted" : "The Royal Observatory";
    state.playerSubmitted = true;
  }

  if (mockState.startsWith("voting-") || mockState === "reveal") {
    state.currentPhase = mockState === "reveal" ? "RESULTS_REVEAL" : "VOTING";
    state.submittedTrapAnswer = "The Royal Observatory";
    state.playerSubmitted = true;
  }

  if (state.playerSubmitted && mockState !== "voting-preparing") {
    state.revealState = buildRevealState(state.submittedTrapAnswer, state.players, correctAnswerForQuestion(state.currentQuestion));
    state.votingOptions = buildVotingOptions(state.revealState, state.currentRound);
  }
  if (mockState === "voting-voted") {
    state.selectedVote = state.votingOptions[0]?.id ?? null;
    state.playerVoted = state.selectedVote !== null;
  }
  if (mockState === "voting-timeout") state.timeRemaining = 0;
  if (mockState === "results") state.currentPhase = "ROUND_RESULTS";
  if (mockState === "final") state.currentPhase = "FINAL_RESULTS";
  return state;
}

function advanceExpiredPhase(current: MockGameFlowState): MockGameFlowState {
  if (current.currentPhase === "CATEGORY" && !current.selectedCategory) {
    const fallbackCategory =
      current.currentQuestion.category.toLowerCase() as Category;
    return {
      ...current,
      selectedCategory: fallbackCategory,
      currentPhase: "TRAP",
      timeRemaining: current.settings.bluffTime,
      players: current.players.map((player) =>
        player.status === "OFFLINE"
          ? player
          : { ...player, status: "THINKING" },
      ),
    };
  }

  if (current.currentPhase === "TRAP" && !current.playerSubmitted) {
    const timedOutAnswer = "No answer submitted";
    const revealState = buildRevealState(
      timedOutAnswer,
      current.players,
      correctAnswerForQuestion(current.currentQuestion),
    );
    return {
      ...current,
      submittedTrapAnswer: timedOutAnswer,
      playerSubmitted: true,
      revealState,
      votingOptions: buildVotingOptions(revealState, current.currentRound),
      players: current.players.map((player) =>
        player.isYou ? { ...player, status: "SUBMITTED" } : player,
      ),
    };
  }

  return current;
}

function getCategoryChooser(players: Player[], round: number): Player | null {
  const availablePlayers = players.filter((player) => player.status !== "OFFLINE");
  if (availablePlayers.length === 0) return null;

  const chooserIndex = (Math.max(1, round) - 1) % availablePlayers.length;
  return availablePlayers[chooserIndex] ?? null;
}

function resetRound(
  current: MockGameFlowState,
  nextRound: number,
): MockGameFlowState {
  return {
    ...current,
    currentPhase: "CATEGORY",
    currentRound: nextRound,
    selectedCategory: null,
    currentQuestion: questionForRound(nextRound),
    submittedTrapAnswer: "",
    votingOptions: [],
    selectedVote: null,
    playerSubmitted: false,
    playerVoted: false,
    revealState: null,
    timeRemaining: current.settings.bluffTime,
  };
}

function questionForRound(round: number, category?: Category): Question {
  const categoryQuestion = category
    ? mockQuestions.find(
        (question) => question.category.toLowerCase() === category,
      )
    : undefined;
  const question =
    categoryQuestion ?? mockQuestions[(round - 1) % mockQuestions.length];

  if (!question) {
    throw new Error(
      "At least one mock question is required to start the game.",
    );
  }

  return {
    ...question,
    category: category ? category.toUpperCase() : question.category,
  };
}

function buildRevealState(
  submittedAnswer: string,
  players: Player[],
  correctAnswer: string,
): AnswerReveal {
  const currentPlayer = players.find((player) => player.isYou);
  const playerIds = new Set(players.map((player) => player.id));
  const submissions = mockAnswerReveal.submissions
    .filter((submission) => playerIds.has(submission.author.id))
    .map((submission) =>
      submission.author.id === currentPlayer?.id
        ? { ...submission, text: submittedAnswer }
        : submission,
    );

  if (
    currentPlayer &&
    !submissions.some((submission) => submission.author.id === currentPlayer.id)
  ) {
    submissions.push({
      id: `trap_${currentPlayer.id}`,
      text: submittedAnswer,
      author: {
        id: currentPlayer.id,
        name: currentPlayer.name,
        avatar: currentPlayer.avatar,
      },
    });
  }

  return {
    correctAnswer,
    submissions,
  };
}

const correctAnswersByQuestionId: Record<Question["id"], string> = {
  "history-printing": "The Inca civilization",
  "science-element": "Tungsten",
  "geography-capital": "Peru",
  "sports-trophy": "Uruguay",
  "gaming-character": "Jumpman",
  "movies-award": "Wings",
  "music-instrument": "The piano",
};

function correctAnswerForQuestion(question: Question) {
  return correctAnswersByQuestionId[question.id] ?? mockAnswerReveal.correctAnswer;
}

function buildVotingOptions(
  reveal: AnswerReveal,
  round: number,
): VotingOption[] {
  const answerTexts = [
    reveal.correctAnswer,
    ...reveal.submissions.map((submission) => submission.text),
  ];
  const offset = answerTexts.length > 0 ? round % answerTexts.length : 0;
  const randomized = [
    ...answerTexts.slice(offset),
    ...answerTexts.slice(0, offset),
  ];

  return randomized.map((text, index) => ({
    id: `choice_${round}_${String(index + 1).padStart(2, "0")}`,
    text,
  }));
}
