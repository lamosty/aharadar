# Claude Integration Notes

Research findings from Task 081a - Claude Agent SDK authentication spike.

## Summary

**Go/No-Go Decision: GO for personal/experimental use, NO-GO for SaaS production**

The Claude Agent SDK can use subscription credentials from Claude Code login for personal/experimental use. However, Anthropic's Terms of Service prohibit using subscription auth for products offered to third parties.

## Research Findings

### Q1: Credential Storage Location

**Location**: macOS Keychain

```bash
# Credential entry
security dump-keychain 2>/dev/null | grep -i claude
# Output:
#   0x00000007 <blob>="Claude Code-credentials"
#   "acct"<blob>="lamosty"
#   "svce"<blob>="Claude Code-credentials"
```

**Not stored in**:
- `~/.claude/` (settings, history, plugins only)
- `~/.config/claude/` (doesn't exist)
- File-based token

**Format**: macOS Keychain generic password entry

### Q2: Agent SDK Credential Access

**Works**: YES, without `ANTHROPIC_API_KEY`

When no API key is set, the SDK automatically:
1. Detects Claude Code installation
2. Retrieves credentials from macOS Keychain
3. Uses subscription quota instead of API billing

```typescript
// This works without ANTHROPIC_API_KEY
for await (const message of query({
  prompt: "Say hello",
  options: { allowedTools: [] }
})) {
  console.log(message);
}
```

**Priority**:
1. If `ANTHROPIC_API_KEY` is set → Uses API (pay-per-token)
2. If not set → Falls back to subscription credentials

### Q3: Credential Lifecycle

**Tested behavior**:
- Credentials persist across Claude Code restarts
- Multiple SDK processes can use credentials simultaneously
- No observed expiration during testing

**Unknown** (requires longer-term testing):
- Exact token expiration period
- Auto-refresh mechanism
- Effect of `claude login` on running processes

**Recommendation**: Monitor for auth failures in long-running services.

### Q4: Background Service Compatibility

**Works**: YES

Tested scenarios:
1. Direct user execution: PASS
2. From `/tmp` (different directory): PASS
3. Minimal environment (`env -i`): PASS

```bash
# All of these work:
npx tsx scripts/test-claude-subscription.ts
cd /tmp && npx tsx /path/to/test-claude-subscription.ts
env -i HOME=$HOME USER=$USER PATH=$PATH npx tsx scripts/test-claude-subscription.ts
```

**Requirements**:
- `HOME` environment variable must be set (for keychain access)
- Process must run as the same user who ran `claude login`
- No special permissions required beyond keychain access

### Q5: Docker Compatibility

**NOT TESTED** (deferred until Q4 findings confirmed)

**Expected approach** (if needed):
- Mount macOS Keychain is complex and not recommended
- Better option: Use `ANTHROPIC_API_KEY` for Docker deployments
- Alternative: Run SDK-based services natively on macOS

## Terms of Service Considerations

From [Claude Agent SDK documentation](https://platform.claude.com/docs/en/api/agent-sdk/overview):

> Unless previously approved, we do not allow third party developers to offer Claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead.

**Key phrase**: "offer Claude.ai login...for their products"

### Interpretation by Use Case

| Use Case | Allowed? | Rationale |
|----------|----------|-----------|
| Personal/experimental use | Yes | You're not offering a product to others |
| Internal tools | Yes | Not offered to third parties |
| Open-source (users bring own credentials) | Likely Yes | See below |
| SaaS (developer provides auth) | No | Developer is "offering" auth to third parties |
| Hosted service (shared subscription) | No | Using subscription for multiple users |

### Open-Source Distribution

AhaRadar is open-source. When users clone and run it locally with their own Claude Code credentials:

1. **Developer is NOT "offering" authentication** - users configure their own credentials locally
2. **Each user uses their own subscription** for their own personal use
3. **No centralized auth** - credentials stay on user's machine (macOS Keychain)
4. **Analogous to** open-source tools with "bring your own API key" patterns

This appears consistent with ToS because the prohibition targets developers who "offer" Claude.ai login as part of their product/service, not open-source tools where each user independently authenticates with their own subscription.

### Recommended Documentation for Users

When distributing AhaRadar, document both options:

```markdown
## Authentication Options

### Option 1: Anthropic API Key (Recommended for production)
export ANTHROPIC_API_KEY=your-api-key

### Option 2: Claude Subscription (Personal use only)
If you have Claude Code installed and logged in, the SDK will automatically
use your subscription credentials. This is for personal use only.
```

### Disclaimer

This interpretation is not legal advice. If you need certainty for your specific use case, contact [Anthropic directly](https://www.anthropic.com/contact-sales).

## Recommendations

### For AhaRadar (Personal/Experimental Use)

**Go ahead with subscription auth** for these use cases:
- Personal digest generation
- Local development and testing
- Internal experimental features

**Use API key auth** (`ANTHROPIC_API_KEY`) for:
- Any multi-user SaaS deployment
- Production environments serving other users
- CI/CD pipelines (may not have keychain access)

### Implementation Approach

1. **Task 081 (Anthropic Provider)**: Implement using standard Anthropic API with `ANTHROPIC_API_KEY`
   - This is the official, ToS-compliant approach
   - Required for any production/SaaS deployment

2. **Task 082 (Claude Subscription Mode)**: Implement as optional personal mode
   - Uses Agent SDK with subscription credentials
   - Only for personal/experimental use
   - Falls back to API key if subscription auth fails

### Provider Selection Logic

```typescript
// Proposed provider selection
function selectProvider(config: LlmConfig): Provider {
  if (config.provider === 'anthropic') {
    if (process.env.ANTHROPIC_API_KEY) {
      return new AnthropicApiProvider(); // Standard API
    } else if (config.allowSubscriptionAuth) {
      return new ClaudeAgentSdkProvider(); // Subscription mode
    } else {
      throw new Error('ANTHROPIC_API_KEY required for production');
    }
  }
  // ... other providers
}
```

## Test Script

Located at: `scripts/test-claude-subscription.ts`

```bash
# Run test
npx tsx scripts/test-claude-subscription.ts

# Expected output (with subscription auth working):
# Without API key: PASS
# With API key: FAIL (or PASS if key is set)
# Conclusion: SDK can use subscription credentials!
```

## Files Modified/Created

- `scripts/test-claude-subscription.ts` - Test script
- `docs/claude-integration.md` - This document
- `packages/llm/package.json` - Added `@anthropic-ai/claude-agent-sdk` dependency
- `package.json` (root) - Added `@anthropic-ai/claude-agent-sdk` dependency

## Next Steps

1. **Task 081**: Implement Anthropic API provider (standard `ANTHROPIC_API_KEY` auth)
2. **Task 082**: Implement Claude subscription mode using Agent SDK
3. Consider adding health check for subscription auth status
4. Monitor Anthropic ToS updates for any changes to subscription usage policy

## Unresolved Questions

- Docker deployment strategy (use API key, or native macOS service?)
- Long-term credential stability (need monitoring)
- Rate limits under subscription vs API (need testing)
- Extended thinking support in Agent SDK (documented as supported)
