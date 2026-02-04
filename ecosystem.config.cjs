/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 stop all
 *   pm2 restart all
 *   pm2 logs
 *   pm2 monit
 *
 * First time setup:
 *   npm install -g pm2
 *   pm2 startup   # generates systemd service for auto-start on boot
 *   pm2 save      # saves current process list
 */

const path = require("path");
const fs = require("fs");

const ROOT = __dirname;

// Parse .env file manually (PM2 does not load .env by default)
function parseEnv(envPath) {
  const env = {};
  try {
    const content = fs.readFileSync(envPath, "utf8");
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
  } catch (e) {
    // Ignore if .env doesn't exist
  }
  return env;
}

const dotenv = parseEnv(path.join(ROOT, ".env"));
const NODE_ENV = process.env.NODE_ENV || "production";

module.exports = {
  apps: [
    {
      name: "aharadar-api",
      cwd: ROOT,
      script: "packages/api/dist/main.js",
      interpreter: "node",
      env: {
        ...dotenv,
        NODE_ENV,
      },
      // Restart settings
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 1000,
      // Logging
      error_file: path.join(ROOT, "logs/api-error.log"),
      out_file: path.join(ROOT, "logs/api-out.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "aharadar-web",
      cwd: path.join(ROOT, "packages/web"),
      script: "node_modules/.bin/next",
      args: "start",
      interpreter: "none",
      env: {
        ...dotenv,
        NODE_ENV,
        PORT: dotenv.WEB_PORT || process.env.WEB_PORT || 3000,
        API_URL:
          dotenv.API_URL ||
          process.env.API_URL ||
          `http://localhost:${dotenv.API_PORT || 3001}`,
      },
      // Restart settings
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 1000,
      // Logging
      error_file: path.join(ROOT, "logs/web-error.log"),
      out_file: path.join(ROOT, "logs/web-out.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "aharadar-worker",
      cwd: ROOT,
      script: "packages/worker/dist/main.js",
      interpreter: "node",
      env: {
        ...dotenv,
        NODE_ENV,
      },
      // Restart settings
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 1000,
      // Logging
      error_file: path.join(ROOT, "logs/worker-error.log"),
      out_file: path.join(ROOT, "logs/worker-out.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "aharadar-queue-ui",
      cwd: ROOT,
      script: "packages/queue-ui/dist/index.js",
      interpreter: "node",
      env: {
        ...dotenv,
        NODE_ENV,
      },
      // Restart settings
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 1000,
      // Logging
      error_file: path.join(ROOT, "logs/queue-ui-error.log"),
      out_file: path.join(ROOT, "logs/queue-ui-out.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
