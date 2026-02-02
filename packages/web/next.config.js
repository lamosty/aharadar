/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Proxy /api/* to the API server
  // This keeps everything on one origin (no CORS/cookie issues)
  async rewrites() {
    const apiUrl = process.env.API_URL || "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
