# ✅ DONE

# Task 080 — `feat(web,api): API keys management and usage dashboard UI`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: human
- **Driver**: human (runs commands, merges)

## Goal

Create user-facing UI for managing API keys and viewing usage costs. Users can add/remove their own provider keys and see real-time spend dashboards with breakdowns by provider, model, and time.

## Background

Currently:

- No UI for users to add their own API keys
- No visibility into actual LLM spend
- Users cannot see which provider will be used for their requests

With Tasks 078 and 079 complete:

- Encrypted key storage infrastructure exists
- USD cost tracking is in place
- Need UI to expose these capabilities

## Read first (required)

- `CLAUDE.md`
- `docs/tasks/task-078-user-api-keys.md`
- `docs/tasks/task-079-dollar-cost-tracking.md`
- `packages/web/src/app/` (existing page patterns)
- `packages/api/src/routes/` (existing route patterns)

## Dependencies

- Task 078: User API keys infrastructure
- Task 079: USD cost tracking

## Scope (allowed files)

### API (packages/api/src/routes/)

- `user-api-keys.ts` (new)
- `user-usage.ts` (new)
- `index.ts` (register new routes)

### Web (packages/web/src/app/app/)

- `settings/api-keys/page.tsx` (new)
- `usage/page.tsx` (new)

### Shared components

- `packages/web/src/components/` as needed

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### 1. Create API endpoints for key management

File: `packages/api/src/routes/user-api-keys.ts`

```typescript
import { Router } from "express";
import { z } from "zod";
import { encryptApiKey, getMasterKey, getKeySuffix } from "../auth/crypto";
import { createUserApiKeysRepo } from "@aharadar/db/repos/user_api_keys";

const router = Router();

// Supported providers
const PROVIDERS = ["openai", "anthropic", "xai"] as const;

const addKeySchema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().min(10).max(500),
});

/**
 * GET /api/user/api-keys
 * List user's configured API keys (suffix only, never full key)
 */
router.get("/", async (req, res) => {
  const repo = createUserApiKeysRepo(req.pool);
  const keys = await repo.listByUser(req.user.id);

  // Map to safe response (never include encrypted key)
  const response = keys.map((k) => ({
    id: k.id,
    provider: k.provider,
    keySuffix: k.keySuffix,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));

  res.json({ ok: true, keys: response });
});

/**
 * POST /api/user/api-keys
 * Add or update an API key for a provider
 */
router.post("/", async (req, res) => {
  const parsed = addKeySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid request", details: parsed.error.issues });
  }

  const { provider, apiKey } = parsed.data;

  try {
    const masterKey = getMasterKey();
    const { encrypted, iv } = encryptApiKey(apiKey, masterKey);
    const keySuffix = getKeySuffix(apiKey, 4);

    const repo = createUserApiKeysRepo(req.pool);
    const result = await repo.upsert(req.user.id, provider, encrypted, iv, keySuffix);

    res.json({
      ok: true,
      key: {
        id: result.id,
        provider: result.provider,
        keySuffix: result.keySuffix,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to store API key:", error);
    res.status(500).json({ ok: false, error: "Failed to store API key" });
  }
});

/**
 * DELETE /api/user/api-keys/:id
 * Remove an API key
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const repo = createUserApiKeysRepo(req.pool);
  const deleted = await repo.delete(req.user.id, id);

  if (!deleted) {
    return res.status(404).json({ ok: false, error: "Key not found" });
  }

  res.json({ ok: true });
});

/**
 * GET /api/user/api-keys/status
 * Get key source status for each provider
 */
router.get("/status", async (req, res) => {
  const repo = createUserApiKeysRepo(req.pool);
  const keys = await repo.listByUser(req.user.id);

  const allowFallback = process.env.ALLOW_SYSTEM_KEY_FALLBACK === "true";

  const status = PROVIDERS.map((provider) => {
    const userKey = keys.find((k) => k.provider === provider);
    const hasSystemKey =
      !!process.env[`${provider.toUpperCase()}_API_KEY`] || (provider === "xai" && !!process.env.XAI_API_KEY);

    let source: "user" | "system" | "none" = "none";
    if (userKey) {
      source = "user";
    } else if (allowFallback && hasSystemKey) {
      source = "system";
    }

    return {
      provider,
      hasUserKey: !!userKey,
      keySuffix: userKey?.keySuffix || null,
      hasSystemFallback: allowFallback && hasSystemKey,
      activeSource: source,
    };
  });

  res.json({ ok: true, status });
});

export default router;
```

### 2. Create API endpoints for usage stats

File: `packages/api/src/routes/user-usage.ts`

