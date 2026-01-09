# ✅ DONE

# Task 071: Admin vs User Section Separation

## Priority: High

## Problem

Current UI mixes admin/management features with user features:

- Digests view: Useful for admin debugging, not typical user workflow
- Sources management: Admin function
- Budget monitoring: Admin function
- Dashboard: Unclear purpose

## Questions to Resolve

1. Should Digests be hidden from regular users or moved to admin?
2. What should the user-facing sidebar contain?
3. Should there be a role-based access system?
4. Should admin features require explicit opt-in in settings?

## Proposed User Sidebar

- Feed (primary view)
- Topics (manage what you follow)
- Settings (preferences)

## Proposed Admin Sidebar (separate section or hidden by default)

- Run Pipeline
- Sources Management
- Digests (debug view)
- Budgets

## Implementation Options

### Option A: Settings Toggle

- Add "Show admin features" toggle in Settings
- When enabled, admin section appears in sidebar

### Option B: Separate /admin Route

- Keep admin at /app/admin/\*
- Remove admin links from main sidebar
- User must navigate to /app/admin directly

### Option C: Role-Based

- Add `isAdmin` flag to user
- Show/hide based on role

## Related Tasks

- Task 072: Design overhaul
- Task 073: Dashboard purpose

## Acceptance Criteria

- Clear separation between user and admin features
- Users see a clean, focused interface
- Admins can still access management tools
