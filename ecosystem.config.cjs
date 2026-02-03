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

const ROOT = __dirname;
const NODE_ENV = process.env.NODE_ENV || "production";

module.exports = {
  apps: [
    {
      name: "aharadar-api",
      cwd: ROOT,
      script: "packages/api/dist/main.js",
      interpreter: "node",
      env: {
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
        NODE_ENV,
        PORT: process.env.WEB_PORT || 3000,
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
      script: "packages/queue-ui/dist/main.js",
      interpreter: "node",
      env: {
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
