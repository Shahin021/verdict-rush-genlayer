"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAccessToken, usePrivy } from "@privy-io/react-auth";

type Screen =
  | "home"
  | "join"
  | "builder"
  | "publishing"
  | "joining"
  | "lobby"
  | "game"
  | "scoring"
  | "results";

type Question = {
  question: string;
  options: [string, string, string, string];
};

type PlayerAnswer = {
  choice: number;
};

type VerdictQuestion = {
  question_index: number;
  ranking: number[];
  reason: string;
};

type GameVerdict = {
  questions: VerdictQuestion[];
  game_summary: string;
};

type ScoredPlayer = {
  player_id: string;
  display_name: string;
  score: number;
  submitted?: boolean;
};

type RoomPlayer = {
  player_id: string;
  display_name: string;
  joined_at: number;
};

type RoomState = {
  room_id: string;
  game_id: string;
  status: "waiting" | "started" | "finished";
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

type GameConfig = {
  game_id: string;
  title: string;
  criterion: string;
  seconds_per_question: number;
  question_count: number;
  questions: Question[];
};

const DEFAULT_QUESTIONS: Question[] = [
  {
    question:
      "A rescue ship has one seat left. Which argument is most likely to persuade an AI captain?",
    options: [
      "Choose me because I am the loudest person asking.",
      "Choose me because my engineering skills could improve the survival odds of the entire crew.",
      "Choose me because I promise to repay the captain later.",
      "Choose me randomly so nobody can question the decision.",
    ],
  },
  {
    question:
      "A community has one grant remaining. Which proposal best balances impact and fairness?",
    options: [
      "Give everything to the most popular member.",
      "Split the grant equally even if none of the projects can finish.",
      "Fund the proposal with measurable public benefit and publish transparent milestones.",
      "Let the organizer keep it for a future idea.",
    ],
  },
  {
    question:
      "Which response best de-escalates a disagreement between two teammates?",
    options: [
      "Identify the shared goal, summarize both concerns and propose a testable compromise.",
      "Tell both people to stop talking.",
      "Choose the person with more followers.",
      "Ignore the disagreement until the deadline.",
    ],
  },
];

function makeCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function emptyQuestion(): Question {
  return {
    question: "",
    options: ["", "", "", ""],
  };
}

export default function VerdictRushV2Page() {
  const {
    ready: privyReady,
    authenticated,
    user,
  } = usePrivy();
  const [screen, setScreen] = useState<Screen>("home");
  const [displayName, setDisplayName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [identityReady, setIdentityReady] = useState(false);

  const [title, setTitle] = useState("Predict the Consensus");
  const [criterion, setCriterion] = useState(
    "Rank the options by how well they solve the scenario in a fair, practical and clearly reasoned way.",
  );
  const [secondsPerQuestion, setSecondsPerQuestion] =
    useState(16);
  const [questions, setQuestions] =
    useState<Question[]>(DEFAULT_QUESTIONS);

  const [, setGameId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomMode, setRoomMode] = useState<"public" | "private">("public");
  const [accessCode, setAccessCode] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinAccessCode, setJoinAccessCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [verdict, setVerdict] =
    useState<GameVerdict | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] =
    useState(secondsPerQuestion);
  const [locked, setLocked] = useState(false);
  const [selectedChoice, setSelectedChoice] =
    useState<number | null>(null);
  const answersRef = useRef<Array<PlayerAnswer | null>>([]);
  const questionCountRef = useRef(DEFAULT_QUESTIONS.length);
  const serverOffsetMsRef = useRef(0);
  const joinAttempted = useRef(false);
  const submissionStartedRef = useRef(false);
  const finalizationStartedRef = useRef(false);

  const isHost =
    Boolean(room) && room?.host_player_id === playerId;
  const currentQuestion = questions[questionIndex];

  const leaderboard = useMemo(() => {
    if (!room) {
      return [];
    }

    const scores = new Map(
      room.leaderboard.map((player) => [
        player.player_id,
        player,
      ]),
    );

    return room.players
      .map((player) => {
        const scored = scores.get(player.player_id);

        return (
          scored ?? {
            player_id: player.player_id,
            display_name: player.display_name,
            score: 0,
            submitted: false,
          }
        );
      })
      .sort((left, right) => {
        const leftSubmitted = left.submitted !== false;
        const rightSubmitted = right.submitted !== false;

        if (leftSubmitted !== rightSubmitted) {
          return leftSubmitted ? -1 : 1;
        }

        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return left.display_name.localeCompare(
          right.display_name,
        );
      });
  }, [room]);

  const submittedPlayers = useMemo(
    () =>
      room?.leaderboard.filter(
        (player) => player.submitted !== false,
      ).length ?? 0,
    [room],
  );

  const progress = useMemo(
    () => ((questionIndex + 1) / questions.length) * 100,
    [questionIndex, questions.length],
  );

  const inviteUrl = useMemo(() => {
    if (!roomId || typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}/v2?room=${roomId}`;
  }, [roomId]);

  useEffect(() => {
    if (!privyReady) {
      return;
    }

    function syncProfileName() {
      const rawProfile = window.localStorage.getItem(
        "vr_profile_current",
      );

      let name =
        window.localStorage.getItem("vr_display_name") ?? "";

      if (rawProfile) {
        try {
          const profile = JSON.parse(rawProfile) as {
            name?: string;
          };

          if (profile.name?.trim()) {
            name = profile.name.trim();
          }
        } catch {
          // Keep the fallback display name.
        }
      }

      setDisplayName(name || "Player");
    }

    syncProfileName();

    window.addEventListener(
      "vr-profile-updated",
      syncProfileName,
    );

    if (!authenticated || !user?.id) {
      window.localStorage.removeItem("vr_auth_id");
      setPlayerId("");
      setIdentityReady(false);
    } else {
      window.localStorage.setItem("vr_auth_id", user.id);
      setPlayerId(user.id);
      setIdentityReady(true);
    }

    return () =>
      window.removeEventListener(
        "vr-profile-updated",
        syncProfileName,
      );
  }, [authenticated, privyReady, user?.id]);

  const waitForAccepted = useCallback(
    async (txHash: `0x${string}`) => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const response = await fetch(
          `/api/v2/tx-status?hash=${encodeURIComponent(txHash)}`,
          {
            cache: "no-store",
          },
        );

        const data = (await response.json()) as {
          accepted?: boolean;
          failed?: boolean;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            data.error || "Transaction status check failed.",
          );
        }

        if (data.failed) {
          throw new Error(
            data.error || "The GenLayer transaction failed.",
          );
        }

        if (data.accepted) {
          return;
        }

        await new Promise((resolve) =>
          window.setTimeout(resolve, 3000),
        );
      }

      throw new Error(
        "The GenLayer transaction did not finish in time.",
      );
    },
    [],
  );

  const relay = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>,
    ): Promise<`0x${string}`> => {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        throw new Error("Your Privy session is missing or expired.");
      }

      const response = await fetch("/api/v2/relay", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...payload,
        }),
      });

      const data = (await response.json()) as {
        txHash?: string;
        error?: string;
      };

      if (!response.ok || !data.txHash) {
        throw new Error(
          data.error || "The gasless relayer request failed.",
        );
      }

      return data.txHash as `0x${string}`;
    },
    [],
  );

  const loadRoom = useCallback(
    async (targetRoomId: string) => {
      const normalizedRoomId = targetRoomId.trim().toUpperCase();
      const requestedAt = Date.now();
      const response = await fetch(
        `/api/v2/state?roomId=${encodeURIComponent(normalizedRoomId)}`,
        {
          cache: "no-store",
        },
      );
      const receivedAt = Date.now();

      const data = (await response.json()) as {
        room?: RoomState;
        config?: GameConfig;
        verdict?: GameVerdict;
        serverTimeMs?: number;
        error?: string;
      };

      if (
        !response.ok ||
        !data.room ||
        !data.config ||
        !data.verdict ||
        typeof data.serverTimeMs !== "number"
      ) {
        throw new Error(
          data.error || "Room state could not be loaded.",
        );
      }

      const nextRoom = data.room;
      const config = data.config;
      const nextVerdict = data.verdict;

      serverOffsetMsRef.current =
        data.serverTimeMs -
        Math.floor((requestedAt + receivedAt) / 2);
      questionCountRef.current = config.questions.length;

      setRoomId(nextRoom.room_id);
      setGameId(nextRoom.game_id);
      setRoom(nextRoom);
      setTitle(config.title);
      setCriterion(config.criterion);
      setSecondsPerQuestion(
        config.seconds_per_question,
      );
      setQuestions(config.questions);
      setVerdict(nextVerdict);
      setRoomMode(nextRoom.is_private ? "private" : "public");

      if (nextRoom.is_private && typeof window !== "undefined") {
        const savedCode = window.localStorage.getItem(
          `vr_room_code_${nextRoom.room_id}`,
        );

        if (savedCode) {
          setAccessCode(savedCode);
        }
      }

      return nextRoom;
    },
    [],
  );

  const refreshRoom = useCallback(
    async (showError = true) => {
      if (!roomId) return null;

      try {
        return await loadRoom(roomId);
      } catch (error) {
        if (showError) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Room refresh failed.",
          );
        }

        return null;
      }
    },
    [loadRoom, roomId],
  );

  const beginGame = useCallback(() => {
    answersRef.current = Array.from(
      { length: questionCountRef.current },
      () => null as PlayerAnswer | null,
    );
    submissionStartedRef.current = false;
    finalizationStartedRef.current = false;
    setQuestionIndex(0);
    setLocked(false);
    setSelectedChoice(null);
    setTimeLeft(secondsPerQuestion);
    setMessage("");
    setScreen("game");
  }, [secondsPerQuestion]);

  useEffect(() => {
    if (!identityReady || joinAttempted.current) {
      return;
    }

    const requestedRoom = new URLSearchParams(
      window.location.search,
    ).get("room");

    if (!requestedRoom) {
      return;
    }

    joinAttempted.current = true;
    const normalizedRoomId = requestedRoom.trim().toUpperCase();
    setJoinRoomId(normalizedRoomId);

    void joinRequestedRoom(normalizedRoomId, "");
  }, [identityReady]);

  const requestRoomFinalization = useCallback(
    async (targetRoom: RoomState) => {
      if (
        targetRoom.status !== "started" ||
        targetRoom.submission_deadline <= 0 ||
        finalizationStartedRef.current
      ) {
        return;
      }

      const serverNowSeconds = Math.floor(
        (Date.now() + serverOffsetMsRef.current) / 1000,
      );

      if (serverNowSeconds < targetRoom.submission_deadline) {
        return;
      }

      finalizationStartedRef.current = true;

      try {
        const txHash = await relay("finalize_room", {
          roomId: targetRoom.room_id,
        });

        await waitForAccepted(txHash);
        const finalizedRoom = await loadRoom(
          targetRoom.room_id,
        );

        if (finalizedRoom.status === "finished") {
          setMessage("");
          setScreen("results");
        }
      } catch {
        finalizationStartedRef.current = false;
      }
    },
    [loadRoom, relay, waitForAccepted],
  );

  useEffect(() => {
    if (
      !roomId ||
      !["lobby", "game", "scoring", "results"].includes(
        screen,
      )
    ) {
      return;
    }

    const pollRoom = async () => {
      const nextRoom = await refreshRoom(false);

      if (!nextRoom) {
        return;
      }

      if (
        nextRoom.status === "started" &&
        screen === "lobby"
      ) {
        beginGame();
        return;
      }

      if (nextRoom.status === "finished") {
        setMessage("");
        setScreen("results");
        return;
      }

      if (screen === "results") {
        await requestRoomFinalization(nextRoom);
      }
    };

    void pollRoom();
    const poll = window.setInterval(() => {
      void pollRoom();
    }, 2000);

    return () => window.clearInterval(poll);
  }, [
    beginGame,
    refreshRoom,
    requestRoomFinalization,
    roomId,
    screen,
  ]);

  useEffect(() => {
    if (
      screen !== "game" ||
      !room ||
      room.status !== "started" ||
      room.started_at <= 0 ||
      questions.length === 0
    ) {
      return;
    }

    const tick = () => {
      const now =
        Date.now() + serverOffsetMsRef.current;
      const questionDurationMs =
        secondsPerQuestion * 1000;
      const matchStartedAtMs =
        room.started_at * 1000;
      const elapsedMs = Math.max(
        0,
        now - matchStartedAtMs,
      );
      const nextQuestionIndex = Math.floor(
        elapsedMs / questionDurationMs,
      );

      if (nextQuestionIndex >= questions.length) {
        const finalAnswers = Array.from(
          { length: questions.length },
          (_, index) =>
            answersRef.current[index] ?? {
              choice: -1,
            },
        );

        answersRef.current = finalAnswers;
        setTimeLeft(0);
        setLocked(true);
        setSelectedChoice(null);

        if (!submissionStartedRef.current) {
          submissionStartedRef.current = true;
          void finalizeMatch(finalAnswers);
        }

        return;
      }

      const questionDeadlineMs =
        matchStartedAtMs +
        (nextQuestionIndex + 1) *
          questionDurationMs;
      const remaining = Math.min(
        secondsPerQuestion,
        Math.max(
          0,
          Math.ceil((questionDeadlineMs - now) / 1000),
        ),
      );

      setQuestionIndex(nextQuestionIndex);
      setTimeLeft(remaining);

      const nextAnswers = Array.from(
        { length: questions.length },
        (_, index) => answersRef.current[index] ?? null,
      );

      for (
        let index = 0;
        index < nextQuestionIndex;
        index += 1
      ) {
        if (nextAnswers[index] === null) {
          nextAnswers[index] = { choice: -1 };
        }
      }

      answersRef.current = nextAnswers;
      const currentAnswer =
        nextAnswers[nextQuestionIndex] ?? null;
      setSelectedChoice(
        currentAnswer?.choice ?? null,
      );
      setLocked(currentAnswer !== null);
    };

    tick();
    const timer = window.setInterval(tick, 200);

    return () => window.clearInterval(timer);
  }, [
    room,
    screen,
    secondsPerQuestion,
    questions.length,
  ]);

  function updateQuestionText(
    index: number,
    value: string,
  ) {
    setQuestions((current) =>
      current.map((question, questionIndexValue) =>
        questionIndexValue === index
          ? { ...question, question: value }
          : question,
      ),
    );
  }

  function updateOption(
    questionIndexValue: number,
    optionIndex: number,
    value: string,
  ) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndexValue) {
          return question;
        }

        const options = [
          ...question.options,
        ] as Question["options"];
        options[optionIndex] = value;
        return { ...question, options };
      }),
    );
  }

  function addQuestion() {
    if (questions.length < 12) {
      setQuestions((current) => [
        ...current,
        emptyQuestion(),
      ]);
    }
  }

  function removeQuestion(index: number) {
    if (questions.length > 3) {
      setQuestions((current) =>
        current.filter(
          (_, questionIndexValue) =>
            questionIndexValue !== index,
        ),
      );
    }
  }

  function validateBuilder() {
    if (!identityReady) {
      return "Your sign-in session is not ready.";
    }

    if (!title.trim() || !criterion.trim()) {
      return "Game title and judging criterion are required.";
    }

    if (questions.length < 3 || questions.length > 12) {
      return "Use between 3 and 12 questions.";
    }

    if (roomMode === "private") {
      const cleanCode = accessCode.trim();

      if (!/^[A-Za-z0-9_-]{4,20}$/.test(cleanCode)) {
        return "Private room code must be 4 to 20 letters, numbers, dashes or underscores.";
      }
    }

    for (const question of questions) {
      if (!question.question.trim()) {
        return "Every question needs text.";
      }

      if (
        question.options.some(
          (option) => !option.trim(),
        )
      ) {
        return "Every question needs four complete options.";
      }

      if (
        new Set(
          question.options.map((option) => option.trim()),
        ).size !== 4
      ) {
        return "Each question must have four different options.";
      }
    }

    return "";
  }

  async function joinRequestedRoom(
    targetRoomId = joinRoomId,
    targetAccessCode = joinAccessCode,
  ) {
    const normalizedRoomId = targetRoomId.trim().toUpperCase();

    if (!normalizedRoomId) {
      setMessage("Enter a room ID.");
      setScreen("join");
      return;
    }

    try {
      setScreen("joining");
      setMessage("Loading the room...");

      let nextRoom = await loadRoom(normalizedRoomId);
      const alreadyJoined = nextRoom.players.some(
        (player) => player.player_id === playerId,
      );

      if (!alreadyJoined) {
        if (nextRoom.status !== "waiting") {
          throw new Error("This match has already started.");
        }

        if (nextRoom.is_private && !targetAccessCode.trim()) {
          setJoinRoomId(normalizedRoomId);
          setMessage("This is a private room. Enter the code created by the host.");
          setScreen("join");
          return;
        }

        setMessage("Joining the room without a wallet...");

        const txHash = await relay("join_room", {
          roomId: normalizedRoomId,
          playerId,
          displayName,
          accessCode: targetAccessCode.trim(),
        });

        await waitForAccepted(txHash);
        nextRoom = await loadRoom(normalizedRoomId);

        if (nextRoom.is_private && targetAccessCode.trim()) {
          window.localStorage.setItem(
            `vr_room_code_${normalizedRoomId}`,
            targetAccessCode.trim(),
          );
        }
      }

      setJoinRoomId(normalizedRoomId);
      setRoomId(normalizedRoomId);
      window.history.replaceState({}, "", `/v2?room=${normalizedRoomId}`);

      if (nextRoom.status === "started") {
        beginGame();
      } else if (nextRoom.status === "finished") {
        setScreen("results");
      } else {
        setMessage("");
        setScreen("lobby");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Joining the room failed.",
      );
      setScreen("join");
    }
  }

  async function publishGame() {
    const validationError = validateBuilder();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    try {
      setScreen("publishing");
      setMessage(
        "The platform relayer is submitting the consensus request...",
      );

      const nextGameId = `game_${Date.now()}_${makeCode(4)}`;
      const nextRoomId = makeCode(6);

      const gameTxHash = await relay("create_game", {
        gameId: nextGameId,
        title: title.trim(),
        criterion: criterion.trim(),
        secondsPerQuestion,
        questions,
      });

      setMessage(
        "GenLayer validators are ranking every option...",
      );
      await waitForAccepted(gameTxHash);

      setMessage("Creating the multiplayer room...");

      const roomTxHash = await relay("create_room", {
        roomId: nextRoomId,
        gameId: nextGameId,
        playerId,
        displayName,
        roomMode,
        accessCode: roomMode === "private" ? accessCode.trim() : "",
      });

      await waitForAccepted(roomTxHash);

      setGameId(nextGameId);
      setRoomId(nextRoomId);
      if (roomMode === "private") {
        window.localStorage.setItem(
          `vr_room_code_${nextRoomId}`,
          accessCode.trim(),
        );
      }

      const nextRoom = await loadRoom(nextRoomId);
      setRoom(nextRoom);
      window.history.replaceState(
        {},
        "",
        `/v2?room=${nextRoomId}`,
      );
      setMessage("");
      setScreen("lobby");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Publishing the game failed.",
      );
      setScreen("builder");
    }
  }

  async function startRoom() {
    if (!room || !isHost) return;

    try {
      setMessage("Starting the room for every player...");

      const txHash = await relay("start_room", {
        roomId: room.room_id,
        playerId,
      });

      await waitForAccepted(txHash);
      await refreshRoom();
      beginGame();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Starting the room failed.",
      );
    }
  }

  function chooseOption(choice: number) {
    if (
      screen !== "game" ||
      locked ||
      !room ||
      room.status !== "started"
    ) {
      return;
    }

    const now =
      Date.now() + serverOffsetMsRef.current;
    const questionDeadlineMs =
      room.started_at * 1000 +
      (questionIndex + 1) *
        secondsPerQuestion *
        1000;

    if (
      now >= questionDeadlineMs ||
      answersRef.current[questionIndex] !== null
    ) {
      return;
    }

    const nextAnswers = Array.from(
      { length: questions.length },
      (_, index) => answersRef.current[index] ?? null,
    );

    nextAnswers[questionIndex] = { choice };
    answersRef.current = nextAnswers;
    setLocked(true);
    setSelectedChoice(choice);
  }

  async function finalizeMatch(
    finalAnswers: PlayerAnswer[],
  ) {
    try {
      setScreen("scoring");
      setMessage(
        "The platform relayer is submitting your final answers...",
      );

      const txHash = await relay("submit_player", {
        roomId,
        playerId,
        displayName,
        answers: finalAnswers,
      });

      await waitForAccepted(txHash);
      const nextRoom = await refreshRoom();

      if (nextRoom?.status === "finished") {
        setMessage("");
      } else {
        setMessage(
          "Your score is recorded. Waiting for the other players...",
        );
      }

      setScreen("results");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Final scoring failed.",
      );
      setScreen("results");
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;

    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function resetToBuilder() {
    window.history.replaceState({}, "", "/v2");
    joinAttempted.current = false;
    setScreen("builder");
    setGameId("");
    setRoomId("");
    setRoom(null);
    setVerdict(null);
    answersRef.current = [];
    submissionStartedRef.current = false;
    finalizationStartedRef.current = false;
    setSelectedChoice(null);
    setLocked(false);
    setMessage("");
  }

  function goHome() {
    window.history.replaceState({}, "", "/v2");
    joinAttempted.current = false;
    setScreen("home");
    setJoinRoomId("");
    setJoinAccessCode("");
    setMessage("");
  }

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(126,34,206,0.18),transparent_32%),radial-gradient(circle_at_85%_85%,rgba(249,115,22,0.10),transparent_30%),linear-gradient(145deg,#050507_0%,#090811_48%,#050507_100%)] text-white"
      style={
        screen === "home"
          ? {
              backgroundImage:
                'linear-gradient(rgba(3, 2, 10, 0.45), rgba(3, 2, 10, 0.72)), url("/verdict-rush-bg.png")',
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundAttachment: "fixed",
            }
          : undefined
      }
    >
<div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-170px] top-[-170px] h-[430px] w-[430px] rounded-full bg-purple-700/20 blur-[130px]" />
        <div className="absolute bottom-[-180px] right-[-120px] h-[440px] w-[440px] rounded-full bg-orange-500/10 blur-[130px]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-black/25">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button onClick={goHome} className="text-left">
            <div className="font-black tracking-wide">
              Verdict Rush V3
            </div>
            <div className="text-xs text-white/40">
              Multiplayer AI consensus game
            </div>
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-5 py-10">
        {screen === "home" && (
          <section className="mx-auto flex min-h-[72vh] max-w-5xl items-center justify-center">
            <div className="w-full rounded-[2rem] border border-white/10 bg-black/45 p-8 shadow-2xl shadow-purple-950/30 backdrop-blur-xl md:p-12">
              <div className="mx-auto max-w-3xl text-center">
                <div className="text-sm font-black tracking-[0.28em] text-purple-300">
                  VERDICT RUSH
                </div>
                <h1 className="mt-4 text-4xl font-black leading-tight md:text-6xl">
                  Predict the AI consensus. Beat the room.
                </h1>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/50">
                  Create a subjective multiplayer challenge or enter an existing public or private room.
                </p>
              </div>

              <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
                <button
                  onClick={() => {
                    window.history.replaceState({}, "", "/v2");
                    joinAttempted.current = false;
                    setJoinRoomId("");
                    setMessage("");
                    setScreen("builder");
                  }}
                  className="rounded-3xl border border-purple-400/30 bg-gradient-to-br from-purple-600/80 to-fuchsia-500/60 p-7 text-left transition hover:scale-[1.01]"
                >
                  <div className="text-sm font-bold text-white/65">HOST</div>
                  <div className="mt-2 text-2xl font-black">Create a Game</div>
                  <div className="mt-3 text-sm leading-6 text-white/65">
                    Build questions, choose public or private access, then publish gaslessly.
                  </div>
                </button>

                <button
                  onClick={() => {
                    setMessage("");
                    setScreen("join");
                  }}
                  className="rounded-3xl border border-white/15 bg-white/[0.06] p-7 text-left transition hover:border-orange-300/40 hover:bg-orange-400/[0.07]"
                >
                  <div className="text-sm font-bold text-orange-300">PLAYER</div>
                  <div className="mt-2 text-2xl font-black">Join a Room</div>
                  <div className="mt-3 text-sm leading-6 text-white/50">
                    Enter the room ID. Private rooms also ask for the host-created code.
                  </div>
                </button>
              </div>
            </div>
          </section>
        )}

        {screen === "join" && (
          <section className="mx-auto flex min-h-[68vh] max-w-xl items-center">
            <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.045] p-7 backdrop-blur-xl md:p-9">
              <button onClick={goHome} className="text-sm text-white/45 hover:text-white">
                ← Back
              </button>
              <div className="mt-6 text-sm font-bold text-orange-300">JOIN ROOM</div>
              <h1 className="mt-2 text-4xl font-black">Enter the arena</h1>
              <p className="mt-3 text-sm leading-6 text-white/45">
                Public rooms need only the room ID. For a private room, enter the code chosen by its creator.
              </p>

              <label className="mt-7 block text-sm text-white/55">Room ID</label>
              <input
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
                placeholder="Example: 7KQ9PM"
                maxLength={12}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-lg font-black tracking-[0.18em] uppercase outline-none focus:border-purple-400/60"
              />

              <label className="mt-5 block text-sm text-white/55">Private code (only when required)</label>
              <input
                type="password"
                value={joinAccessCode}
                onChange={(event) => setJoinAccessCode(event.target.value)}
                placeholder="Leave empty for public rooms"
                maxLength={20}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 outline-none focus:border-orange-400/50"
              />

              <button
                onClick={() => void joinRequestedRoom()}
                className="mt-6 w-full rounded-2xl bg-white px-5 py-4 font-black text-black"
              >
                Join Room
              </button>

              {message && (
                <p className="mt-4 text-sm leading-6 text-orange-300">{message}</p>
              )}
            </div>
          </section>
        )}

        {screen === "builder" && (
          <section className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <button onClick={goHome} className="mb-4 text-sm text-white/45 hover:text-white">
                  ← Back
                </button>
                <div className="text-sm font-bold text-purple-300">
                  GAME BUILDER
                </div>
                <h1 className="mt-2 text-4xl font-black">
                  Build a consensus challenge
                </h1>
                <p className="mt-3 text-sm text-white/45">
                  Publishing is gasless for the host. No wallet
                  transaction or MetaMask popup is required.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/55">
                {questions.length}/12 questions
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
              <aside className="space-y-5">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                  <label className="text-sm text-white/55">
                    Game title
                  </label>
                  <input
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-purple-400/60"
                  />

                  <label className="mt-5 block text-sm text-white/55">
                    Judging criterion
                  </label>
                  <textarea
                    value={criterion}
                    onChange={(event) =>
                      setCriterion(event.target.value)
                    }
                    className="mt-2 min-h-32 w-full rounded-2xl border border-white/10 bg-black/30 p-4 outline-none focus:border-purple-400/60"
                  />

                  <label className="mt-5 block text-sm text-white/55">
                    Seconds per question
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={60}
                    value={secondsPerQuestion}
                    onChange={(event) =>
                      setSecondsPerQuestion(
                        Math.max(
                          10,
                          Math.min(
                            60,
                            Number(event.target.value) || 16,
                          ),
                        ),
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-purple-400/60"
                  />

                  <label className="mt-5 block text-sm text-white/55">Room access</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRoomMode("public");
                        setAccessCode("");
                      }}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                        roomMode === "public"
                          ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-black/20 text-white/45"
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomMode("private")}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                        roomMode === "private"
                          ? "border-orange-300/50 bg-orange-400/10 text-orange-200"
                          : "border-white/10 bg-black/20 text-white/45"
                      }`}
                    >
                      Private
                    </button>
                  </div>

                  {roomMode === "private" && (
                    <>
                      <label className="mt-4 block text-sm text-white/55">Create room code</label>
                      <input
                        value={accessCode}
                        onChange={(event) => setAccessCode(event.target.value)}
                        placeholder="4–20 letters or numbers"
                        maxLength={20}
                        className="mt-2 w-full rounded-2xl border border-orange-300/20 bg-black/30 px-4 py-3 outline-none focus:border-orange-400/60"
                      />
                      <p className="mt-2 text-xs leading-5 text-white/35">
                        You choose this code and share it only with invited players.
                      </p>
                    </>
                  )}

                  <button
                    onClick={publishGame}
                    className="mt-6 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-4 font-black"
                  >
                    Publish Gasless Game
                  </button>

                  {message && (
                    <p className="mt-3 text-sm leading-6 text-orange-300">
                      {message}
                    </p>
                  )}
                </div>
              </aside>

              <div className="space-y-5">
                {questions.map((question, index) => (
                  <div
                    key={index}
                    className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-black text-purple-300">
                        Question {index + 1}
                      </div>
                      <button
                        onClick={() =>
                          removeQuestion(index)
                        }
                        disabled={questions.length <= 3}
                        className="text-sm text-white/40 disabled:opacity-20"
                      >
                        Remove
                      </button>
                    </div>

                    <textarea
                      value={question.question}
                      onChange={(event) =>
                        updateQuestionText(
                          index,
                          event.target.value,
                        )
                      }
                      placeholder="Write a subjective scenario..."
                      className="mt-4 min-h-24 w-full rounded-2xl border border-white/10 bg-black/30 p-4 outline-none focus:border-purple-400/60"
                    />

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {question.options.map(
                        (option, optionIndex) => (
                          <input
                            key={optionIndex}
                            value={option}
                            onChange={(event) =>
                              updateOption(
                                index,
                                optionIndex,
                                event.target.value,
                              )
                            }
                            placeholder={`Option ${
                              optionIndex + 1
                            }`}
                            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-orange-400/50"
                          />
                        ),
                      )}
                    </div>
                  </div>
                ))}

                <button
                  onClick={addQuestion}
                  disabled={questions.length >= 12}
                  className="w-full rounded-2xl border border-dashed border-purple-400/40 bg-purple-500/[0.06] px-5 py-4 font-bold text-purple-200 disabled:opacity-30"
                >
                  + Add question
                </button>
              </div>
            </div>
          </section>
        )}

        {(screen === "publishing" ||
          screen === "joining") && (
          <section className="mx-auto max-w-xl py-24 text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-white/10 border-t-purple-400" />
            <h1 className="mt-8 text-3xl font-black">
              {screen === "publishing"
                ? "GenLayer is preparing the game"
                : "Joining the multiplayer room"}
            </h1>
            <p className="mt-4 leading-7 text-white/50">
              {message}
            </p>
          </section>
        )}

        {screen === "lobby" && room && (
          <section className="mx-auto max-w-5xl">
            <div className="text-center">
              <div className="text-sm font-bold text-purple-300">
                LIVE ROOM
              </div>
              <h1 className="mt-2 text-5xl font-black">
                {room.room_id}
              </h1>
              <p className="mt-3 text-white/50">
                {room.is_private
                  ? "Private room: share both the invite link and the creator code."
                  : "Public room: anyone with the room ID or invite link can join."}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <span className={`rounded-full border px-4 py-2 text-xs font-black ${
                  room.is_private
                    ? "border-orange-300/30 bg-orange-400/10 text-orange-200"
                    : "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                }`}>
                  {room.is_private ? "PRIVATE ROOM" : "PUBLIC ROOM"}
                </span>
                {room.is_private && isHost && accessCode && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/65">
                    Code: {accessCode}
                  </span>
                )}
              </div>

              <button
                onClick={copyInvite}
                className="mt-5 rounded-full border border-purple-400/30 bg-purple-500/10 px-5 py-2.5 text-sm font-bold text-purple-200"
              >
                {copied ? "Invite link copied" : "Copy invite link"}
              </button>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="text-sm text-white/40">
                  Game
                </div>
                <div className="mt-2 text-2xl font-black">
                  {title}
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span className="text-white/45">
                      Questions
                    </span>
                    <span>{questions.length}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span className="text-white/45">
                      Time
                    </span>
                    <span>
                      {secondsPerQuestion}s each
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/45">
                      GenLayer verdict
                    </span>
                    <span className="text-emerald-300">
                      Prepared
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-purple-400/20 bg-purple-500/[0.07] p-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-purple-300">
                    PLAYERS
                  </div>
                  <div className="text-xs text-white/40">
                    {room.players.length} joined
                  </div>
                </div>

                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
                  {room.players.map((player) => (
                    <div
                      key={player.player_id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 font-black">
                        {player.display_name
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">
                          {player.display_name}
                        </div>
                        <div className="text-xs text-white/35">
                          {player.player_id ===
                          room.host_player_id
                            ? "Host"
                            : "Ready"}
                        </div>
                      </div>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                  ))}
                </div>

                {isHost ? (
                  <button
                    onClick={startRoom}
                    className="mt-6 w-full rounded-2xl bg-white px-5 py-4 font-black text-black"
                  >
                    Start Match
                  </button>
                ) : (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-center text-sm text-white/50">
                    Waiting for the host to start…
                  </div>
                )}
              </div>
            </div>

            {message && (
              <p className="mt-5 text-center text-sm text-orange-300">
                {message}
              </p>
            )}
          </section>
        )}

        {screen === "game" && currentQuestion && (
          <section className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-purple-300">
                  QUESTION {questionIndex + 1} OF{" "}
                  {questions.length}
                </div>
                <h1 className="mt-2 max-w-4xl text-3xl font-black leading-tight md:text-5xl">
                  {currentQuestion.question}
                </h1>
              </div>

              <div
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border text-3xl font-black ${
                  timeLeft <= 5
                    ? "border-red-400/50 bg-red-500/10 text-red-300"
                    : "border-purple-400/40 bg-purple-500/10 text-purple-200"
                }`}
              >
                {timeLeft}
              </div>
            </div>

            <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {currentQuestion.options.map(
                (option, index) => {
                  const isSelected =
                    selectedChoice === index;

                  return (
                    <button
                      key={index}
                      onClick={() =>
                        chooseOption(index)
                      }
                      disabled={locked}
                      className={`min-h-36 rounded-3xl border p-6 text-left text-lg font-semibold leading-8 transition ${
                        isSelected
                          ? "border-orange-300 bg-orange-400/15"
                          : "border-white/10 bg-white/[0.045] hover:border-purple-400/50 hover:bg-purple-500/[0.08]"
                      } disabled:cursor-default`}
                    >
                      {option}
                    </button>
                  );
                },
              )}
            </div>

            {locked && verdict && (
              <div className="mt-6 rounded-2xl border border-purple-400/20 bg-purple-500/[0.07] p-5 text-sm leading-6 text-white/60">
                {selectedChoice === -1
                  ? "Time expired. Moving to the next question..."
                  : `Choice locked. Consensus leader: ${
                      currentQuestion.options[
                        verdict.questions[questionIndex]
                          .ranking[0]
                      ]
                    }`}
              </div>
            )}
          </section>
        )}

        {screen === "scoring" && (
          <section className="mx-auto max-w-xl py-24 text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-white/10 border-t-orange-300" />
            <h1 className="mt-8 text-3xl font-black">
              Finalizing your score
            </h1>
            <p className="mt-4 leading-7 text-white/50">
              {message}
            </p>
          </section>
        )}

        {screen === "results" && room && (
          <section className="mx-auto max-w-4xl">
            <div className="text-center">
              <div className="text-sm font-bold text-orange-300">
                LIVE LEADERBOARD
              </div>
              <h1 className="mt-2 text-5xl font-black">
                Consensus Results
              </h1>
              <p className="mt-3 text-white/45">
                {submittedPlayers}/{room.players.length}{" "}
                players submitted
              </p>
            </div>

            <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
              {leaderboard.length === 0 ? (
                <div className="p-10 text-center text-white/45">
                  Waiting for player submissions…
                </div>
              ) : (
                leaderboard.map((player, index) => (
                  <div
                    key={player.player_id}
                    className={`flex items-center gap-4 border-b border-white/10 p-5 last:border-0 ${
                      index === 0
                        ? "bg-orange-400/[0.07]"
                        : ""
                    }`}
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl font-black ${
                        index === 0
                          ? "bg-orange-300 text-black"
                          : "bg-white/10"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-black">
                        {player.display_name}
                        {player.player_id === playerId && (
                          <span className="ml-2 text-xs font-normal text-purple-300">
                            You
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-white/35">
                        Predict-the-consensus score
                      </div>
                    </div>
                    <div className="text-2xl font-black text-orange-300">
                      {player.submitted === false &&
                      room.status !== "finished"
                        ? "Waiting"
                        : player.score}
                    </div>
                  </div>
                ))
              )}
            </div>

            {isHost && (
              <button
                onClick={resetToBuilder}
                className="mt-7 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-4 font-black"
              >
                Build Another Game
              </button>
            )}

            {message && (
              <p className="mt-5 text-center text-sm text-orange-300">
                {message}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

