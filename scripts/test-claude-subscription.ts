#!/usr/bin/env tsx
/**
 * Claude Agent SDK Authentication Test
 *
 * Tests whether Claude Agent SDK can use subscription credentials
 * (stored in macOS Keychain) or requires ANTHROPIC_API_KEY.
 *
 * Task 081a Research Spike
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function testWithoutApiKey(): Promise<boolean> {
  console.log("\n=== Test 1: Without ANTHROPIC_API_KEY ===\n");
  console.log("ANTHROPIC_API_KEY set:", !!process.env.ANTHROPIC_API_KEY);

  // Temporarily unset API key if present
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    console.log("Attempting query without API key...");

    for await (const message of query({
      prompt: 'Say "Hello from Claude subscription!" and nothing else.',
      options: {
        allowedTools: [],
        maxTurns: 1,
      },
    })) {
      if ("result" in message) {
        console.log("SUCCESS! Response:", message.result);
        return true;
      }
      if ("type" in message && message.type === "error") {
        console.log("ERROR:", message);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("FAILED:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    // Restore API key if it was set
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  }
}

async function testWithApiKey(): Promise<boolean> {
  console.log("\n=== Test 2: With ANTHROPIC_API_KEY ===\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY not set, skipping test");
    return false;
  }

  try {
    console.log("Attempting query with API key...");

    for await (const message of query({
      prompt: 'Say "Hello from Claude API!" and nothing else.',
      options: {
        allowedTools: [],
        maxTurns: 1,
      },
    })) {
      if ("result" in message) {
        console.log("SUCCESS! Response:", message.result);
        return true;
      }
    }
    return true;
  } catch (error) {
    console.error("FAILED:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("Claude Agent SDK Authentication Test");
  console.log("===========================================");
  console.log("\nEnvironment:");
  console.log("  User:", process.env.USER);
  console.log("  Home:", process.env.HOME);
  console.log("  CWD:", process.cwd());
  console.log("  Node:", process.version);

  const withoutKey = await testWithoutApiKey();
  const withKey = await testWithApiKey();

  console.log("\n===========================================");
  console.log("Results Summary");
  console.log("===========================================");
  console.log("  Without API key:", withoutKey ? "PASS" : "FAIL");
  console.log("  With API key:", withKey ? "PASS" : "FAIL");

  if (!withoutKey && !withKey) {
    console.log("\nConclusion: SDK requires ANTHROPIC_API_KEY");
    console.log("Subscription credentials from Claude CLI are NOT used.");
  } else if (withoutKey) {
    console.log("\nConclusion: SDK can use subscription credentials!");
    console.log("Background services may work without API key.");
  }

  process.exit(withoutKey || withKey ? 0 : 1);
}

main();
