# Aha Radar — Web UI Spec

## Product UI Goal

Build a minimal, fast, and accessible web interface that lets users review personalized digests, provide feedback, and manage sources/budgets. The UI should feel snappy and responsive on both desktop and mobile, prioritizing the core "review → feedback → improve" loop with excellent "why shown" explainability.

## Route Map

### Marketing Routes (public)

| Route    | Purpose                                              |
| -------- | ---------------------------------------------------- |
| `/`      | Landing page (SEO-optimized, explains product value) |
| `/login` | Login UI (magic-link email form, no backend yet)     |

### App Routes (authenticated)

| Route                | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `/app`               | Dashboard shell / home (redirects to digests)  |
| `/app/digests`       | List of recent digests                         |
| `/app/digests/:id`   | Digest detail with ranked items                |
| `/app/items/:id`     | Content item detail                            |
| `/app/admin`         | Admin section home                             |
| `/app/admin/run`     | Run now form                                   |
| `/app/admin/sources` | Sources management                             |
| `/app/admin/budgets` | Budget status                                  |
| `/app/settings`      | User preferences (theme, layout, dev settings) |

**Future note (Astro migration):** Marketing pages (`/`, `/login`) may move to Astro later for better content/SEO performance. Keep design tokens, typography, and icons portable via CSS variables and shared assets.

## Screen-by-Screen Requirements

### Landing Page (`/`)

- Hero section with product value proposition
- Feature highlights (3-4 bullets)
- CTA to login/sign up
- SEO: proper meta tags, OG image, semantic HTML
- Fast: no heavy JS bundle for this page

### Login (`/login`)

- Email magic link input form (design only, no backend)
- Clear copy explaining "check your email"
- Error state for invalid email format
- Loading state during submission

### Dashboard / Home (`/app`)

- App shell with navigation
- Quick stats (optional): last digest time, items reviewed today
- Primary CTA: go to latest digest

### Digests List (`/app/digests`)

- List recent digests (default: last 7 days)
- Each row shows: window times, mode, item count, created date
- Three layout modes:
  - **Condensed**: dense table-like rows
  - **Reader**: cards with whitespace
  - **Timeline**: feed/timeline chronological view
- Skeleton loading state
- Empty state with guidance
- Error state with retry button
- Click navigates to digest detail
- Prefetch on hover (where supported)

### Digest Detail (`/app/digests/:id`)

- Header: window range, mode, item count
- Ranked list of items with:
  - Title + external URL link
  - Author, published date, source type
  - Triage summary (if present)
  - "Why shown" expandable panel
- Three layout modes matching list page
- Feedback buttons per item: like/dislike/save/skip
  - Optimistic update on click
  - Rollback on failure with toast
- Skeleton loading
- Cached/stale indicator when offline

### "Why Shown" Panel

Per-item expandable section showing `triageJson.system_features`:

- `signal_corroboration_v1`: URLs/topics that corroborate this item
- `novelty_v1`: novelty score and lookback info
- `source_weight_v1`: source/type weight applied
- `aha_score`: triage score and reason
- Gracefully render unknown future features (don't crash)

### Item Detail (`/app/items/:id`)

- Readable header: title, author, published date
- "Open original" button/link
- Collapsible metadata viewer (JSON)
  - Collapsed by default
  - Cap display depth/size to prevent layout blow-up
- Back navigation to digest

### Admin: Run Now (`/app/admin/run`)

- Form with:
  - Window start/end pickers (default: since last run)
  - Mode selector: low/normal/high/catch_up
- Submit button with loading state
- Success: show job ID and link to digests
- Error: show message with retry option

### Admin: Sources (`/app/admin/sources`)

- List all sources for the topic
- Per-source:
  - Name, type, enabled toggle (optimistic)
  - Edit cadence (interval minutes)
  - Edit weight (number with validation)
- Save changes with patch semantics
- Success/error toasts

### Admin: Budgets (`/app/admin/budgets`)

- Display:
  - Monthly: used / limit / remaining
  - Daily: used / limit / remaining (if configured)
  - `paidCallsAllowed` status
- **Degraded mode banner**: prominent warning when `paidCallsAllowed=false`
- Visual progress bars for budget usage
- Warning states when approaching limits

### Settings (`/app/settings`)

- Theme pack selector (3 options)
- Light/dark mode toggle
- Layout mode selector (Condensed/Reader/Timeline)
- **Dev settings** section:
  - API base URL input
  - API key input
  - Stored in localStorage
  - Clear guidance that this is for local development

## Theming Plan

### Theme Pack Concept

Ship 3 distinct visual "theme packs" with noticeably different aesthetics:

1. **Professional**: Clean, neutral palette, system fonts, minimal decoration
2. **Warm**: Warmer tones, slightly rounded corners, friendly feel
3. **Minimal**: High contrast, monospace accents, very sparse

Each theme pack is implemented via CSS custom properties:

```css
:root[data-theme="professional"] {
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-text: #212529;
  --color-primary: #0d6efd;
  --radius: 4px;
  --font-sans: system-ui, sans-serif;
}

:root[data-theme="warm"] {
  --color-bg: #fffbf5;
  --color-surface: #fef3e2;
  --color-text: #3d2c1e;
  --color-primary: #e67e22;
  --radius: 8px;
  --font-sans: "Georgia", serif;
}

:root[data-theme="minimal"] {
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-text: #111111;
  --color-primary: #000000;
  --radius: 0px;
  --font-sans: "SF Mono", monospace;
}
```

### Dark Mode

Each theme pack has a dark variant. Toggle stored in localStorage. Respect `prefers-color-scheme` on first visit.

### Persistence

- Theme pack: `localStorage.theme`
- Color mode: `localStorage.colorMode` (light/dark/system)
- Layout mode: `localStorage.layoutMode` (condensed/reader/timeline)

## Layout Plan

### Layout Pack Concept

Three distinct layout templates for content pages (different HTML/component structures, not just CSS):

1. **Condensed**: Dense table-like presentation
   - Minimal whitespace
   - Data-focused rows
   - Good for power users reviewing many items

2. **Reader**: Card-based editorial layout
   - More whitespace and typography
   - Summary text visible by default
   - Good for leisurely reading

3. **Timeline**: Feed/timeline layout
   - Chronological flow
   - Visual timestamps
   - Good for "what's new" mental model

### Implementation

```tsx
// Layout-specific components
<DigestsListCondensed />
<DigestsListReader />
<DigestsListTimeline />

// Selection via context
const { layoutMode } = useLayoutPreferences();
```

### Persistence

Layout mode stored in `localStorage.layoutMode`.

## App Shell / Navigation Plan

### NavModel

Define navigation as data, separate from presentation:

```ts
interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string; // icon name
  badge?: number; // optional count
}

const navItems: NavItem[] = [
  { key: "digests", label: "Digests", href: "/app/digests", icon: "inbox" },
  { key: "admin", label: "Admin", href: "/app/admin", icon: "settings" },
  { key: "settings", label: "Settings", href: "/app/settings", icon: "user" },
];
```

### NavVariant Concept

Architecture supports multiple nav presentations (only sidebar implemented initially):

- **Sidebar**: Desktop default, collapsible
- **TopNav**: Horizontal bar (future)
- **BottomNav**: Mobile tab bar (future)

### AppShell Component

```tsx
<AppShell>
  <AppShell.Nav /> {/* Slot: nav component */}
  <AppShell.Header /> {/* Slot: page header */}
  <AppShell.Main /> {/* Slot: page content */}
</AppShell>
```

Pages do not depend on specific nav structure; they only use shared layout slots.

## A11y Requirements (MVP)

- [ ] Keyboard navigation for all interactive elements
- [ ] Visible focus indicators (not just outline removal)
- [ ] Skip-to-content link
- [ ] Semantic HTML: proper headings hierarchy (h1 → h2 → h3)
- [ ] ARIA labels for icon-only buttons
- [ ] Accessible tables/lists with proper roles
- [ ] Color contrast ≥ 4.5:1 for text
- [ ] Form labels associated with inputs
- [ ] Error messages announced to screen readers

## Performance Requirements (MVP)

- [ ] Landing page: LCP < 2.5s
- [ ] App pages: initial render < 1s (with skeleton)
- [ ] Feedback actions: optimistic, < 100ms perceived
- [ ] Bundle: code-split by route
- [ ] Images: lazy load below fold
- [ ] Prefetch: next likely navigation on hover

## Loading / Offline Behavior

### Loading States

- **Initial load**: Full-page skeleton matching layout
- **Navigation**: Route transition indicator (top bar)
- **Actions**: Button loading spinners
- **Refetch**: Subtle inline indicator (don't block UI)

### Offline Handling

- Detect offline via `navigator.onLine` and fetch errors
- Show banner: "You're offline - showing cached data"
- Read from cache when available (stale-while-revalidate)
- Mark data as "cached/stale" with timestamp
- Queue feedback actions for retry when online
- Disable admin actions when offline

## i18n Plan (MVP)

### Scaffold

Central message files with type-safe accessor:

```
packages/web/src/messages/
  en.json
```

```ts
// Usage
import { t } from "@/lib/i18n";
t("digests.empty"); // "No digests yet"
```

### Scope

- English only in MVP
- Structure supports adding locales later
- All user-facing strings in message files (not hardcoded)

## API Data Needs

### Existing Endpoints (implemented)

- `GET /api/health` - health check
- `GET /api/digests?from=&to=` - list digests
- `GET /api/digests/:id` - digest detail with items
- `GET /api/items/:id` - item detail
- `POST /api/feedback` - submit feedback
- `POST /api/admin/run` - trigger pipeline run

### Required Endpoints (to add)

- `GET /api/admin/sources` - list sources for UI
- `PATCH /api/admin/sources/:id` - update source (name, enabled, cadence, weight)
- `GET /api/admin/budgets` - budget status for UI

## Test Strategy

### Unit Tests (`pnpm test`)

- Hermetic, no external dependencies
- Test utility functions, hooks, data transformations
- Run fast in CI

### E2E Tests (`pnpm test:e2e`)

- Playwright with network mocking
- No real API/DB required
- Test core flows:
  - Landing page renders
  - Navigation works
  - Digests list → detail → item detail
  - "Why shown" panel opens/closes
  - Feedback optimistic updates
  - Admin forms work
- Use `data-testid` for stable selectors

### Test Organization

```
packages/web/
  src/
    __tests__/        # Unit tests
  e2e/
    digests.spec.ts   # E2E specs
    admin.spec.ts
    ...
```

## Deployment

Target: Hetzner Ubuntu server with Docker.

- Build as standalone Next.js output
- Container image via Dockerfile
- Run alongside API/worker in Docker Compose
- Nginx/Caddy reverse proxy for TLS termination
- Environment variables for API URL configuration
