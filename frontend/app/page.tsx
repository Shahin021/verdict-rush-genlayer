"use client";

import { useMemo, useState } from "react";

type Screen = "home" | "lobby" | "game" | "results";

type WeeklyPrompt = {
  title: string;
  prompt: string;
  rule: string;
};

const WEEKLY_PROMPTS: WeeklyPrompt[] = [
  {
    title: "The Last Seat",
    prompt:
      "A rescue ship has one empty seat left. Convince the AI captain to give it to you in no more than three sentences.",
    rule: "Maximum 3 sentences",
  },
  {
    title: "The Impossible Product",
    prompt:
      "Pitch a completely useless invention and make it sound essential to human survival.",
    rule: "Be persuasive and original",
  },
  {
    title: "Human or Machine?",
    prompt:
      "Write one short message that proves you understand humans better than an advanced AI does.",
    rule: "Maximum 280 characters",
  },
];

const DEMO_NAMES = ["Nova", "Kaito", "Mira", "Atlas", "Pixel"];

const XP_REWARDS = [1000, 650, 400, 250, 150, 100];

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function calculateLocalScore(answer: string, round: number) {
  const trimmed = answer.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const lengthScore = Math.min(38, Math.floor(trimmed.length / 4));
  const clarityScore = words >= 8 ? 18 : words * 2;
  const roundVariation = (round + 1) * 3;

  return Math.min(96, 32 + lengthScore + clarityScore + roundVariation);
}

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>("home");
  const [playerName, setPlayerName] = useState("");
  const [activePlayer, setActivePlayer] = useState("Player");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [players, setPlayers] = useState<string[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [judging, setJudging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  const currentPrompt = WEEKLY_PROMPTS[roundIndex];

  const leaderboard = useMemo(
    () =>
      [...players]
        .map((name) => ({
          name,
          score: scores[name] ?? 0,
        }))
        .sort((a, b) => b.score - a.score),
    [players, scores],
  );

  function prepareRoom(code: string) {
    const name = playerName.trim() || "Player 1";
    const initialPlayers = [name, "Nova", "Kaito"];

    setActivePlayer(name);
    setRoomCode(code);
    setPlayers(initialPlayers);
    setScores(
      initialPlayers.reduce<Record<string, number>>((result, player) => {
        result[player] = 0;
        return result;
      }, {}),
    );
    setRoundIndex(0);
    setAnswer("");
    setMessage("");
    setScreen("lobby");
  }

  function createRoom() {
    prepareRoom(makeRoomCode());
  }

  function joinRoom() {
    const normalizedCode = joinCode.trim().toUpperCase();

    if (normalizedCode.length < 4) {
      setMessage("Enter a valid room code first.");
      return;
    }

    prepareRoom(normalizedCode);
  }

  function addDemoPlayer() {
    const nextPlayer = DEMO_NAMES.find((name) => !players.includes(name));

    if (!nextPlayer || players.length >= 500) {
      return;
    }

    setPlayers((current) => [...current, nextPlayer]);
    setScores((current) => ({
      ...current,
      [nextPlayer]: 0,
    }));
  }

  function startGame() {
    setRoundIndex(0);
    setAnswer("");
    setMessage("");
    setScreen("game");
  }

  function submitAnswer() {
    if (!answer.trim() || judging) {
      setMessage("Write an answer before submitting.");
      return;
    }

    setMessage("");
    setJudging(true);

    window.setTimeout(() => {
      const playerRoundScore = calculateLocalScore(answer, roundIndex);

      setScores((current) => {
        const updated = { ...current };

        players.forEach((player, playerIndex) => {
          if (player === activePlayer) {
            updated[player] = (updated[player] ?? 0) + playerRoundScore;
            return;
          }

          const simulatedScore =
            61 +
            ((roundIndex + 1) * 9 + playerIndex * 7 + player.length) % 31;

          updated[player] = (updated[player] ?? 0) + simulatedScore;
        });

        return updated;
      });

      setJudging(false);
      setAnswer("");

      if (roundIndex === WEEKLY_PROMPTS.length - 1) {
        setScreen("results");
      } else {
        setRoundIndex((current) => current + 1);
      }
    }, 1400);
  }

  function copyRoomCode() {
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function playAgain() {
    setScores(
      players.reduce<Record<string, number>>((result, player) => {
        result[player] = 0;
        return result;
      }, {}),
    );
    setRoundIndex(0);
    setAnswer("");
    setScreen("lobby");
  }

  function leaveRoom() {
    setScreen("home");
    setRoomCode("");
    setJoinCode("");
    setPlayers([]);
    setScores({});
    setAnswer("");
    setMessage("");
  }

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute left-[-160px] top-[-160px] h-[420px] w-[420px] rounded-full bg-purple-700/20 blur-[120px]" />
        <div className="absolute bottom-[-190px] right-[-100px] h-[430px] w-[430px] rounded-full bg-orange-500/10 blur-[120px]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button
            onClick={leaveRoom}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10 text-lg font-black text-purple-300">
              V
            </div>

            <div>
              <div className="font-bold tracking-wide">Verdict Rush</div>
              <div className="text-xs text-white/45">
                Powered by GenLayer
              </div>
            </div>
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Weekly challenge active
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-5 py-10 md:py-16">
        {screen === "home" && (
          <div>
            <section className="mx-auto max-w-4xl text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
                Multiplayer subjective AI competition
              </div>

              <h1 className="text-4xl font-black leading-tight md:text-6xl">
                Your answer.
                <span className="block bg-gradient-to-r from-purple-300 via-fuchsia-300 to-orange-300 bg-clip-text text-transparent">
                  The validators decide.
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/60 md:text-lg">
                Join a fast creative battle, submit natural-language answers
                and let GenLayer&apos;s Intelligent Contract reach a consensus
                on the winner.
              </p>
            </section>

            <section className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl backdrop-blur">
                <div className="mb-6">
                  <div className="text-sm font-semibold text-purple-300">
                    HOST A MATCH
                  </div>
                  <h2 className="mt-2 text-2xl font-bold">Create a room</h2>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Generate a private room and invite community members using
                    a six-character code.
                  </p>
                </div>

                <label className="mb-2 block text-sm text-white/70">
                  Display name
                </label>
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-purple-400/60"
                />

                <button
                  onClick={createRoom}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-3.5 font-bold transition hover:scale-[1.01]"
                >
                  Create Game Room
                </button>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl backdrop-blur">
                <div className="mb-6">
                  <div className="text-sm font-semibold text-orange-300">
                    JOIN A MATCH
                  </div>
                  <h2 className="mt-2 text-2xl font-bold">
                    Enter an existing room
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Use the room code shared by the host and enter the weekly
                    challenge.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="Display name"
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-purple-400/60"
                  />

                  <input
                    value={joinCode}
                    onChange={(event) =>
                      setJoinCode(event.target.value.toUpperCase())
                    }
                    placeholder="ROOM CODE"
                    maxLength={6}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono uppercase tracking-[0.18em] outline-none transition focus:border-orange-400/60"
                  />
                </div>

                <button
                  onClick={joinRoom}
                  className="mt-4 w-full rounded-2xl border border-orange-300/30 bg-orange-400/10 px-5 py-3.5 font-bold text-orange-100 transition hover:bg-orange-400/15"
                >
                  Join Room
                </button>

                {message && (
                  <p className="mt-3 text-sm text-orange-300">{message}</p>
                )}
              </div>
            </section>

            <section className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
              {[
                ["01", "Enter a room", "Play with 2–6 community members."],
                [
                  "02",
                  "Submit answers",
                  "Respond to three subjective challenges.",
                ],
                [
                  "03",
                  "Reach consensus",
                  "Validators rank answers and finalize XP.",
                ],
              ].map(([number, title, description]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="text-sm font-black text-purple-300">
                    {number}
                  </div>
                  <div className="mt-3 font-bold">{title}</div>
                  <div className="mt-2 text-sm leading-6 text-white/45">
                    {description}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {screen === "lobby" && (
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <div className="text-sm font-semibold text-purple-300">
                WAITING ROOM
              </div>
              <h1 className="mt-2 text-4xl font-black">Players are gathering</h1>
              <p className="mt-3 text-white/50">
                The host can start as soon as everyone is ready.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <div className="text-sm text-white/40">Room code</div>
                    <div className="mt-1 font-mono text-3xl font-black tracking-[0.2em]">
                      {roomCode}
                    </div>
                  </div>

                  <button
                    onClick={copyRoomCode}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
                  >
                    {copied ? "Copied!" : "Copy code"}
                  </button>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <h2 className="text-xl font-bold">
                    Players ({players.length}/500)
                  </h2>

                  <button
                    onClick={addDemoPlayer}
                    disabled={players.length >= 500}
                    className="text-sm font-semibold text-purple-300 disabled:opacity-30"
                  >
                    + Add demo player
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {players.map((player, index) => (
                    <div
                      key={player}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/40 to-orange-400/30 font-bold">
                        {player.slice(0, 1).toUpperCase()}
                      </div>

                      <div className="flex-1">
                        <div className="font-semibold">{player}</div>
                        <div className="text-xs text-white/40">
                          {index === 0 ? "Host" : "Ready"}
                        </div>
                      </div>

                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                  ))}
                </div>
              </section>

              <aside className="rounded-3xl border border-purple-400/20 bg-purple-500/[0.07] p-6">
                <div className="text-sm font-semibold text-purple-300">
                  THIS WEEK
                </div>
                <h2 className="mt-3 text-2xl font-black">Persuasion Protocol</h2>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  Three short challenges judged for creativity, relevance,
                  clarity and rule compliance.
                </p>

                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span className="text-white/45">Rounds</span>
                    <span className="font-semibold">3</span>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span className="text-white/45">Estimated time</span>
                    <span className="font-semibold">5–10 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/45">Top reward</span>
                    <span className="font-semibold text-orange-300">
                      1,000 XP
                    </span>
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="mt-8 w-full rounded-2xl bg-white px-5 py-3.5 font-black text-black transition hover:scale-[1.01]"
                >
                  Start Match
                </button>
              </aside>
            </div>

            <p className="mt-4 text-center text-xs text-white/30">
              Demo players are temporary placeholders until realtime room sync
              is connected.
            </p>
          </div>
        )}

        {screen === "game" && (
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-purple-300">
                  ROUND {roundIndex + 1} OF {WEEKLY_PROMPTS.length}
                </div>
                <h1 className="mt-1 text-3xl font-black md:text-4xl">
                  {currentPrompt.title}
                </h1>
              </div>

              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">
                Room {roomCode}
              </div>
            </div>

            <div className="mb-7 flex gap-2">
              {WEEKLY_PROMPTS.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 flex-1 rounded-full ${
                    index <= roundIndex ? "bg-purple-500" : "bg-white/10"
                  }`}
                />
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 md:p-8">
                <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.07] p-5">
                  <div className="text-sm font-bold text-purple-300">
                    CHALLENGE
                  </div>
                  <p className="mt-3 text-xl font-semibold leading-8">
                    {currentPrompt.prompt}
                  </p>
                  <div className="mt-4 text-sm text-white/45">
                    Rule: {currentPrompt.rule}
                  </div>
                </div>

                <label className="mt-6 block text-sm font-semibold text-white/70">
                  Your response
                </label>

                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  disabled={judging}
                  placeholder="Write something clever, convincing and human..."
                  maxLength={600}
                  className="mt-2 min-h-44 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 leading-7 outline-none transition focus:border-purple-400/60 disabled:opacity-50"
                />

                <div className="mt-2 flex justify-between text-xs text-white/35">
                  <span>{currentPrompt.rule}</span>
                  <span>{answer.length}/600</span>
                </div>

                {message && (
                  <p className="mt-3 text-sm text-orange-300">{message}</p>
                )}

                <button
                  onClick={submitAnswer}
                  disabled={judging}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-4 font-black transition hover:scale-[1.01] disabled:cursor-wait disabled:opacity-60"
                >
                  {judging
                    ? "Validators are evaluating..."
                    : "Submit to Consensus"}
                </button>
              </section>

              <aside className="space-y-5">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
                  <h2 className="text-lg font-bold">Scoring criteria</h2>

                  <div className="mt-5 space-y-4">
                    {[
                      ["Relevance", "40%"],
                      ["Creativity", "30%"],
                      ["Rule compliance", "20%"],
                      ["Clarity", "10%"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-white/50">{label}</span>
                        <span className="font-bold text-purple-300">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
                  <h2 className="text-lg font-bold">Optimistic Democracy</h2>

                  <div className="mt-5 space-y-3">
                    {[
                      ["1", "Leader proposes verdict"],
                      ["2", "Validators compare results"],
                      ["3", "Consensus finalizes ranking"],
                    ].map(([number, label], index) => (
                      <div
                        key={number}
                        className={`flex items-center gap-3 rounded-xl border p-3 ${
                          judging
                            ? "border-purple-400/30 bg-purple-500/10"
                            : "border-white/10 bg-white/[0.025]"
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                          {number}
                        </div>
                        <div className="text-sm text-white/65">{label}</div>
                        {judging && index === 0 && (
                          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-purple-300" />
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-xs leading-5 text-white/30">
                    Current scoring is a local MVP preview. The production
                    verdict will be written by the GenLayer Intelligent
                    Contract.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        )}

        {screen === "results" && (
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-300/30 bg-orange-400/10 text-3xl">
                🏆
              </div>
              <div className="mt-5 text-sm font-semibold text-orange-300">
                CONSENSUS FINALIZED
              </div>
              <h1 className="mt-2 text-4xl font-black md:text-5xl">
                Final Leaderboard
              </h1>
              <p className="mt-3 text-white/50">
                Three rounds completed. XP distribution is ready.
              </p>
            </div>

            <section className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045]">
              {leaderboard.map((player, index) => (
                <div
                  key={player.name}
                  className={`flex items-center gap-4 border-b border-white/10 p-5 last:border-b-0 ${
                    index === 0 ? "bg-orange-400/[0.07]" : ""
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl font-black ${
                      index === 0
                        ? "bg-orange-300 text-black"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/50 to-fuchsia-400/30 font-bold">
                    {player.name.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">
                      {player.name}
                      {player.name === activePlayer && (
                        <span className="ml-2 text-xs font-normal text-purple-300">
                          You
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-white/40">
                      Consensus score: {player.score}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-black text-orange-300">
                      +{XP_REWARDS[index] ?? 50} XP
                    </div>
                    <div className="mt-1 text-xs text-white/30">
                      Final reward
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                onClick={playAgain}
                className="rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-4 font-black"
              >
                Play Again
              </button>

              <button
                onClick={leaveRoom}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 font-bold"
              >
                Leave Room
              </button>
            </div>

            <div className="mt-8 rounded-2xl border border-purple-400/20 bg-purple-500/[0.06] p-5 text-center text-sm leading-6 text-white/55">
              The next development step connects answer evaluation and final
              ranking to a GenLayer Intelligent Contract using Optimistic
              Democracy.
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 mt-8 border-t border-white/10 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 text-xs text-white/35">
          <span>Verdict Rush MVP</span>
          <span>Intelligent Contracts · Optimistic Democracy · Weekly XP</span>
        </div>
      </footer>
    </div>
  );
}