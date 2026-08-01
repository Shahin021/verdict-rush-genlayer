export type PlayerAnswer = {
  choice: number;
};

export type VerdictQuestion = {
  question_index: number;
  ranking: number[];
  reason: string;
};

export type GameVerdict = {
  questions: VerdictQuestion[];
  game_summary: string;
};

export type Question = {
  question: string;
  options: [string, string, string, string];
};

export type GameConfig = {
  game_id: string;
  title: string;
  criterion: string;
  seconds_per_question: number;
  question_count: number;
  questions: Question[];
};

export type RoomPlayer = {
  player_id: string;
  display_name: string;
  joined_at: number;
};

export type ScoredPlayer = {
  player_id: string;
  display_name: string;
  score: number;
  submitted: boolean;
};

export type RoomStatus =
  | "waiting"
  | "started"
  | "finished";

export type RoomState = {
  room_id: string;
  game_id: string;
  status: RoomStatus;
  host_player_id: string;
  host_display_name: string;
  players: RoomPlayer[];
  leaderboard: ScoredPlayer[];
  submitted_count: number;
  created_at: number;
  started_at: number;
  ends_at: number;
  submission_deadline: number;
  finished_at: number;
  is_private: boolean;
};

export type StoredRoom = RoomState & {
  access_tag: string;
  revision: number;
  player_results: Record<string, PlayerResult>;
};

export type AnswerResult = {
  question_index: number;
  choice: number;
  rank_position: number;
  base_score: number;
  speed_bonus: number;
  score: number;
};

export type PlayerResult = {
  room_id: string;
  game_id: string;
  player_id: string;
  display_name: string;
  score: number;
  answers: AnswerResult[];
  submitted_at: number;
  auto_finalized: boolean;
};

const BASE_POINTS = [100, 65, 35, 10] as const;

function validateChoice(choice: unknown): number {
  if (
    !Number.isInteger(choice) ||
    typeof choice !== "number" ||
    choice < -1 ||
    choice > 3
  ) {
    throw new Error(
      "Choice must be -1, 0, 1, 2 or 3.",
    );
  }

  return choice;
}

function validateRanking(
  ranking: unknown,
): number[] {
  if (
    !Array.isArray(ranking) ||
    ranking.length !== 4 ||
    ranking.some(
      (value) =>
        !Number.isInteger(value) ||
        value < 0 ||
        value > 3,
    ) ||
    new Set(ranking).size !== 4
  ) {
    throw new Error(
      "Consensus ranking is invalid.",
    );
  }

  return ranking;
}

export function scorePlayerAnswers(input: {
  roomId: string;
  gameId: string;
  playerId: string;
  displayName: string;
  answers: PlayerAnswer[];
  verdict: GameVerdict;
  submittedAt: number;
  autoFinalized?: boolean;
}): PlayerResult {
  const {
    roomId,
    gameId,
    playerId,
    displayName,
    answers,
    verdict,
    submittedAt,
    autoFinalized = false,
  } = input;

  if (
    !Array.isArray(verdict.questions) ||
    answers.length !== verdict.questions.length
  ) {
    throw new Error(
      "Player answer count does not match the game.",
    );
  }

  let totalScore = 0;

  const answerResults = answers.map(
    (answer, questionIndex): AnswerResult => {
      const choice = validateChoice(answer?.choice);

      if (choice === -1) {
        return {
          question_index: questionIndex,
          choice,
          rank_position: 4,
          base_score: 0,
          speed_bonus: 0,
          score: 0,
        };
      }

      const verdictQuestion =
        verdict.questions[questionIndex];

      if (!verdictQuestion) {
        throw new Error(
          "Consensus verdict question is missing.",
        );
      }

      const ranking = validateRanking(
        verdictQuestion.ranking,
      );
      const rankPosition = ranking.indexOf(choice);

      if (rankPosition < 0) {
        throw new Error(
          "Player choice is missing from the ranking.",
        );
      }

      const baseScore = BASE_POINTS[rankPosition];
      const speedBonus = 0;
      const questionScore =
        baseScore + speedBonus;

      totalScore += questionScore;

      return {
        question_index: questionIndex,
        choice,
        rank_position: rankPosition,
        base_score: baseScore,
        speed_bonus: speedBonus,
        score: questionScore,
      };
    },
  );

  return {
    room_id: roomId,
    game_id: gameId,
    player_id: playerId,
    display_name: displayName,
    score: totalScore,
    answers: answerResults,
    submitted_at: submittedAt,
    auto_finalized: autoFinalized,
  };
}

export function sortLeaderboard(
  leaderboard: ScoredPlayer[],
): ScoredPlayer[] {
  return [...leaderboard].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    const leftName = left.display_name.toLowerCase();
    const rightName = right.display_name.toLowerCase();

    if (leftName < rightName) return -1;
    if (leftName > rightName) return 1;
    return 0;
  });
}
export function toPublicRoom(
  room: StoredRoom,
): RoomState {
  return {
    room_id: room.room_id,
    game_id: room.game_id,
    status: room.status,
    host_player_id: room.host_player_id,
    host_display_name: room.host_display_name,
    players: Array.isArray(room.players)
      ? room.players
      : [],
    leaderboard: Array.isArray(room.leaderboard)
      ? room.leaderboard
      : [],
    submitted_count: room.submitted_count,
    created_at: room.created_at,
    started_at: room.started_at,
    ends_at: room.ends_at,
    submission_deadline: room.submission_deadline,
    finished_at: room.finished_at,
    is_private: room.is_private,
  };
}