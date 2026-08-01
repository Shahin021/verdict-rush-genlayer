import { randomUUID } from "node:crypto";
import { getRedis } from "./redis";
import {
  sortLeaderboard,
  type PlayerResult,
  type StoredRoom,
} from "./v5-room-model";

const ROOM_KEY_PREFIX = "verdict-rush:v5:room:";
const LOCK_KEY_PREFIX = "verdict-rush:v5:lock:";
const LOCK_TTL_MS = 10_000;
const LOCK_ATTEMPTS = 40;
const LOCK_RETRY_MS = 50;

export class RoomStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function normalizeRoomId(roomId: string): string {
  const normalized = roomId.trim().toUpperCase();

  if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
    throw new RoomStoreError(
      "INVALID_ROOM_ID",
      "roomId is invalid.",
    );
  }

  return normalized;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

export function getRoomKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${normalizeRoomId(roomId)}`;
}

function getLockKey(roomId: string): string {
  return `${LOCK_KEY_PREFIX}${normalizeRoomId(roomId)}`;
}

export async function getStoredRoom(
  roomId: string,
): Promise<StoredRoom | null> {
  const redis = getRedis();

  return redis.get<StoredRoom>(getRoomKey(roomId));
}

export async function createStoredRoom(
  room: StoredRoom,
): Promise<boolean> {
  const redis = getRedis();
  const key = getRoomKey(room.room_id);

  const result = await redis.set(key, room, {
    nx: true,
  });

  return result === "OK";
}

async function withRoomLock(
  roomId: string,
  mutate: (
    room: StoredRoom,
  ) => StoredRoom | Promise<StoredRoom>,
): Promise<StoredRoom> {
  const redis = getRedis();
  const roomKey = getRoomKey(roomId);
  const lockKey = getLockKey(roomId);
  const lockToken = randomUUID();

  let acquired = false;

  for (
    let attempt = 0;
    attempt < LOCK_ATTEMPTS;
    attempt += 1
  ) {
    const result = await redis.set(
      lockKey,
      lockToken,
      {
        nx: true,
        px: LOCK_TTL_MS,
      },
    );

    if (result === "OK") {
      acquired = true;
      break;
    }

    await wait(LOCK_RETRY_MS);
  }

  if (!acquired) {
    throw new RoomStoreError(
      "ROOM_BUSY",
      "The room is busy. Please try again.",
    );
  }

  try {
    const room =
      await redis.get<StoredRoom>(roomKey);

    if (!room) {
      throw new RoomStoreError(
        "ROOM_NOT_FOUND",
        "Room was not found.",
      );
    }

    room.players = Array.isArray(room.players)
      ? room.players
      : [];

    room.leaderboard = Array.isArray(
      room.leaderboard,
    )
      ? room.leaderboard
      : [];

    room.player_results =
      room.player_results &&
      !Array.isArray(room.player_results)
        ? room.player_results
        : {};

    const updated = await mutate(room);

    updated.revision =
      Number(updated.revision || 0) + 1;

    await redis.set(roomKey, updated);

    return updated;
  } finally {
    const releaseScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;

    await redis.eval(
      releaseScript,
      [lockKey],
      [lockToken],
    );
  }
}

export async function joinStoredRoom(input: {
  roomId: string;
  playerId: string;
  displayName: string;
  accessTag: string;
  now: number;
}): Promise<StoredRoom> {
  return withRoomLock(
    input.roomId,
    (room) => {
      if (
        room.is_private &&
        room.access_tag !== input.accessTag
      ) {
        throw new RoomStoreError(
          "INVALID_ACCESS_CODE",
          "Invalid private room code.",
        );
      }

      const existing = room.players.find(
        (player) =>
          player.player_id === input.playerId,
      );

      if (existing) {
        return room;
      }

      if (room.status !== "waiting") {
        throw new RoomStoreError(
          "ROOM_ALREADY_STARTED",
          "This match has already started.",
        );
      }

      room.players.push({
        player_id: input.playerId,
        display_name: input.displayName,
        joined_at: input.now,
      });

      return room;
    },
  );
}

export async function startStoredRoom(input: {
  roomId: string;
  hostPlayerId: string;
  durationSeconds: number;
  now: number;
}): Promise<StoredRoom> {
  return withRoomLock(
    input.roomId,
    (room) => {
      if (
        room.host_player_id !==
        input.hostPlayerId
      ) {
        throw new RoomStoreError(
          "NOT_HOST",
          "Only the host can start this room.",
        );
      }

      if (room.status === "started") {
        return room;
      }

      if (room.status === "finished") {
        throw new RoomStoreError(
          "ROOM_FINISHED",
          "This room is already finished.",
        );
      }

      room.status = "started";
      room.started_at = input.now;
      room.ends_at =
        input.now + input.durationSeconds;
      room.submission_deadline =
        room.ends_at + 15;
      room.finished_at = 0;

      return room;
    },
  );
}

export async function submitStoredPlayer(input: {
  roomId: string;
  playerId: string;
  result: PlayerResult;
  now: number;
}): Promise<StoredRoom> {
  return withRoomLock(
    input.roomId,
    (room) => {
      if (room.player_results[input.playerId]) {
        return room;
      }

      if (room.status !== "started") {
        throw new RoomStoreError(
          "ROOM_NOT_STARTED",
          "The match is not accepting submissions.",
        );
      }

      if (
        room.submission_deadline > 0 &&
        input.now > room.submission_deadline
      ) {
        throw new RoomStoreError(
          "SUBMISSION_DEADLINE_PASSED",
          "The submission deadline has passed.",
        );
      }

      const player = room.players.find(
        (candidate) =>
          candidate.player_id === input.playerId,
      );

      if (!player) {
        throw new RoomStoreError(
          "PLAYER_NOT_FOUND",
          "Player is not in this room.",
        );
      }

      const result: PlayerResult = {
        ...input.result,
        display_name: player.display_name,
      };

      room.player_results[input.playerId] =
        result;

      room.leaderboard.push({
        player_id: input.playerId,
        display_name: player.display_name,
        score: result.score,
        submitted: true,
      });

      room.leaderboard = sortLeaderboard(
        room.leaderboard,
      );

      room.submitted_count =
        room.leaderboard.length;

      if (
        room.submitted_count >=
        room.players.length
      ) {
        room.status = "finished";
        room.finished_at = input.now;
      }

      return room;
    },
  );
}

export async function finalizeStoredRoom(input: {
  roomId: string;
  questionCount: number;
  now: number;
}): Promise<StoredRoom> {
  return withRoomLock(
    input.roomId,
    (room) => {
      if (room.status === "finished") {
        return room;
      }

      if (room.status !== "started") {
        throw new RoomStoreError(
          "ROOM_NOT_STARTED",
          "The match has not started.",
        );
      }

      if (
        room.submission_deadline === 0 ||
        input.now < room.submission_deadline
      ) {
        throw new RoomStoreError(
          "SUBMISSION_WINDOW_OPEN",
          "The submission window is still open.",
        );
      }

      for (const player of room.players) {
        if (
          room.player_results[player.player_id]
        ) {
          continue;
        }

        const answers = Array.from(
          { length: input.questionCount },
          (_, questionIndex) => ({
            question_index: questionIndex,
            choice: -1,
            rank_position: 4,
            base_score: 0,
            speed_bonus: 0,
            score: 0,
          }),
        );

        room.player_results[player.player_id] = {
          room_id: room.room_id,
          game_id: room.game_id,
          player_id: player.player_id,
          display_name: player.display_name,
          score: 0,
          answers,
          submitted_at: input.now,
          auto_finalized: true,
        };

        room.leaderboard.push({
          player_id: player.player_id,
          display_name: player.display_name,
          score: 0,
          submitted: false,
        });
      }

      room.leaderboard = sortLeaderboard(
        room.leaderboard,
      );

      room.submitted_count =
        room.leaderboard.length;
      room.status = "finished";
      room.finished_at = input.now;

      return room;
    },
  );
}