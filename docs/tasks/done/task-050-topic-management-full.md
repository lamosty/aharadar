# Task 050: Full Topic Management System

## Problem

The app has topics at the database level but lacks UI for:
1. Creating new topics
2. Deleting topics
3. Switching between topics in the feed
4. Assigning sources to topics
5. Viewing topic-scoped feeds

Currently everything goes to "default" topic with no way to organize content.

## Vision

Users should be able to:
- Create multiple "radars" (topics) like "Tech News", "Finance", "Science"
- Assign sources to different topics
- Configure viewing profile per topic (daily tech radar, weekly science digest)
- Switch between topics in the feed view
- See only content from sources in the selected topic

## Current State

### Database
- `topics` table exists with `viewing_profile`, `decay_hours`, `last_checked_at`
- `sources.topic_id` links sources to topics
- Only "default" topic is created automatically

### API
- `GET /api/topics` - lists topics ✓
- `PATCH /api/topics/:id/viewing-profile` - updates viewing profile ✓
- Missing: `POST /api/topics` (create), `DELETE /api/topics/:id` (delete)

### Web
- Settings page shows topics list with viewing profile ✓
- Missing: Create topic button, delete topic, topic switcher in nav/feed

## Implementation Plan

### Phase 1: API Endpoints

**File:** `packages/api/src/routes/topics.ts`

Add:
```typescript
// POST /api/topics - Create new topic
fastify.post("/topics", async (request, reply) => {
  const { name, description, viewingProfile, decayHours } = request.body;
  // Validate name is unique for user
  // Create topic with optional viewing profile
  // Return created topic
});

// DELETE /api/topics/:id - Delete topic
fastify.delete("/topics/:id", async (request, reply) => {
  // Verify ownership
  // Don't allow deleting "default" topic
  // Move sources to "default" topic or delete them?
  // Delete topic
});

// PATCH /api/topics/:id - Update topic name/description
fastify.patch("/topics/:id", async (request, reply) => {
  const { name, description } = request.body;
  // Update topic metadata
});
```

**File:** `packages/db/src/repos/topics.ts`

Add:
```typescript
async delete(id: string): Promise<void>
async update(id: string, updates: { name?: string; description?: string }): Promise<Topic>
```

### Phase 2: Topic Switcher Component

**Files:**
- `packages/web/src/components/TopicSwitcher/TopicSwitcher.tsx`
- `packages/web/src/components/TopicSwitcher/TopicSwitcher.module.css`

```tsx
export function TopicSwitcher() {
  const { data } = useTopics();
  const [currentTopicId, setCurrentTopicId] = useTopicContext();

  return (
    <select
      value={currentTopicId}
      onChange={(e) => setCurrentTopicId(e.target.value)}
    >
      {data?.topics.map(topic => (
        <option key={topic.id} value={topic.id}>{topic.name}</option>
      ))}
    </select>
  );
}
```

### Phase 3: Topic Context

**File:** `packages/web/src/context/TopicContext.tsx`

```tsx
const TopicContext = createContext<{
  currentTopicId: string | null;
  setCurrentTopicId: (id: string) => void;
}>({ currentTopicId: null, setCurrentTopicId: () => {} });

export function TopicProvider({ children }) {
  const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);

  // Load from localStorage on mount
  // Update API requests to include topicId

  return (
    <TopicContext.Provider value={{ currentTopicId, setCurrentTopicId }}>
      {children}
    </TopicContext.Provider>
  );
}
```

### Phase 4: Update Feed to be Topic-Scoped

**File:** `packages/web/src/app/app/feed/page.tsx`

- Add TopicSwitcher to header
- Pass topicId to items API call
- Show topic name in feed header

**File:** `packages/api/src/routes/items.ts`

- Already scoped by `ctx.topicId` ✓
- Need to allow topicId override via query param for multi-topic support

### Phase 5: Topic Management in Settings

**File:** `packages/web/src/components/TopicViewingProfile/TopicsList.tsx`

Add:
- "Create Topic" button
- Delete button per topic (except default)
- Edit topic name inline

```tsx
<div className={styles.header}>
  <h3>Topics</h3>
  <button onClick={openCreateModal}>+ Create Topic</button>
</div>

{topics.map(topic => (
  <div key={topic.id} className={styles.topicCard}>
    <div className={styles.topicHeader}>
      <span>{topic.name}</span>
      {topic.name !== 'default' && (
        <button onClick={() => deleteTopic(topic.id)}>Delete</button>
      )}
    </div>
    {/* ... viewing profile settings ... */}
  </div>
))}
```

### Phase 6: Sources Page - Topic Assignment

**File:** `packages/web/src/app/app/sources/page.tsx` (or admin sources)

- Add topic column/badge to source list
- Add topic filter dropdown
- When creating source, allow selecting topic
- Bulk move sources between topics

**File:** `packages/api/src/routes/admin.ts` (or sources route)

- Add `PATCH /api/sources/:id` to update source's topic
- Add topic filter to `GET /api/sources`

## Data Flow

```
User creates topic "Tech News"
  → POST /api/topics { name: "Tech News", viewingProfile: "daily" }
  → Topic created with id

User creates source under "Tech News"
  → POST /api/admin/sources { ..., topicId: "..." }
  → Source linked to topic

User switches to "Tech News" in feed
  → TopicContext updates currentTopicId
  → GET /api/items?topicId=...
  → Only shows items from sources in that topic

User configures viewing profile
  → PATCH /api/topics/:id/viewing-profile
  → Topic-specific decay settings
```

## Files to Create/Modify

### New Files
- `packages/web/src/components/TopicSwitcher/TopicSwitcher.tsx`
- `packages/web/src/components/TopicSwitcher/TopicSwitcher.module.css`
- `packages/web/src/components/TopicSwitcher/index.ts`
- `packages/web/src/context/TopicContext.tsx`
- `packages/web/src/components/CreateTopicModal/` (optional)

### Modified Files
- `packages/api/src/routes/topics.ts` - Add create/delete endpoints
- `packages/db/src/repos/topics.ts` - Add delete/update methods
- `packages/web/src/app/app/feed/page.tsx` - Add topic switcher
- `packages/web/src/app/app/sources/page.tsx` - Add topic column
- `packages/web/src/components/TopicViewingProfile/TopicsList.tsx` - Add create/delete
- `packages/web/src/lib/api.ts` - Add API functions
- `packages/web/src/lib/hooks.ts` - Add hooks
- `packages/web/src/app/layout.tsx` - Wrap in TopicProvider

## Testing

1. Create new topic
2. Create source under new topic
3. Run pipeline for new topic
4. Switch between topics in feed
5. Verify items only show for selected topic
6. Delete topic (verify sources moved to default)
7. Verify viewing profile works per topic

## Priority

**High** - Core feature for the product vision of "multiple radars per user"

## Suggested Order

1. Task 048 (X posts display) - Quick fix, high impact
2. Task 049 (Settings UI fix) - Quick fix, medium impact
3. Task 050 Phase 1-2 (API + Switcher) - Foundation
4. Task 050 Phase 3-4 (Context + Feed) - Core UX
5. Task 050 Phase 5-6 (Settings + Sources) - Complete feature
