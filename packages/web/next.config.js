/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Proxy /api/* to the API server
  // This keeps everything on one origin (no CORS/cookie issues)
  async rewrites() {
    const apiPort = process.env.API_PORT || "3001";
    const apiUrl = process.env.API_URL || `http://localhost:${apiPort}`;
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