```typescript
import { Router } from "express";
import { z } from "zod";
import { createProviderCallsRepo } from "@aharadar/db/repos/provider_calls";

const router = Router();

const periodSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * GET /api/user/usage
 * Get usage summary for current month by default
 */
router.get("/", async (req, res) => {
  const repo = createProviderCallsRepo(req.pool);
  const usage = await repo.getMonthlyUsage(req.user.id);

  res.json({
    ok: true,
    period: "current_month",
    ...usage,
  });
});

/**
 * GET /api/user/usage/period
 * Get usage for a specific date range
 */
router.get("/period", async (req, res) => {
  const startDate = req.query.startDate
    ? new Date(req.query.startDate as string)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const endDate = req.query.endDate
    ? new Date(req.query.endDate as string)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  const repo = createProviderCallsRepo(req.pool);
  const usage = await repo.getUsageByPeriod(req.user.id, startDate, endDate);

  res.json({
    ok: true,
    period: { startDate, endDate },
    ...usage,
  });
});

/**
 * GET /api/user/usage/daily
 * Get daily usage for charts (last 30 days by default)
 */
router.get("/daily", async (req, res) => {
  const days = parseInt(req.query.days as string) || 30;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const repo = createProviderCallsRepo(req.pool);
  const dailyUsage = await repo.getDailyUsage(req.user.id, startDate, endDate);

  res.json({
    ok: true,
    days,
    startDate,
    endDate,
    daily: dailyUsage,
  });
});

export default router;
```

### 3. Create API keys settings page

