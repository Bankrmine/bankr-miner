import type { NextRequest } from "next/server";

const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
];

export function clientIp(req: NextRequest): string {
  for (const header of IP_HEADERS) {
    const value = req.headers.get(header);
    if (!value) continue;
    const ip = normalizeForwardedIp(value);
    if (ip) return ip;
  }
  return "unknown";
}

function normalizeForwardedIp(value: string): string | null {
  const first = value.split(",")[0]?.trim().toLowerCase();
  if (!first) return null;
  if (first.startsWith("[") && first.includes("]")) {
    return first.slice(1, first.indexOf("]"));
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(first)) {
    return first.slice(0, first.lastIndexOf(":"));
  }
  return first;
}
