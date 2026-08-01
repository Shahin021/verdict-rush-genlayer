import { NextResponse } from "next/server";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { toPublicRoom } from "../../../../lib/v5-room-model";
import { getStoredRoom } from "../../../../lib/v5-room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
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
      "VERDICT_RUSH_V4_CONTRACT_ADDRESS is missing or invalid.",
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const roomId = (
      url.searchParams.get("roomId") ?? ""
    )
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9]{4,12}$/.test(roomId)) {
      throw new HttpError(
        "roomId is invalid.",
        400,
      );
    }

    const storedRoom =
      await getStoredRoom(roomId);

    if (!storedRoom) {
      throw new HttpError(
        "Room was not found.",
        404,
      );
    }

    const client = createClient({
      chain: testnetBradbury,
    });

    const address = getContractAddress();

    const [configRaw, verdictRaw] =
      await Promise.all([
        client.readContract({
          address,
          functionName: "get_game_config",
          args: [storedRoom.game_id],
        }),
        client.readContract({
          address,
          functionName: "get_game_verdict",
          args: [storedRoom.game_id],
        }),
      ]);

    const config = parseContractJson<unknown>(
      configRaw,
      "Game configuration",
    );

    const verdict =
      parseContractJson<unknown>(
        verdictRaw,
        "Consensus verdict",
      );

    return NextResponse.json(
      {
        room: toPublicRoom(storedRoom),
        config,
        verdict,
        serverTimeMs: Date.now(),
      },
      {
        headers: {
          "cache-control":
            "no-store, max-age=0",
        },
      },
    );
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
            : "Room state request failed.",
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