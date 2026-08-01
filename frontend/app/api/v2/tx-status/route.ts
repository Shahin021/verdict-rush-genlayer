import { NextResponse } from "next/server";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStringField(
  value: unknown,
  field: string,
): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = (url.searchParams.get("hash") ?? "").trim();

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json(
      { error: "Transaction hash is invalid." },
      { status: 400 },
    );
  }

  try {
    const client = createClient({
      chain: testnetBradbury,
    });
    const transaction = await client.getTransaction({
      hash: hash as TransactionHash,
    });

    const statusName = getStringField(
      transaction,
      "statusName",
    ).toUpperCase();
    const executionResultName = getStringField(
      transaction,
      "txExecutionResultName",
    ).toUpperCase();

    const failed =
      executionResultName === "FINISHED_WITH_ERROR" ||
      statusName === "CANCELED" ||
      statusName === "UNDETERMINED";
    const accepted =
      !failed &&
      (statusName === "ACCEPTED" ||
        statusName === "FINALIZED" ||
        executionResultName === "FINISHED_WITH_RETURN");

    return NextResponse.json(
      {
        accepted,
        failed,
        statusName,
        executionResultName,
        error: failed
          ? "The GenLayer transaction failed during execution."
          : undefined,
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        accepted: false,
        failed: false,
        statusName: "PENDING",
        executionResultName: "NOT_VOTED",
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );
  }
}
