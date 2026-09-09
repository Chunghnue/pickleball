import type { NextConfig } from "next";
import { API_BASE_URL } from "./src/lib/api-config";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker image can run `node server.js` without
  // shipping node_modules. `next start` from `.next/` keeps working too.
  output: "standalone",
  async rewrites() {
    return [
      {
        // Uploaded file URLs (venue logos, court/venue images) come back from
        // the API as relative /uploads/... paths. Rendered directly as <img
        // src>, the browser resolves them against the web app's own origin,
        // not the API's — this proxies them through so relative paths work
        // regardless of how API_BASE_URL differs from the web app's origin.
        source: "/uploads/:path*",
        destination: `${API_BASE_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
