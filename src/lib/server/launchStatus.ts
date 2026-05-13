/**
 * Server-side helpers that surface live data from the Bankr API to our
 * UI. These endpoints all work without Bankr Club, so we can ship them
 * before the deployer wallet activates its membership:
 *
 *  - GET /wallet/me          → deployer wallet + Bankr Club status + X handle
 *  - GET /token-launches?limit=N → real-time feed of every token deployed
 *                                  through Bankr, across the whole ecosystem
 *
 * Both responses are cached in-process for a short TTL so the
 * `/api/launch-status` polling on our landing page doesn't fan out into
 * dozens of upstream calls per minute.
 */
import { BANKR_API_BASE } from "../constants";

const ME_TTL_MS = 60_000;
const LAUNCHES_TTL_MS = 30_000;

type DeployerStatus = {
  configured: boolean;
  evmAddress: string | null;
  solAddress: string | null;
  xUsername: string | null;
  clubActive: boolean;
  leaderboardScore: number | null;
  /** Bankr referral code from /wallet/me — surfaced in UI as a CTA. */
  refCode: string | null;
  /** Upstream HTTP status, useful for debugging in the UI. */
  upstream: { status: number; ok: boolean; error?: string };
  fetchedAt: number;
};

export type BankrLaunch = {
  status: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  chain: string;
  txHash: string | null;
  deployer: {
    walletAddress: string;
    xUsername: string | null;
    xProfileImageUrl: string | null;
  };
  tweetUrl: string | null;
  timestamp: number;
};

type LaunchesSnapshot = {
  count: number;
  launches: BankrLaunch[];
  fetchedAt: number;
  upstream: { status: number; ok: boolean; error?: string };
};

type Cache = {
  me?: { value: DeployerStatus; expiresAt: number };
  launches?: { value: LaunchesSnapshot; expiresAt: number };
  inflightMe?: Promise<DeployerStatus>;
  inflightLaunches?: Promise<LaunchesSnapshot>;
};

const CACHE_KEY = "__bankr_miner_launch_status__";

function cache(): Cache {
  const g = globalThis as unknown as Record<string, unknown>;
  let c = g[CACHE_KEY] as Cache | undefined;
  if (!c) {
    c = {};
    g[CACHE_KEY] = c;
  }
  return c;
}

function apiKey(): string | null {
  return process.env.BANKR_API_KEY ?? null;
}

async function fetchDeployerStatusFresh(key: string): Promise<DeployerStatus> {
  try {
    const res = await fetch(`${BANKR_API_BASE}/wallet/me`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });
    const ok = res.ok;
    const status = res.status;
    if (!ok) {
      const text = await res.text().catch(() => "");
      return {
        configured: true,
        evmAddress: null,
        solAddress: null,
        xUsername: null,
        clubActive: false,
        leaderboardScore: null,
        refCode: null,
        upstream: { status, ok: false, error: text.slice(0, 200) },
        fetchedAt: Date.now(),
      };
    }
    const json = (await res.json()) as {
      wallets?: { chain: string; address: string }[];
      socialAccounts?: { platform: string; username: string }[];
      bankrClub?: { active: boolean };
      leaderboard?: { score: number };
      refCode?: string;
    };
    const evm =
      json.wallets?.find((w) => w.chain === "evm")?.address ?? null;
    const sol =
      json.wallets?.find((w) => w.chain === "solana")?.address ?? null;
    const x =
      json.socialAccounts?.find((s) => s.platform === "twitter")?.username ??
      null;
    return {
      configured: true,
      evmAddress: evm,
      solAddress: sol,
      xUsername: x,
      clubActive: Boolean(json.bankrClub?.active),
      leaderboardScore: json.leaderboard?.score ?? null,
      refCode: json.refCode ?? null,
      upstream: { status, ok: true },
      fetchedAt: Date.now(),
    };
  } catch (err) {
    return {
      configured: true,
      evmAddress: null,
      solAddress: null,
      xUsername: null,
      clubActive: false,
      leaderboardScore: null,
      refCode: null,
      upstream: {
        status: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      fetchedAt: Date.now(),
    };
  }
}

