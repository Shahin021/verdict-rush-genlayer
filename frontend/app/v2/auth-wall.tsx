"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import AccountMenu from "./account-menu";

type PrimaryLoginMethod =
  | "email"
  | "google"
  | "discord"
  | "twitter"
  | "wallet"
  | "guest"
  | "account";

function readString(source: unknown, key: string): string {
  if (
    typeof source === "object" &&
    source !== null &&
    key in source
  ) {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }

  return "";
}

function normalizeLoginMethod(
  loginMethod: string | null,
  loginAccount: unknown,
): PrimaryLoginMethod {
  if (loginMethod === "email") return "email";
  if (loginMethod === "google") return "google";
  if (loginMethod === "discord") return "discord";
  if (loginMethod === "twitter") return "twitter";
  if (loginMethod === "wallet" || loginMethod === "siwe") {
    return "wallet";
  }

  const accountType = readString(loginAccount, "type");

  if (accountType === "email") return "email";
  if (accountType === "google_oauth") return "google";
  if (accountType === "discord_oauth") return "discord";
  if (accountType === "twitter_oauth") return "twitter";
  if (accountType === "wallet") return "wallet";

  return "account";
}

function getLoginDetail(
  method: PrimaryLoginMethod,
  loginAccount: unknown,
  user: unknown,
): string {
  if (method === "email") {
    return (
      readString(loginAccount, "address") ||
      readString(
        (user as { email?: unknown } | null)?.email,
        "address",
      )
    );
  }

  if (method === "google") {
    return (
      readString(loginAccount, "email") ||
      readString(
        (user as { google?: unknown } | null)?.google,
        "email",
      )
    );
  }

  if (method === "discord") {
    return (
      readString(loginAccount, "username") ||
      readString(
        (user as { discord?: unknown } | null)?.discord,
        "username",
      )
    );
  }

  if (method === "twitter") {
    return (
      readString(loginAccount, "username") ||
      readString(
        (user as { twitter?: unknown } | null)?.twitter,
        "username",
      )
    );
  }

  if (method === "wallet") {
    return (
      readString(loginAccount, "address") ||
      readString(
        (user as { wallet?: unknown } | null)?.wallet,
        "address",
      )
    );
  }

  return "";
}

function fallbackMethod(user: unknown): PrimaryLoginMethod {
  const account = user as
    | {
        email?: unknown;
        google?: unknown;
        discord?: unknown;
        twitter?: unknown;
        wallet?: unknown;
      }
    | null
    | undefined;

  if (account?.email) return "email";
  if (account?.google) return "google";
  if (account?.discord) return "discord";
  if (account?.twitter) return "twitter";
  if (account?.wallet) return "wallet";

  return "account";
}

function createGuestId() {
  return `guest_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export default function PrivyAuthWall({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, authenticated, user } = usePrivy();
  const [guestId, setGuestId] = useState("");

  const { login } = useLogin({
    onComplete: ({
      user: completedUser,
      loginMethod,
      loginAccount,
    }) => {
      const method = normalizeLoginMethod(
        loginMethod,
        loginAccount,
      );
      const detail = getLoginDetail(
        method,
        loginAccount,
        completedUser,
      );

      window.localStorage.setItem(
        "vr_auth_id",
        completedUser.id,
      );
      window.localStorage.setItem(
        "vr_auth_method",
        method,
      );
      window.localStorage.setItem(
        "vr_primary_login_method",
        method,
      );

      if (detail) {
        window.localStorage.setItem(
          "vr_primary_login_detail",
          detail,
        );
      } else {
        window.localStorage.removeItem(
          "vr_primary_login_detail",
        );
      }
    },
  });

  useEffect(() => {
    const existingGuestId =
      window.sessionStorage.getItem(
        "verdict_rush_guest_id",
      );

    if (existingGuestId) {
      setGuestId(existingGuestId);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;

    if (authenticated && user) {
      const savedPrimary =
        window.localStorage.getItem(
          "vr_primary_login_method",
        );

      const method =
        (savedPrimary as PrimaryLoginMethod | null) ??
        fallbackMethod(user);

      window.localStorage.setItem("vr_auth_id", user.id);
      window.localStorage.setItem(
        "vr_auth_method",
        method,
      );

      if (!savedPrimary) {
        window.localStorage.setItem(
          "vr_primary_login_method",
          method,
        );
      }

      return;
    }

    if (guestId) {
      window.localStorage.setItem("vr_auth_id", guestId);
      window.localStorage.setItem(
        "vr_auth_method",
        "guest",
      );
      window.localStorage.setItem(
        "vr_primary_login_method",
        "guest",
      );
      window.localStorage.setItem(
        "vr_primary_login_detail",
        guestId,
      );
      return;
    }

    window.localStorage.removeItem("vr_auth_id");
    window.localStorage.removeItem("vr_auth_method");
  }, [authenticated, guestId, ready, user]);

  function continueAsGuest() {
    const nextGuestId = createGuestId();

    window.sessionStorage.setItem(
      "verdict_rush_guest_id",
      nextGuestId,
    );
    window.localStorage.setItem(
      "vr_primary_login_method",
      "guest",
    );
    window.localStorage.setItem(
      "vr_primary_login_detail",
      nextGuestId,
    );

    setGuestId(nextGuestId);
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07070b] text-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-purple-400" />
      </main>
    );
  }

  if (authenticated || guestId) {
    return (
      <>
        <AccountMenu
          guestId={authenticated ? undefined : guestId}
        />
        {children}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070b] px-5 py-16 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-170px] top-[-170px] h-[430px] w-[430px] rounded-full bg-purple-700/20 blur-[130px]" />
        <div className="absolute bottom-[-180px] right-[-120px] h-[440px] w-[440px] rounded-full bg-orange-500/10 blur-[130px]" />
      </div>

      <section className="relative z-10 mx-auto max-w-xl rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center">
        <div className="text-sm font-bold text-purple-300">
          VERDICT RUSH V2
        </div>

        <h1 className="mt-3 text-4xl font-black">
          Sign in to enter the game
        </h1>

        <p className="mt-4 leading-7 text-white/50">
          Use email, Google, Discord or an external wallet.
          Your login stays private and your public game profile
          remains separate.
        </p>

        <button
          type="button"
          onClick={() =>
            login({
              loginMethods: [
                "email",
                "google",
                "discord",
                "wallet",
              ],
            })
          }
          className="mt-8 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-4 font-black"
        >
          Sign in
        </button>

        <button
          type="button"
          onClick={continueAsGuest}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 font-bold text-white/70"
        >
          Continue as Guest
        </button>
      </section>
    </main>
  );
}
