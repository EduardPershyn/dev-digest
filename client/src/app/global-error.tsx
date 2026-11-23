/* Last-resort boundary (R14) for errors thrown by the root layout itself
   (providers, i18n). It replaces the root layout, so it renders its own
   <html>/<body> and cannot rely on providers, translations or global CSS —
   hence plain inline styles and fixed English copy. */
"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0d10",
          color: "#e6e8eb",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>DevDigest failed to load</h1>
          <p style={{ color: "#9aa3ad", marginBottom: 20 }}>An unexpected error stopped the app from starting.</p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2f36", background: "#1a1e23", color: "inherit", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
