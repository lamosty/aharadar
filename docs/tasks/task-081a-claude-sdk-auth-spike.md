# Task 081a — `spike: Claude Agent SDK authentication for background services`

- **Owner**: Claude Code Opus 4.5 (investigator)
- **Reviewer**: human
- **Driver**: human (runs commands, validates findings)

## Goal

**RESEARCH SPIKE** - Verify Claude Agent SDK authentication works for background services using Claude Max subscription credentials.

**This must be completed BEFORE tasks 081 and 082 can proceed.**

## Background

AhaRadar uses OpenAI for LLM triage/enrichment. The user has a Claude Max subscription ($100/month) that is underutilized. The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) can potentially use subscription credentials instead of API billing for personal/experimental use.

Key unknowns:
- How Claude CLI stores credentials
- Whether Agent SDK can read these credentials from a background service
- Credential lifecycle (expiration, refresh)
- Docker compatibility

## Read first (required)

- `CLAUDE.md`
- `docs/architecture.md`
- `packages/llm/src/router.ts` (current LLM routing)
- `packages/llm/src/types.ts` (LLM types)
- Claude Agent SDK documentation (if available)

## Scope (allowed files)

- `scripts/test-claude-subscription.ts` (new)
- `docs/claude-integration.md` (new - findings documentation)

If anything else seems required, **stop and ask**.

## Research questions

Answer each of these definitively:

### Q1: Credential storage location
- Where does Claude CLI store credentials on macOS?
- Check: `~/.claude/`, `~/.config/claude/`, system keychain
- What files exist? What format (JSON, token file, OAuth)?

### Q2: Agent SDK credential access
- Can the Agent SDK use these credentials from a Node.js process?
- Does it require any initialization or explicit credential loading?
- Does it work without `ANTHROPIC_API_KEY` env var set?

### Q3: Credential lifecycle
- When do credentials expire?
- Is there automatic refresh?
- What happens when credentials expire during a long-running process?
- Does re-running `claude login` disrupt running services?

### Q4: Background service compatibility
- Can a background process (launchd/systemd) access credentials?
- Are there permission issues with reading credential files?
- Does the process need to be started by the logged-in user?

### Q5: Docker compatibility
- Can credentials be mounted into Docker containers?
- What paths/files need mounting?
- Any security concerns with mounting credentials?

## Implementation steps (ordered)

1. **Investigate credential storage**:
   ```bash
   # Check common locations
   ls -la ~/.claude/
   ls -la ~/.config/claude/
   # Check keychain
   security find-generic-password -s "claude" 2>/dev/null || echo "Not in keychain"
   ```

2. **Install Agent SDK in project**:
   ```bash
   cd packages/llm
   pnpm add @anthropic-ai/claude-agent-sdk
   ```

3. **Create test script** `scripts/test-claude-subscription.ts`:
   ```typescript
   #!/usr/bin/env tsx

   // Test 1: Basic SDK import
   import { query } from '@anthropic-ai/claude-agent-sdk';

   async function testSubscriptionAuth() {
     console.log('Testing Claude Agent SDK with subscription credentials...\n');

     // Check if ANTHROPIC_API_KEY is set (should NOT be needed for subscription)
     console.log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);

     try {
       const result = await query({
         prompt: 'Say "Hello from Claude subscription!" and nothing else.',
         options: {
           model: 'claude-sonnet-4-5',
           maxTokens: 50,
         },
       });

       console.log('SUCCESS! Response:', result);
       console.log('\nSubscription auth works for this process.');
       return true;
     } catch (error) {
       console.error('FAILED:', error);
       return false;
     }
   }

   async function main() {
     console.log('=== Claude Subscription Auth Test ===\n');
     console.log('User:', process.env.USER);
     console.log('Home:', process.env.HOME);
     console.log('CWD:', process.cwd());
     console.log('');

     const success = await testSubscriptionAuth();
     process.exit(success ? 0 : 1);
   }

   main();
   ```

4. **Test scenarios**:

   **Scenario A: Direct user execution**
   ```bash
   # Run as logged-in user
   pnpm tsx scripts/test-claude-subscription.ts
   ```

   **Scenario B: Background process simulation**
   ```bash
   # Run in a subshell with minimal environment
   env -i HOME=$HOME USER=$USER PATH=$PATH \
     pnpm tsx scripts/test-claude-subscription.ts
   ```

   **Scenario C: Different working directory**
   ```bash
   cd /tmp && pnpm tsx $OLDPWD/scripts/test-claude-subscription.ts
   ```

   **Scenario D: Docker mount test** (if A-C pass)
   ```bash
   docker run --rm -it \
     -v ~/.claude:/root/.claude:ro \
     -v ~/.config/claude:/root/.config/claude:ro \
     -v $(pwd):/app \
     -w /app \
     node:20 \
     npx tsx scripts/test-claude-subscription.ts
   ```

5. **Document findings** in `docs/claude-integration.md`:
   ```markdown
   # Claude Integration Notes

   ## Authentication

   ### Credential Location
   - Path: ???
   - Format: ???
   - Created by: `claude login`

   ### Background Service Compatibility
   - Works: yes/no
   - Requirements: ???

   ### Docker Compatibility
   - Works: yes/no
   - Mount paths: ???

   ### Credential Lifecycle
   - Expiration: ???
   - Refresh: ???

   ## Recommendation

   [Go/No-Go decision with rationale]
   ```

## Acceptance criteria

- [ ] All 5 research questions answered with evidence
- [ ] Test script exists and documents what works/doesn't
- [ ] `docs/claude-integration.md` created with findings
- [ ] Clear Go/No-Go recommendation for tasks 081 and 082
- [ ] If Go: Document implementation approach
- [ ] If No-Go: Document blockers and alternatives

## Test plan (copy/paste)

```bash
# 1. Check current claude login status
claude --version
claude whoami  # or equivalent status command

# 2. Install SDK
cd packages/llm
pnpm add @anthropic-ai/claude-agent-sdk

# 3. Run test script
pnpm tsx scripts/test-claude-subscription.ts

# 4. Test background mode
env -i HOME=$HOME USER=$USER PATH=$PATH \
  pnpm tsx scripts/test-claude-subscription.ts

# 5. Review findings
cat docs/claude-integration.md
```

## Expected outcomes

**If it works:**
- Subscription auth is transparent to the SDK
- No API key needed when logged in
- Background services can use mounted credentials
- Proceed to tasks 081 and 082

**If it doesn't work:**
- Document why (auth mechanism, permissions, etc.)
- Consider alternatives:
  - Anthropic API with pay-per-token (task 081 only)
  - Wrapper that spawns `claude` CLI subprocess
  - Wait for SDK improvements

## Notes

- This is experimental/personal use only - not for SaaS production
- Claude has NO embedding models - always use OpenAI for embeddings
- If SDK doesn't work, task 081 (Anthropic API provider) can still proceed independently
- Time-box this spike to 2-4 hours maximum
