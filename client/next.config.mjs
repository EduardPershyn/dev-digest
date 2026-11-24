import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
const isDev = process.env.NODE_ENV !== "production";

/**
 * S4 (security hardening) — the page renders untrusted markdown
 * (LLM rationale, PR comments, repo docs). `img-src` and `connect-src` close
 * the channel an injected `<img>`/fetch would use to send data off-box.
 *
 * `script-src`/`style-src` are deliberately not restricted here: Next's dev
 * server needs `'unsafe-eval'` and mermaid injects inline styles, so a strict
 * script policy needs nonces and is a separate change.
 */
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  // `ws:` only in dev, for Next's HMR socket.
  `connect-src 'self' ${API_BASE}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Keep inline/eval scripts working (see above) while still pinning origin.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: API_BASE,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  /**
   * The vendored `@devdigest/shared` barrel uses NodeNext-style `./x.js`
   * specifiers for `.ts` files. Type-only imports are erased, but a runtime
   * import (e.g. SKILL_NAME_PATTERN, M2) makes webpack resolve them — map
   * `.js` → `.ts` first, falling back to real `.js` files (node_modules).
   */
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