File: `packages/web/src/app/app/settings/api-keys/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Key, Shield } from "lucide-react";

interface ApiKeyStatus {
  provider: string;
  hasUserKey: boolean;
  keySuffix: string | null;
  hasSystemFallback: boolean;
  activeSource: "user" | "system" | "none";
}

interface ApiKeySummary {
  id: string;
  provider: string;
  keySuffix: string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  xai: "xAI (Grok)",
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [status, setStatus] = useState<ApiKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newProvider, setNewProvider] = useState<string>("");
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const [keysRes, statusRes] = await Promise.all([
        fetch("/api/user/api-keys"),
        fetch("/api/user/api-keys/status"),
      ]);

      const keysData = await keysRes.json();
      const statusData = await statusRes.json();

      if (keysData.ok) setKeys(keysData.keys);
      if (statusData.ok) setStatus(statusData.status);
    } catch (err) {
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddKey() {
    if (!newProvider || !newKey) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newProvider, apiKey: newKey }),
      });

      const data = await res.json();

      if (data.ok) {
        setNewProvider("");
        setNewKey("");
        await loadKeys();
      } else {
        setError(data.error || "Failed to add key");
      }
    } catch (err) {
      setError("Failed to add key");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("Are you sure you want to delete this API key?")) return;

    try {
      const res = await fetch(`/api/user/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.ok) {
        await loadKeys();
      } else {
        setError(data.error || "Failed to delete key");
      }
    } catch (err) {
      setError("Failed to delete key");
    }
  }

  function getSourceBadge(source: "user" | "system" | "none") {
    switch (source) {
      case "user":
        return <Badge variant="default">Your Key</Badge>;
      case "system":
        return <Badge variant="secondary">System Key</Badge>;
      case "none":
        return <Badge variant="destructive">Not Configured</Badge>;
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-1">
          Manage your LLM provider API keys. Your keys are encrypted before storage.
        </p>
      </div>

      {error && <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-md">{error}</div>}

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Provider Status
          </CardTitle>
          <CardDescription>Which API key will be used for each provider</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {status.map((s) => (
              <div key={s.provider} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="font-medium">{PROVIDER_LABELS[s.provider] || s.provider}</span>
                  {s.keySuffix && (
                    <span className="ml-2 text-muted-foreground text-sm">...{s.keySuffix}</span>
                  )}
                </div>
                {getSourceBadge(s.activeSource)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add New Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add API Key
          </CardTitle>
          <CardDescription>Add your own API key to use your account with a provider</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Select value={newProvider} onValueChange={setNewProvider}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="xai">xAI (Grok)</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="password"
              placeholder="sk-... or similar"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="flex-1"
            />

            <Button onClick={handleAddKey} disabled={adding || !newProvider || !newKey}>
              {adding ? "Adding..." : "Add Key"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Keys */}
      {keys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Your API Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <span className="font-medium">{PROVIDER_LABELS[key.provider] || key.provider}</span>
                    <span className="ml-2 text-muted-foreground">...{key.keySuffix}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      Added {new Date(key.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### 4. Create usage dashboard page

File: `packages/web/src/app/app/usage/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, BarChart3, TrendingUp, Zap } from "lucide-react";

interface UsageSummary {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

interface UsageByProvider {
  provider: string;
  totalUsd: number;
  callCount: number;
}

interface UsageByModel {
  provider: string;
  model: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

interface DailyUsage {
  date: string;
  totalUsd: number;
  callCount: number;
}

function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(6)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byProvider, setByProvider] = useState<UsageByProvider[]>([]);
  const [byModel, setByModel] = useState<UsageByModel[]>([]);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  async function loadUsage() {
    try {
      const [monthlyRes, dailyRes] = await Promise.all([
        fetch("/api/user/usage"),
        fetch("/api/user/usage/daily?days=30"),
      ]);

      const monthlyData = await monthlyRes.json();
      const dailyData = await dailyRes.json();

      if (monthlyData.ok) {
        setSummary(monthlyData.summary);
        setByProvider(monthlyData.byProvider);
        setByModel(monthlyData.byModel);
      }

      if (dailyData.ok) {
        setDaily(dailyData.daily);
      }
    } catch (err) {
      console.error("Failed to load usage:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const maxDailySpend = Math.max(...daily.map((d) => d.totalUsd), 0.01);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usage & Costs</h1>
        <p className="text-muted-foreground mt-1">Track your LLM API usage and spending</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUsd(summary?.totalUsd || 0)}</div>
            <p className="text-xs text-muted-foreground">Current month spend</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary?.callCount || 0)}</div>
            <p className="text-xs text-muted-foreground">Total calls this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Input Tokens</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary?.totalInputTokens || 0)}</div>
            <p className="text-xs text-muted-foreground">Tokens sent to models</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Output Tokens</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(summary?.totalOutputTokens || 0)}</div>
            <p className="text-xs text-muted-foreground">Tokens generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Spend (Last 30 Days)</CardTitle>
          <CardDescription>Your daily LLM API costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-primary/80 hover:bg-primary rounded-t transition-colors cursor-pointer group relative"
                style={{ height: `${(d.totalUsd / maxDailySpend) * 100}%`, minHeight: "2px" }}
                title={`${d.date}: ${formatUsd(d.totalUsd)}`}
              >
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                  {new Date(d.date).toLocaleDateString()}: {formatUsd(d.totalUsd)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Spend by Provider</CardTitle>
            <CardDescription>Cost breakdown by LLM provider</CardDescription>
          </CardHeader>
          <CardContent>
            {byProvider.length === 0 ? (
              <p className="text-muted-foreground text-sm">No usage data yet</p>
            ) : (
              <div className="space-y-4">
                {byProvider.map((p) => {
                  const percentage = summary?.totalUsd ? (p.totalUsd / summary.totalUsd) * 100 : 0;
                  return (
                    <div key={p.provider}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{p.provider}</span>
                        <span>
                          {formatUsd(p.totalUsd)} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Models */}
        <Card>
          <CardHeader>
            <CardTitle>Top Models by Spend</CardTitle>
            <CardDescription>Most expensive models this month</CardDescription>
          </CardHeader>
          <CardContent>
            {byModel.length === 0 ? (
              <p className="text-muted-foreground text-sm">No usage data yet</p>
            ) : (
              <div className="space-y-3">
                {byModel.slice(0, 5).map((m, i) => (
                  <div
                    key={`${m.provider}-${m.model}`}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <div className="font-medium text-sm">{m.model}</div>
                      <div className="text-xs text-muted-foreground capitalize">{m.provider}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatUsd(m.totalUsd)}</div>
                      <div className="text-xs text-muted-foreground">{formatNumber(m.callCount)} calls</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### 5. Register routes and add navigation

Update `packages/api/src/routes/index.ts` to include new routes:

```typescript
import userApiKeysRouter from "./user-api-keys";
import userUsageRouter from "./user-usage";

// ... existing routes

app.use("/api/user/api-keys", authMiddleware, userApiKeysRouter);
app.use("/api/user/usage", authMiddleware, userUsageRouter);
```

Add navigation links in sidebar (location depends on existing navigation structure):

```tsx
// In sidebar/navigation component
<NavLink href="/app/settings/api-keys">API Keys</NavLink>
<NavLink href="/app/usage">Usage</NavLink>
```

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Can list API keys (showing provider + suffix only)
- [ ] Can add new API key with provider selection
- [ ] Can delete API key with confirmation dialog
- [ ] Provider status shows which source (user/system/none) is active
- [ ] Usage dashboard shows current month spend
- [ ] Daily usage chart displays last 30 days
- [ ] Provider breakdown shows percentages
- [ ] Top models table shows top 5 by spend
- [ ] Full API keys are NEVER exposed in UI or API responses
- [ ] Navigation links work correctly

## Test plan (copy/paste)

```bash
pnpm dev:services
pnpm build
pnpm dev:api &
pnpm dev:web

# Test API endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/user/api-keys/status
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/user/usage

# Add a test key via API
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-test1234567890abcdef"}' \
  http://localhost:3001/api/user/api-keys

# Verify key is listed with suffix only
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/user/api-keys

# Test UI
open http://localhost:3000/app/settings/api-keys
open http://localhost:3000/app/usage
```

## UI/UX considerations

- Keys are masked by default (password input type)
- Deletion requires explicit confirmation
- Clear visual distinction between user keys and system fallback
- Usage numbers formatted for readability (K, M suffixes)
- Charts are interactive with hover tooltips
- Empty states are handled gracefully

## Security considerations

- API never returns full key, only suffix
- Keys transmitted over HTTPS only
- Delete confirmation prevents accidental removal
- Rate limiting on key addition endpoint (if not already present)
- Input validation on key format

## Notes

- Depends on Tasks 078 and 079 being complete
- Consider adding key validation (test API call) as future enhancement
- Consider adding usage alerts/notifications as future enhancement
- Charts could be enhanced with a proper charting library (recharts, chart.js)
- Consider adding export functionality for usage data
