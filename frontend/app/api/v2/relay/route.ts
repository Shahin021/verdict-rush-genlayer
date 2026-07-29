import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RelayBody = {
  action?: string;
  gameId?: string;
  roomId?: string;
  playerId?: string;
  displayName?: string;
  title?: string;
  criterion?: string;
  secondsPerQuestion?: number;
  questions?: unknown;
  answers?: unknown;
  roomMode?: string;
  accessCode?: string;
};

function requiredString(
  value: unknown,
  name: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${name} is required.`);
  }

  const clean = value.trim();

  if (!clean || clean.length > maxLength) {
    throw new Error(`${name} is invalid.`);
  }

  return clean;
}

function makeAccessTag(roomId: string, accessCode: string): string {
  if (!accessCode) {
    return "";
  }

  const secret = process.env.ROOM_ACCESS_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ROOM_ACCESS_SECRET is missing or too short.");
  }

  return createHmac("sha256", secret)
    .update(`${roomId}:${accessCode}`)
    .digest("hex");
}

export async function POST(request: Request) {
  try {
    const privateKey = process.env.GENLAYER_RELAYER_PRIVATE_KEY;
    const contractAddress =
      process.env.VERDICT_RUSH_V3_CONTRACT_ADDRESS ||
      process.env.NEXT_PUBLIC_VERDICT_RUSH_V3_CONTRACT_ADDRESS;

    if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      return NextResponse.json(
        {
          error:
            "GENLAYER_RELAYER_PRIVATE_KEY is missing or invalid.",
        },
        { status: 500 },
      );
    }

    if (
      !contractAddress ||
      !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)
    ) {
      return NextResponse.json(
        {
          error:
            "VERDICT_RUSH_V3_CONTRACT_ADDRESS is missing or invalid.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as RelayBody;
    const action = requiredString(body.action, "action", 32);
    const account = createAccount(
      privateKey as `0x${string}`,
    );
    const client = createClient({
      chain: studionet,
      account,
    });

    let functionName = "";
    let args: any[] = [];

    if (action === "create_game") {
      const gameId = requiredString(body.gameId, "gameId", 64);
      const title = requiredString(body.title, "title", 120);
      const criterion = requiredString(
        body.criterion,
        "criterion",
        600,
      );
      const seconds = Number(body.secondsPerQuestion);

      if (!Number.isInteger(seconds) || seconds < 10 || seconds > 60) {
        throw new Error(
          "secondsPerQuestion must be between 10 and 60.",
        );
      }

      if (!Array.isArray(body.questions)) {
        throw new Error("questions must be an array.");
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
      const roomId = requiredString(body.roomId, "roomId", 12).toUpperCase();
      const roomMode = requiredString(body.roomMode, "roomMode", 16);
      const isPrivate = roomMode === "private";

      if (roomMode !== "public" && roomMode !== "private") {
        throw new Error("roomMode must be public or private.");
      }

      const accessCode =
        typeof body.accessCode === "string" ? body.accessCode.trim() : "";

      if (isPrivate && !/^[A-Za-z0-9_-]{4,20}$/.test(accessCode)) {
        throw new Error("Private room code is invalid.");
      }

      functionName = "create_room";
      args = [
        roomId,
        requiredString(body.gameId, "gameId", 64),
        requiredString(body.playerId, "playerId", 96),
        requiredString(body.displayName, "displayName", 24),
        isPrivate,
        isPrivate ? makeAccessTag(roomId, accessCode) : "",
      ];
    } else if (action === "join_room") {
      const roomId = requiredString(body.roomId, "roomId", 12).toUpperCase();
      const accessCode =
        typeof body.accessCode === "string" ? body.accessCode.trim() : "";

      functionName = "join_room";
      args = [
        roomId,
        requiredString(body.playerId, "playerId", 96),
        requiredString(body.displayName, "displayName", 24),
        accessCode ? makeAccessTag(roomId, accessCode) : "",
      ];
    } else if (action === "start_room") {
      functionName = "start_room";
      args = [
        requiredString(body.roomId, "roomId", 12).toUpperCase(),
        requiredString(body.playerId, "playerId", 96),
      ];
    } else if (action === "submit_player") {
      if (!Array.isArray(body.answers)) {
        throw new Error("answers must be an array.");
      }

      functionName = "submit_player";
      args = [
        requiredString(body.roomId, "roomId", 12).toUpperCase(),
        requiredString(body.playerId, "playerId", 96),
        requiredString(body.displayName, "displayName", 24),
        JSON.stringify(body.answers),
      ];
    } else {
      return NextResponse.json(
        { error: "Unsupported relay action." },
        { status: 400 },
      );
    }

    const txHash = await client.writeContract({
      address: contractAddress as `0x${string}`,
      functionName,
      args,
      value: BigInt(0),
    });

    return NextResponse.json({ txHash });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Relayer request failed.",
      },
      { status: 400 },
    );
  }
}
