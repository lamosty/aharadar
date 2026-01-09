# Task 086: Documentation Refresh and New Docs Creation

## Priority: High

## Goal

Update outdated documentation and create new required docs to ensure documentation accurately reflects the current state of the codebase.

## Background

AhaRadar has evolved significantly with new features (user authentication, API keys, monitoring, new connectors). Documentation has not kept pace and needs a comprehensive refresh.

## Scope

### Part 1: Create New Documentation

#### 1.1 Create `docs/security.md`

Content to cover:

- **Encryption Approach**
  - User API keys encrypted at rest (AES-256-GCM)
  - Encryption key storage (environment variable)
  - Key rotation strategy
- **Session Security**
  - Cookie-based sessions
  - CSRF protection
  - Session expiration
- **API Key Security**
  - Hashed storage for user's own API keys
  - Encrypted storage for provider credentials
  - Key scoping and permissions
- **Future Improvements**
  - Envelope encryption
  - KMS integration (AWS KMS, HashiCorp Vault)
  - Audit logging

#### 1.2 Create `docs/providers.md`

Content to cover:

- **Provider Architecture**
  - Provider interface abstraction
  - Supported providers: OpenAI, Anthropic, Grok/xAI
  - Adding new providers
- **Configuration**
  - Per-provider API key setup
  - Model selection (provider, model_id)
  - Cost tiers and defaults
- **Budget Integration**
  - How providers interact with budget system
  - Token counting and cost estimation
  - Daily/monthly limits
- **Pricing Configuration**
  - `model_pricing` table structure
  - Updating pricing data
  - Fallback handling

#### 1.3 Create `docs/deployment.md`

Content to cover:

- **Local Development**
  - Required environment variables
  - Docker Compose setup (Postgres, Redis)
  - Development commands
- **Production Deployment**
  - Docker production setup
  - Environment variable reference (all vars with descriptions)
  - Health checks
  - Scaling considerations
- **Monitoring**
  - Prometheus metrics endpoints
  - Grafana dashboard setup
  - Key metrics to monitor
  - Alerting recommendations
- **Backup and Recovery**
  - Database backup strategy
  - Disaster recovery

### Part 2: Update Existing Documentation

#### 2.1 Update `docs/spec.md`

Review and update:

- Feature list (add authentication, API keys, web UI)
- Architecture overview (add packages/web, packages/api)
- User journeys (update with current flows)
- Non-functional requirements (add security, monitoring)

#### 2.2 Update `docs/architecture.md`

Review and update:

- Package structure (add packages/web, packages/api, packages/queues)
- Component diagram (add web UI, API layer, queue workers)
- Data flow (update with current pipeline)
- Monitoring components (Prometheus, metrics)
- Deployment architecture

#### 2.3 Update `docs/data-model.md`

Add missing tables:

- `user_api_keys` - User's provider API keys
- `sessions` - User session management
- Recent migrations (0007, 0008, etc.)

Update existing tables:

- `users` - Add new columns if any
- `sources` - Add new source types
- `content_items` - Add any new metadata patterns

#### 2.4 Update `docs/connectors.md`

Add documentation for:

- YouTube connector (when Task 083 complete)
- Telegram connector (when Task 085 complete)
- RSS-based types: podcast, substack, medium, arxiv, lobsters, producthunt, github_releases (when Task 084 complete)

Update existing:

- Reddit connector updates
- X_Posts connector updates
- Any connector contract changes

### Part 3: Process Improvement

#### 3.1 Add Documentation Checklist to PR Template

Create/update `.github/pull_request_template.md`:

```markdown
## Documentation Checklist

- [ ] If adding/changing features: Updated relevant docs
- [ ] If changing data model: Updated docs/data-model.md
- [ ] If changing connectors: Updated docs/connectors.md
- [ ] If changing API: Updated API documentation
- [ ] If adding env vars: Updated docs/deployment.md
```

## Files to Create

- `docs/security.md`
- `docs/providers.md`
- `docs/deployment.md`
- `.github/pull_request_template.md` (if not exists)

## Files to Update

- `docs/spec.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/connectors.md`

## Documentation Standards

Follow these standards for all docs:

1. **Structure**
   - Clear headings (H1 for title, H2 for sections, H3 for subsections)
   - Table of contents for long docs
   - Code examples with syntax highlighting

2. **Content**
   - Accurate and up-to-date
   - Concise but complete
   - Include examples where helpful
   - Link to related docs

3. **Maintenance**
   - Date stamps for major updates
   - Version references where applicable
   - Clear ownership

## Acceptance Criteria

- [ ] `docs/security.md` created with substantive content
- [ ] `docs/providers.md` created with substantive content
- [ ] `docs/deployment.md` created with substantive content
- [ ] `docs/spec.md` reviewed and updated
- [ ] `docs/architecture.md` reviewed and updated
- [ ] `docs/data-model.md` updated with new tables
- [ ] `docs/connectors.md` updated with new connectors
- [ ] PR template includes documentation checklist
- [ ] No major inconsistencies between docs and code
- [ ] All docs pass markdown lint

## Validation

```bash
# Check for broken internal links (if tool available)
# Check markdown formatting
pnpm format

# Manual review: read each doc and verify against code
```

## Commit Strategy

Split into multiple commits:

1. `docs: create security.md`
2. `docs: create providers.md`
3. `docs: create deployment.md`
4. `docs: update spec.md with current features`
5. `docs: update architecture.md with current structure`
6. `docs: update data-model.md with new tables`
7. `docs: update connectors.md with new connector types`
8. `chore: add documentation checklist to PR template`
