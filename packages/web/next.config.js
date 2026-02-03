/** @type {import('next').NextConfig} */
const fs = require("fs");
const path = require("path");

function readEnvFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, "utf8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx);
        const value = trimmed.slice(idx + 1);
        env[key] = value;
      }
    }
    return env;
  } catch (err) {
    return {};
  }
}
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Proxy /api/* to the API server
  // This keeps everything on one origin (no CORS/cookie issues)
  async rewrites() {
    const rootEnv = readEnvFile(path.join(__dirname, "..", "..", ".env"));
    const apiPort = process.env.API_PORT || rootEnv.API_PORT || "3001";
    const apiUrl = process.env.API_URL || rootEnv.API_URL || `http://localhost:${apiPort}`;
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