export async function getDeployerStatus(): Promise<DeployerStatus> {
  const key = apiKey();
  if (!key) {
    return {
      configured: false,
      evmAddress: null,
      solAddress: null,
      xUsername: null,
      clubActive: false,
      leaderboardScore: null,
      refCode: null,
      upstream: { status: 0, ok: false },
      fetchedAt: Date.now(),
    };
  }
  const c = cache();
  const now = Date.now();
  if (c.me && c.me.expiresAt > now) return c.me.value;
  if (c.inflightMe) return c.inflightMe;
  const p = fetchDeployerStatusFresh(key).then((v) => {
    c.me = { value: v, expiresAt: Date.now() + ME_TTL_MS };
    c.inflightMe = undefined;
    return v;
  });
  c.inflightMe = p;
  return p;
}

async function fetchLaunchesFresh(
  key: string,
  limit: number,
): Promise<LaunchesSnapshot> {
  try {
    const res = await fetch(
      `${BANKR_API_BASE}/token-launches?limit=${limit}`,
      { headers: { "X-API-Key": key }, cache: "no-store" },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        count: 0,
        launches: [],
        fetchedAt: Date.now(),
        upstream: { status: res.status, ok: false, error: text.slice(0, 200) },
      };
    }
    const json = (await res.json()) as {
      launches?: Array<{
        status?: string;
        tokenName?: string;
        tokenSymbol?: string;
        tokenAddress?: string;
        chain?: string;
        txHash?: string;
        tweetUrl?: string;
        timestamp?: number;
        deployer?: {
          walletAddress?: string;
          xUsername?: string;
          xProfileImageUrl?: string;
        };
      }>;
    };
    const list = json.launches ?? [];
    const launches: BankrLaunch[] = list.map((l) => ({
      status: l.status ?? "unknown",
      tokenName: l.tokenName ?? "?",
      tokenSymbol: l.tokenSymbol ?? "?",
      tokenAddress: l.tokenAddress ?? "",
      chain: l.chain ?? "base",
      txHash: l.txHash ?? null,
      tweetUrl: l.tweetUrl ?? null,
      timestamp: l.timestamp ?? 0,
      deployer: {
        walletAddress: l.deployer?.walletAddress ?? "",
        xUsername: l.deployer?.xUsername ?? null,
        xProfileImageUrl: l.deployer?.xProfileImageUrl ?? null,
      },
    }));
    return {
      count: launches.length,
      launches,
      fetchedAt: Date.now(),
      upstream: { status: res.status, ok: true },
    };
  } catch (err) {
    return {
      count: 0,
      launches: [],
      fetchedAt: Date.now(),
      upstream: {
        status: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function getRecentBankrLaunches(
  limit = 10,
): Promise<LaunchesSnapshot> {
  const key = apiKey();
  if (!key) {
    return {
      count: 0,
      launches: [],
      fetchedAt: Date.now(),
      upstream: { status: 0, ok: false },
    };
  }
  const c = cache();
  const now = Date.now();
  if (c.launches && c.launches.expiresAt > now) {
    // serve cached, even if requested limit is smaller
    return {
      ...c.launches.value,
      launches: c.launches.value.launches.slice(0, limit),
      count: Math.min(c.launches.value.count, limit),
    };
  }
  if (c.inflightLaunches) {
    const v = await c.inflightLaunches;
    return {
      ...v,
      launches: v.launches.slice(0, limit),
      count: Math.min(v.count, limit),
    };
  }
  const p = fetchLaunchesFresh(key, Math.max(limit, 25)).then((v) => {
    c.launches = { value: v, expiresAt: Date.now() + LAUNCHES_TTL_MS };
    c.inflightLaunches = undefined;
    return v;
  });
  c.inflightLaunches = p;
  const v = await p;
  return {
    ...v,
    launches: v.launches.slice(0, limit),
    count: Math.min(v.count, limit),
  };
}
