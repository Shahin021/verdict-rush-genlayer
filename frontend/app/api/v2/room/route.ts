import { createHmac } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  scorePlayerAnswers,
  toPublicRoom,
  type GameConfig,
  type GameVerdict,
  type PlayerAnswer,
  type StoredRoom,
} from "../../../../lib/v5-room-model";
import {
  RoomStoreError,
  createStoredRoom,
  finalizeStoredRoom,
  getStoredRoom,
  joinStoredRoom,
  startStoredRoom,
  submitStoredPlayer,
} from "../../../../lib/v5-room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomBody = {
  action?: string;
  gameId?: string;
  roomId?: string;
  displayName?: string;
  roomMode?: string;
  accessCode?: string;
  answers?: unknown;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function requiredString(
  value: unknown,
  name: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new HttpError(
      `${name} is required.`,
      400,
    );
  }

  const clean = value.trim();

  if (!clean || clean.length > maxLength) {
    throw new HttpError(
      `${name} is invalid.`,
      400,
    );
  }

  return clean;
}

function normalizeRoomId(value: unknown): string {
  const roomId = requiredString(
    value,
    "roomId",
    12,
  ).toUpperCase();

  if (!/^[A-Z0-9]{4,12}$/.test(roomId)) {
    throw new HttpError(
      "roomId is invalid.",
      400,
    );
  }

  return roomId;
}

function makeAccessTag(
  roomId: string,
  accessCode: string,
): string {
  if (!accessCode) {
    return "";
  }

  const secret = process.env.ROOM_ACCESS_SECRET;

  if (!secret || secret.length < 32) {
    throw new HttpError(
      "ROOM_ACCESS_SECRET is missing or too short.",
      500,
    );
  }

  return createHmac("sha256", secret)
    .update(`${roomId}:${accessCode}`)
    .digest("hex");
}

function getBearerToken(request: Request): string {
  const authorization =
    request.headers.get("authorization");

  const match = authorization?.match(
    /^Bearer\s+([^\s]+)$/i,
  );

  if (!match?.[1]) {
    throw new HttpError(
      "Privy authentication is required.",
      401,
    );
  }

  return match[1];
}

async function getAuthenticatedPlayerId(
  request: Request,
): Promise<string> {
  const appId =
    process.env.PRIVY_APP_ID ||
    process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  const appSecret =
    process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new HttpError(
      "Privy server credentials are missing.",
      500,
    );
  }

  const accessToken = getBearerToken(request);

  const privy = new PrivyClient({
    appId,
    appSecret,
  });

  try {
    const claim = await privy
      .utils()
      .auth()
      .verifyAuthToken(accessToken);

    return requiredString(
      claim.user_id,
      "authenticated playerId",
      96,
    );
  } catch {
    throw new HttpError(
      "Your Privy session is invalid or expired.",
      401,
    );
  }
}

function getContractAddress(): `0x${string}` {
  const address = (
    process.env
      .VERDICT_RUSH_V4_CONTRACT_ADDRESS ||
    process.env
      .NEXT_PUBLIC_VERDICT_RUSH_V4_CONTRACT_ADDRESS ||
    "0x295ab506D7FBe704aE30BC2685396ddf22bA9536"
  ).trim();

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new HttpError(
      "VERDICT_RUSH_V4_CONTRACT_ADDRESS is invalid.",
      500,
    );
  }

  return address as `0x${string}`;
}

