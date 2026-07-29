"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  useLinkAccount,
  usePrivy,
} from "@privy-io/react-auth";

type StoredProfile = {
  name: string;
  bio: string;
  avatar: string;
};

type PrimaryLoginMethod =
  | "email"
  | "google"
  | "discord"
  | "twitter"
  | "wallet"
  | "guest"
  | "account";

type ConnectedAccount = {
  key: string;
  label: string;
  detail: string;
  copyValue: string;
  linked: boolean;
  action?: () => void;
};

const EMPTY_PROFILE: StoredProfile = {
  name: "",
  bio: "",
  avatar: "",
};

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

function findLinked(
  linkedAccounts: readonly unknown[] | undefined,
  type: string,
) {
  return linkedAccounts?.find(
    (account) => readString(account, "type") === type,
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "VR"
  );
}

function shortenAddress(address: string) {
  if (address.length < 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function validPrimaryMethod(
  value: string | null,
): value is PrimaryLoginMethod {
  return [
    "email",
    "google",
    "discord",
    "twitter",
    "wallet",
    "guest",
    "account",
  ].includes(value ?? "");
}

export default function AccountMenu({
  guestId,
}: {
  guestId?: string;
}) {
  const { authenticated, user, logout } = usePrivy();
  const [currentUser, setCurrentUser] = useState(user);
  const [linkMessage, setLinkMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const {
    linkWallet,
    linkDiscord,
    linkTwitter,
  } = useLinkAccount({
    onSuccess: ({ user: updatedUser, linkMethod }) => {
      setCurrentUser(updatedUser);
      setLinkMessage(`${linkMethod} connected successfully.`);
    },
    onError: (linkError) => {
      setLinkMessage(linkError);
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<
    "profile" | "settings" | null
  >(null);
  const [profile, setProfile] =
    useState<StoredProfile>(EMPTY_PROFILE);
  const [draft, setDraft] =
    useState<StoredProfile>(EMPTY_PROFILE);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  const linkedAccounts = currentUser?.linkedAccounts ?? [];

  const linkedEmail = findLinked(linkedAccounts, "email");
  const linkedGoogle = findLinked(
    linkedAccounts,
    "google_oauth",
  );
  const linkedDiscord = findLinked(
    linkedAccounts,
    "discord_oauth",
  );
  const linkedTwitter = findLinked(
    linkedAccounts,
    "twitter_oauth",
  );
  const linkedWallet = findLinked(linkedAccounts, "wallet");

  const emailAddress =
    currentUser?.email?.address ??
    readString(linkedEmail, "address");

  const googleEmail =
    currentUser?.google?.email ??
    readString(linkedGoogle, "email");

  const googleName =
    currentUser?.google?.name ??
    readString(linkedGoogle, "name");

  const discordUsername =
    currentUser?.discord?.username ??
    readString(linkedDiscord, "username");

  const twitterUsername =
    currentUser?.twitter?.username ??
    readString(linkedTwitter, "username");

  const walletAddress =
    currentUser?.wallet?.address ??
    readString(linkedWallet, "address");

  const [primaryMethod, setPrimaryMethod] =
    useState<PrimaryLoginMethod>("account");

  useEffect(() => {
    const saved =
      window.localStorage.getItem(
        "vr_primary_login_method",
      ) ??
      window.localStorage.getItem("vr_auth_method");

    if (validPrimaryMethod(saved)) {
      setPrimaryMethod(saved);
      return;
    }

    if (emailAddress) {
      setPrimaryMethod("email");
      return;
    }

    if (googleEmail) {
      setPrimaryMethod("google");
      return;
    }

    if (discordUsername) {
      setPrimaryMethod("discord");
      return;
    }

    if (walletAddress) {
      setPrimaryMethod("wallet");
      return;
    }

    setPrimaryMethod(guestId ? "guest" : "account");
  }, [
    discordUsername,
    emailAddress,
    googleEmail,
    guestId,
    walletAddress,
  ]);

  const fallbackName =
    discordUsername ||
    googleName ||
    googleEmail.split("@")[0] ||
    emailAddress.split("@")[0] ||
    (guestId ? "Guest Player" : "Player");

  const profileKey = useMemo(
    () =>
      `verdict_rush_profile_${
        currentUser?.id ?? guestId ?? "anonymous"
      }`,
    [currentUser?.id, guestId],
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(profileKey);
    let nextProfile: StoredProfile;

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredProfile>;
        nextProfile = {
          name:
            typeof parsed.name === "string" && parsed.name.trim()
              ? parsed.name
              : fallbackName,
          bio:
            typeof parsed.bio === "string" ? parsed.bio : "",
          avatar:
            typeof parsed.avatar === "string" ? parsed.avatar : "",
        };
      } catch {
        nextProfile = {
          ...EMPTY_PROFILE,
          name: fallbackName,
        };
      }
    } else {
      nextProfile = {
        ...EMPTY_PROFILE,
        name: fallbackName,
      };
    }

    window.localStorage.setItem(
      profileKey,
      JSON.stringify(nextProfile),
    );
    window.localStorage.setItem(
      "vr_profile_current",
      JSON.stringify(nextProfile),
    );
    window.localStorage.setItem(
      "vr_display_name",
      nextProfile.name,
    );

    setProfile(nextProfile);
    setDraft(nextProfile);

    window.dispatchEvent(
      new CustomEvent("vr-profile-updated", {
        detail: nextProfile,
      }),
    );
  }, [fallbackName, profileKey]);

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOutside);
    return () =>
      document.removeEventListener("mousedown", closeOutside);
  }, []);

  useEffect(() => {
    function hideLegacyIdentityBadge() {
      const candidates = Array.from(
        document.querySelectorAll<
          HTMLElement
        >("header button, header div, header span"),
      );

      for (const element of candidates) {
        if (element.closest("[data-verdict-account-menu]")) {
          continue;
        }

        const text = element.textContent?.trim() ?? "";
        const rect = element.getBoundingClientRect();

        if (
          rect.top < 120 &&
          /\s·\s(?:guest|email|google|discord|wallet|account)$/i.test(
            text,
          )
        ) {
          const target =
            element.closest<HTMLElement>("button") ?? element;
          target.style.display = "none";
          break;
        }
      }
    }

    hideLegacyIdentityBadge();
    const timer = window.setTimeout(
      hideLegacyIdentityBadge,
      200,
    );

    return () => window.clearTimeout(timer);
  }, []);

  function openPanel(nextPanel: "profile" | "settings") {
    setDraft(profile);
    setError("");
    setLinkMessage("");
    setPanel(nextPanel);
    setMenuOpen(false);
  }

  function saveProfile() {
    const cleanName = draft.name.trim();

    if (cleanName.length < 2 || cleanName.length > 24) {
      setError(
        "Display name must be between 2 and 24 characters.",
      );
      return;
    }

    const nextProfile = {
      name: cleanName,
      bio: draft.bio.trim().slice(0, 160),
      avatar: draft.avatar,
    };

    window.localStorage.setItem(
      profileKey,
      JSON.stringify(nextProfile),
    );
    window.localStorage.setItem(
      "vr_profile_current",
      JSON.stringify(nextProfile),
    );
    window.localStorage.setItem(
      "vr_display_name",
      nextProfile.name,
    );

    setProfile(nextProfile);
    setDraft(nextProfile);
    setPanel(null);

    window.dispatchEvent(
      new CustomEvent("vr-profile-updated", {
        detail: nextProfile,
      }),
    );
  }

  function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }

    if (file.size > 700_000) {
      setError("Profile image must be smaller than 700 KB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDraft((current) => ({
          ...current,
          avatar: reader.result as string,
        }));
        setError("");
      }
    };

    reader.readAsDataURL(file);
  }

  async function copyValue(key: string, value: string) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1400);
  }

  async function signOut() {
    window.sessionStorage.removeItem("verdict_rush_guest_id");
    window.localStorage.removeItem("vr_auth_id");
    window.localStorage.removeItem("vr_auth_method");
    window.localStorage.removeItem(
      "vr_primary_login_method",
    );
    window.localStorage.removeItem(
      "vr_primary_login_detail",
    );
    window.localStorage.removeItem("vr_profile_current");
    window.localStorage.removeItem("vr_display_name");

    if (authenticated) {
      await logout();
    }

    window.location.reload();
  }

  function getPrimaryAccount(): ConnectedAccount {
    if (primaryMethod === "email") {
      return {
        key: "primary-email",
        label: "Email",
        detail: emailAddress || "Email sign-in",
        copyValue: emailAddress,
        linked: Boolean(emailAddress),
      };
    }

    if (primaryMethod === "google") {
      return {
        key: "primary-google",
        label: "Google",
        detail: googleEmail || googleName || "Google sign-in",
        copyValue: googleEmail,
        linked: Boolean(googleEmail || googleName),
      };
    }

    if (primaryMethod === "discord") {
      return {
        key: "primary-discord",
        label: "Discord",
        detail: discordUsername
          ? `@${discordUsername}`
          : "Discord sign-in",
        copyValue: discordUsername,
        linked: Boolean(discordUsername),
      };
    }

    if (primaryMethod === "twitter") {
      return {
        key: "primary-twitter",
        label: "X / Twitter",
        detail: twitterUsername
          ? `@${twitterUsername}`
          : "X sign-in",
        copyValue: twitterUsername,
        linked: Boolean(twitterUsername),
      };
    }

    if (primaryMethod === "wallet") {
      return {
        key: "primary-wallet",
        label: "External wallet",
        detail: walletAddress
          ? shortenAddress(walletAddress)
          : "Wallet sign-in",
        copyValue: walletAddress,
        linked: Boolean(walletAddress),
      };
    }

    if (primaryMethod === "guest") {
      return {
        key: "primary-guest",
        label: "Guest",
        detail: "Temporary guest session",
        copyValue: "",
        linked: true,
      };
    }

    return {
      key: "primary-account",
      label: "Account",
      detail: "Signed in with Privy",
      copyValue: "",
      linked: true,
    };
  }

  const primaryAccount = getPrimaryAccount();

  const connectedAccounts: ConnectedAccount[] = [
    {
      key: "discord",
      label: "Discord",
      detail: discordUsername
        ? `@${discordUsername}`
        : "Not connected",
      copyValue: discordUsername,
      linked: Boolean(discordUsername),
      action: linkDiscord,
    },
    {
      key: "twitter",
      label: "X / Twitter",
      detail: twitterUsername
        ? `@${twitterUsername}`
        : "Not connected",
      copyValue: twitterUsername,
      linked: Boolean(twitterUsername),
      action: linkTwitter,
    },
    {
      key: "wallet",
      label: "External wallet",
      detail: walletAddress
        ? shortenAddress(walletAddress)
        : "Not connected",
      copyValue: walletAddress,
      linked: Boolean(walletAddress),
      action: linkWallet,
    },
  ].filter((account) => {
    if (
      primaryMethod === "discord" &&
      account.key === "discord"
    ) {
      return false;
    }

    if (
      primaryMethod === "twitter" &&
      account.key === "twitter"
    ) {
      return false;
    }

    if (
      primaryMethod === "wallet" &&
      account.key === "wallet"
    ) {
      return false;
    }

    return true;
  });

  function AccountCard({
    account,
    allowConnect = false,
  }: {
    account: ConnectedAccount;
    allowConnect?: boolean;
  }) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-bold">{account.label}</div>
            <div
              className="mt-1 truncate text-xs text-white/45"
              title={account.copyValue || account.detail}
            >
              {account.detail}
            </div>
          </div>

          {allowConnect &&
            !account.linked &&
            account.action && (
              <button
                type="button"
                disabled={!authenticated}
                onClick={() => {
                  setLinkMessage("");
                  account.action?.();
                }}
                className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 disabled:cursor-default disabled:opacity-40"
              >
                Connect
              </button>
            )}
        </div>

        {account.linked && account.copyValue && (
          <button
            type="button"
            onClick={() =>
              copyValue(account.key, account.copyValue)
            }
            className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white"
          >
            {copiedKey === account.key ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        ref={menuRef}
        data-verdict-account-menu
        className="fixed right-5 top-4 z-[300] md:right-[6.5vw]"
      >
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex min-w-[190px] items-center justify-between gap-3 rounded-full border border-white/10 bg-[#111116] px-3 py-2 text-left shadow-2xl"
        >
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20 text-xs font-black text-purple-200">
              {initials(profile.name || fallbackName)}
            </span>
          )}

          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {profile.name || fallbackName}
          </span>

          <span className="text-xs text-white/40">⌄</span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#121218] p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => openPanel("profile")}
              className="w-full rounded-xl px-3 py-3 text-left text-sm text-white/80 hover:bg-white/[0.06] hover:text-white"
            >
              Profile
            </button>

            <button
              type="button"
              onClick={() => openPanel("settings")}
              className="w-full rounded-xl px-3 py-3 text-left text-sm text-white/80 hover:bg-white/[0.06] hover:text-white"
            >
              Settings
            </button>

            <div className="my-1 h-px bg-white/10" />

            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-xl px-3 py-3 text-left text-sm text-red-300 hover:bg-red-500/10"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {panel && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/10 bg-[#101015] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-300">
                  Verdict Rush Account
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  {panel === "profile" ? "Profile" : "Settings"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            {panel === "profile" && (
              <div className="mt-6">
                <div className="flex items-center gap-4">
                  {draft.avatar ? (
                    <img
                      src={draft.avatar}
                      alt=""
                      className="h-20 w-20 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-purple-500/20 text-xl font-black text-purple-200">
                      {initials(draft.name || fallbackName)}
                    </div>
                  )}

                  <label className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 hover:text-white">
                    Upload photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatar}
                      className="hidden"
                    />
                  </label>

                  {draft.avatar && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          avatar: "",
                        }))
                      }
                      className="text-sm text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className="mt-6 block text-sm text-white/55">
                  Display name
                </label>

                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  maxLength={24}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-purple-400/60"
                />

                <label className="mt-5 block text-sm text-white/55">
                  Bio
                </label>

                <textarea
                  value={draft.bio}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))
                  }
                  maxLength={160}
                  rows={4}
                  placeholder="Tell players something about yourself..."
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-purple-400/60"
                />

                <div className="mt-1 text-right text-xs text-white/35">
                  {draft.bio.length}/160
                </div>

                {error && (
                  <p className="mt-3 text-sm text-orange-300">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={saveProfile}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-5 py-3 font-black"
                >
                  Save profile
                </button>
              </div>
            )}

            {panel === "settings" && (
              <div className="mt-6">
                {!authenticated && (
                  <div className="rounded-2xl border border-orange-400/20 bg-orange-400/10 p-4 text-sm text-orange-200">
                    Guest profiles cannot link accounts.
                  </div>
                )}

                {linkMessage && (
                  <div className="mb-4 rounded-2xl border border-purple-400/20 bg-purple-400/10 p-4 text-sm text-purple-100">
                    {linkMessage}
                  </div>
                )}

                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/35">
                  Signed in with
                </p>

                <AccountCard account={primaryAccount} />

                {connectedAccounts.length > 0 && (
                  <>
                    <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.14em] text-white/35">
                      Connected accounts
                    </p>

                    <div className="space-y-3">
                      {connectedAccounts.map((account) => (
                        <AccountCard
                          key={account.key}
                          account={account}
                          allowConnect
                        />
                      ))}
                    </div>
                  </>
                )}

                <p className="pt-5 text-xs leading-5 text-white/35">
                  Your sign-in account is kept separate from
                  optional Discord, X and wallet connections.
                  These details are never shown on the public
                  leaderboard.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
