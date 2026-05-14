"use client";

// Error boundaries must be Client Components.
//
// `global-error` replaces the root layout when an unhandled error escapes a
// page's own boundary. We render a minimal, self-contained shell here (it
// owns the entire `<html>` document) and surface the actual error message
// rather than Next.js's bare "This page couldn't load" placeholder, which
// hides the diagnostic info we need when something blows up on the client
// (e.g. wallet hydration races).

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the error in the browser console so it's easy to copy out.
    console.error("[global-error]", error);
  }, [error]);

  const message = error?.message ?? "Unknown error";
  const digest = error?.digest;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 640, width: "100%" }}>
          <h1
            style={{
              fontSize: 18,
              margin: "0 0 12px",
              color: "#f59e0b",
              letterSpacing: "0.04em",
            }}
          >
            something broke on this page
          </h1>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              margin: "0 0 16px",
              color: "#a1a1aa",
            }}
          >
            The app hit an unhandled client-side error. Reload to try again, or
            share the message below if it keeps happening.
          </p>
          <pre
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              background: "#171717",
              border: "1px solid #27272a",
              borderRadius: 6,
              padding: "10px 12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#fafafa",
              margin: "0 0 16px",
            }}
          >
            {message}
            {digest ? `\n\ndigest: ${digest}` : ""}
          </pre>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #f59e0b",
                background: "#f59e0b",
                color: "#0a0a0a",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #27272a",
                background: "transparent",
                color: "#fafafa",
                cursor: "pointer",
              }}
            >
              Hard reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