function parseContractJson<T>(
  value: unknown,
  label: string,
): T {
  const text = String(value ?? "");

  if (!text) {
    throw new HttpError(
      `${label} was not found.`,
      404,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(
      `${label} returned invalid JSON.`,
      502,
    );
  }
}

async function readGameData(
  gameId: string,
): Promise<{
  config: GameConfig;
  verdict: GameVerdict;
}> {
  const client = createClient({
    chain: studionet,
  });

  const address = getContractAddress();

  const [configRaw, verdictRaw] =
    await Promise.all([
      client.readContract({
        address,
        functionName: "get_game_config",
        args: [gameId],
      }),
      client.readContract({
        address,
        functionName: "get_game_verdict",
        args: [gameId],
      }),
    ]);

  return {
    config: parseContractJson<GameConfig>(
      configRaw,
      "Game configuration",
    ),
    verdict: parseContractJson<GameVerdict>(
      verdictRaw,
      "Consensus verdict",
    ),
  };
}

function roomStoreStatus(
  error: RoomStoreError,
): number {
  if (error.code === "ROOM_NOT_FOUND") {
    return 404;
  }

  if (
    error.code === "INVALID_ACCESS_CODE" ||
    error.code === "NOT_HOST" ||
    error.code === "PLAYER_NOT_FOUND"
  ) {
    return 403;
  }

  if (error.code === "ROOM_BUSY") {
    return 503;
  }

  return 409;
}

export async function POST(request: Request) {
  try {
    const playerId =
      await getAuthenticatedPlayerId(request);

    const body =
      (await request.json()) as RoomBody;

    const action = requiredString(
      body.action,
      "action",
      32,
    );

    const now = Math.floor(Date.now() / 1000);

    if (action === "create_room") {
      const roomId = normalizeRoomId(
        body.roomId,
      );

      const gameId = requiredString(
        body.gameId,
        "gameId",
        64,
      );

      const displayName = requiredString(
        body.displayName,
        "displayName",
        24,
      );

      if (displayName.length < 2) {
        throw new HttpError(
          "Display name must contain 2 to 24 characters.",
          400,
        );
      }

      const roomMode = requiredString(
        body.roomMode,
        "roomMode",
        16,
      );

      if (
        roomMode !== "public" &&
        roomMode !== "private"
      ) {
        throw new HttpError(
          "roomMode must be public or private.",
          400,
        );
      }

      const accessCode =
        typeof body.accessCode === "string"
          ? body.accessCode.trim()
          : "";

      if (
        roomMode === "private" &&
        !/^[A-Za-z0-9_-]{4,20}$/.test(
          accessCode,
        )
      ) {
        throw new HttpError(
          "Private room code is invalid.",
          400,
        );
      }

      await readGameData(gameId);

      const room: StoredRoom = {
        room_id: roomId,
        game_id: gameId,
        status: "waiting",
        host_player_id: playerId,
        host_display_name: displayName,
        players: [
          {
            player_id: playerId,
            display_name: displayName,
            joined_at: now,
          },
        ],
        leaderboard: [],
        submitted_count: 0,
        created_at: now,
        started_at: 0,
        ends_at: 0,
        submission_deadline: 0,
        finished_at: 0,
        is_private:
          roomMode === "private",
        access_tag:
          roomMode === "private"
            ? makeAccessTag(
                roomId,
                accessCode,
              )
            : "",
        revision: 1,
        player_results: {},
      };

      const created =
        await createStoredRoom(room);

      if (!created) {
        throw new HttpError(
          "Room already exists.",
          409,
        );
      }

      return NextResponse.json({
        room: toPublicRoom(room),
      });
    }

    if (action === "join_room") {
      const roomId = normalizeRoomId(
        body.roomId,
      );

      const displayName = requiredString(
        body.displayName,
        "displayName",
        24,
      );

      if (displayName.length < 2) {
        throw new HttpError(
          "Display name must contain 2 to 24 characters.",
          400,
        );
      }

      const accessCode =
        typeof body.accessCode === "string"
          ? body.accessCode.trim()
          : "";

      const room = await joinStoredRoom({
        roomId,
        playerId,
        displayName,
        accessTag: accessCode
          ? makeAccessTag(roomId, accessCode)
          : "",
        now,
      });

      return NextResponse.json({
        room: toPublicRoom(room),
      });
    }

    if (action === "start_room") {
      const roomId = normalizeRoomId(
        body.roomId,
      );

      const existing =
        await getStoredRoom(roomId);

      if (!existing) {
        throw new HttpError(
          "Room was not found.",
          404,
        );
      }

      const { config } =
        await readGameData(existing.game_id);

      const durationSeconds =
        config.question_count *
        config.seconds_per_question;

      if (
        !Number.isInteger(durationSeconds) ||
        durationSeconds <= 0
      ) {
        throw new HttpError(
          "Game duration is invalid.",
          502,
        );
      }

      const room = await startStoredRoom({
        roomId,
        hostPlayerId: playerId,
        durationSeconds,
        now,
      });

      return NextResponse.json({
        room: toPublicRoom(room),
      });
    }

    if (action === "submit_player") {
      const roomId = normalizeRoomId(
        body.roomId,
      );

      if (!Array.isArray(body.answers)) {
        throw new HttpError(
          "answers must be an array.",
          400,
        );
      }

      const existing =
        await getStoredRoom(roomId);

      if (!existing) {
        throw new HttpError(
          "Room was not found.",
          404,
        );
      }

      const player = existing.players.find(
        (candidate) =>
          candidate.player_id === playerId,
      );

      if (!player) {
        throw new HttpError(
          "Player is not in this room.",
          403,
        );
      }

      const { verdict } =
        await readGameData(existing.game_id);

      const result = scorePlayerAnswers({
        roomId,
        gameId: existing.game_id,
        playerId,
        displayName: player.display_name,
        answers:
          body.answers as PlayerAnswer[],
        verdict,
        submittedAt: now,
      });

      const room =
        await submitStoredPlayer({
          roomId,
          playerId,
          result,
          now,
        });

      return NextResponse.json({
        room: toPublicRoom(room),
        result,
      });
    }

    if (action === "finalize_room") {
      const roomId = normalizeRoomId(
        body.roomId,
      );

      const existing =
        await getStoredRoom(roomId);

      if (!existing) {
        throw new HttpError(
          "Room was not found.",
          404,
        );
      }

      const { config } =
        await readGameData(existing.game_id);

      const room =
        await finalizeStoredRoom({
          roomId,
          questionCount:
            config.question_count,
          now,
        });

      return NextResponse.json({
        room: toPublicRoom(room),
      });
    }

    throw new HttpError(
      "Unsupported room action.",
      400,
    );
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof RoomStoreError
          ? roomStoreStatus(error)
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Room request failed.",
      },
      {
        status,
        headers: {
          "cache-control":
            "no-store, max-age=0",
        },
      },
    );
  }
}