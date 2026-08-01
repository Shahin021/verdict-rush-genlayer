import { createHmac } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RelayBody = {
  action?: string;
  gameId?: string;
  roomId?: string;
  displayName?: string;
  title?: string;
  criterion?: string;
  secondsPerQuestion?: number;
  questions?: unknown;
  answers?: unknown;
  roomMode?: string;
  accessCode?: string;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isRetryableBackpressure(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error);

  return (
    message.includes(
      "Node is not currently accepting transactions",
    ) || message.includes("pipeline backpressure")
  );
}

async function writeWithBackpressureRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 10,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isRetryableBackpressure(error) ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * attempt),
      );
    }
  }

  throw new Error("Relayer retry limit reached.");
}
function requiredString(
  value: unknown,
  name: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new HttpError(`${name} is required.`, 400);
  }

  const clean = value.trim();

  if (!clean || clean.length > maxLength) {
    throw new HttpError(`${name} is invalid.`, 400);
  }

  return clean;
}

function makeAccessTag(roomId: string, accessCode: string): string {
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
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  if (!match?.[1]) {
    throw new HttpError("Privy authentication is required.", 401);
  }

  return match[1];
}

async function getAuthenticatedPlayerId(
  request: Request,
): Promise<string> {
  const appId =
    process.env.PRIVY_APP_ID ||
    process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

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

export async function POST(request: Request) {
  try {
    const privateKey =
      process.env.GENLAYER_RELAYER_PRIVATE_KEY;
    const contractAddress =
      (process.env.VERDICT_RUSH_V4_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_VERDICT_RUSH_V4_CONTRACT_ADDRESS || "0x295ab506D7FBe704aE30BC2685396ddf22bA9536").trim();

    if (
      !privateKey ||
      !/^0x[0-9a-fA-F]{64}$/.test(privateKey)
    ) {
      throw new HttpError(
        "GENLAYER_RELAYER_PRIVATE_KEY is missing or invalid.",
        500,
      );
    }

    if (
      !contractAddress ||
      !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)
    ) {
      throw new HttpError(
        "VERDICT_RUSH_V4_CONTRACT_ADDRESS is missing or invalid.",
        500,
      );
    }

    const playerId =
      await getAuthenticatedPlayerId(request);

    const body = (await request.json()) as RelayBody;
    const action = requiredString(
      body.action,
      "action",
      32,
    );

    if (action !== "create_game") {
      throw new HttpError(
        "Room actions are handled by the Redis room API.",
        400,
      );
    }

    const account = createAccount(
      privateKey as `0x${string}`,
    );

    const client = createClient({
      chain: testnetBradbury,
      account,
    });

    let functionName = "";
    let args: any[] = [];

    if (action === "create_game") {
      const gameId = requiredString(
        body.gameId,
        "gameId",
        64,
      );
      const title = requiredString(
        body.title,
        "title",
        120,
      );
      const criterion = requiredString(
        body.criterion,
        "criterion",
        600,
      );
      const seconds = Number(body.secondsPerQuestion);

      if (
        !Number.isInteger(seconds) ||
        seconds < 10 ||
        seconds > 60
      ) {
        throw new HttpError(
          "secondsPerQuestion must be between 10 and 60.",
          400,
        );
      }

      if (!Array.isArray(body.questions)) {
        throw new HttpError(
          "questions must be an array.",
          400,
        );
      }

      functionName = "create_game";
      args = [
        gameId,
        title,
        criterion,
        seconds,
        JSON.stringify(body.questions),
      ];
    } else if (action === "create_room") {
      const roomId = requiredString(
        body.roomId,
        "roomId",
        12,
      ).toUpperCase();

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

      const isPrivate = roomMode === "private";
      const accessCode =
        typeof body.accessCode === "string"
          ? body.accessCode.trim()
          : "";

      if (
        isPrivate &&
        !/^[A-Za-z0-9_-]{4,20}$/.test(accessCode)
      ) {
        throw new HttpError(
          "Private room code is invalid.",
          400,
        );
      }

      functionName = "create_room";
      args = [
        roomId,
        requiredString(body.gameId, "gameId", 64),
        playerId,
        requiredString(
          body.displayName,
          "displayName",
          24,
        ),
        isPrivate,
        isPrivate
          ? makeAccessTag(roomId, accessCode)
          : "",
      ];
    } else if (action === "join_room") {
      const roomId = requiredString(
        body.roomId,
        "roomId",
        12,
      ).toUpperCase();

      const accessCode =
        typeof body.accessCode === "string"
          ? body.accessCode.trim()
          : "";

      functionName = "join_room";
      args = [
        roomId,
        playerId,
        requiredString(
          body.displayName,
          "displayName",
          24,
        ),
        accessCode
          ? makeAccessTag(roomId, accessCode)
          : "",
      ];
    } else if (action === "start_room") {
      functionName = "start_room";
      args = [
        requiredString(
          body.roomId,
          "roomId",
          12,
        ).toUpperCase(),
        playerId,
      ];
    } else if (action === "submit_player") {
      if (!Array.isArray(body.answers)) {
        throw new HttpError(
          "answers must be an array.",
          400,
        );
      }

      functionName = "submit_player";
      args = [
        requiredString(
          body.roomId,
          "roomId",
          12,
        ).toUpperCase(),
        playerId,
        requiredString(
          body.displayName,
          "displayName",
          24,
        ),
        JSON.stringify(body.answers),
      ];
    } else if (action === "finalize_room") {
      functionName = "finalize_room";
      args = [
        requiredString(
          body.roomId,
          "roomId",
          12,
        ).toUpperCase(),
      ];
    } else {
      throw new HttpError(
        "Unsupported relay action.",
        400,
      );
    }

    const txHash = await writeWithBackpressureRetry(() =>
      client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName,
        args,
        value: BigInt(0),
      }),
    );

    return NextResponse.json({ txHash });
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Relayer request failed.",
      },
      { status },
    );
  }
}

