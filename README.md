# Aha Radar

**Surface signal from noise.** A personalized content aggregation system that monitors your chosen sources and delivers curated digests of only the most relevant content.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

## What is Aha Radar?

Aha Radar is a self-hosted content aggregation and ranking system that helps you stay on top of information from multiple sources without drowning in noise. It uses AI to score and rank content based on your preferences, delivering personalized digests of high-signal items.

**Key capabilities:**

- **20+ content sources** — Reddit, Hacker News, RSS, YouTube, X/Twitter, Substack, Medium, ArXiv, GitHub releases, podcasts, SEC filings, and more
- **AI-powered ranking** — LLM-based triage scores content relevance with explainable reasoning
- **Personalized learning** — Feedback loop improves recommendations over time
- **Budget control** — Monthly credit limits with tier-based fallbacks prevent runaway API costs
- **Topic collections** — Organize sources into topics with independent schedules
- **Catch-up packs** — AI-generated summaries for when you've been away
- **Semantic search** — Find past content using natural language queries

## Quick Start

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- pnpm 9+
- Docker Desktop

### Installation

```bash
# Clone the repository
git clone https://github.com/lamosty/aharadar.git
cd aharadar

# Copy environment template
cp .env.example .env

# Start infrastructure (Postgres + Redis)
./scripts/dev.sh

# Apply database migrations
./scripts/migrate.sh

# Install dependencies
pnpm install

# Start the application
pnpm start
```

Open http://localhost:3000 in your browser.

### Running Modes

| Command | Description |
|---------|-------------|
| `pnpm start` | Development mode with hot reload |
| `pnpm start:prod` | Production mode (faster, recommended for daily use) |

**Production mode** builds the Next.js frontend first, resulting in much faster page loads. Use this when you're not actively developing.

**LAN access:** Add `:lan` suffix to access from other devices on your network (e.g., `pnpm start:prod:lan` for a home server setup).

### Personal Server + Subscription Providers

`claude-subscription` and `codex-subscription` are experimental and intended for personal/self-hosted use on your own machine or private server only.

Use at your own risk. For OSS/public/shared deployments, use API-key providers (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) instead of subscription mode.

If you still use subscription mode, run both API and worker as your user (not in Docker) so digest triage and manual summaries can access your user-scoped login state (`claude login` / `codex login`).

Use this guide: [`docs/personal-server-systemd.md`](docs/personal-server-systemd.md)

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

**Required:**
```bash
# Database (defaults work with Docker)
DATABASE_URL=postgres://aharadar:aharadar_dev_password@localhost:5432/aharadar
REDIS_URL=redis://localhost:6379

# LLM Provider (at least one required)
OPENAI_API_KEY=sk-...           # OpenAI API key
# OR
ANTHROPIC_API_KEY=sk-ant-...    # Anthropic API key

# Budget limits
MONTHLY_CREDITS=10000           # Monthly credit cap
DEFAULT_TIER=normal             # low | normal | high
```

**Optional — Port configuration:**
```bash
WEB_PORT=3000                   # Web frontend port
API_PORT=3001                   # API server port
API_URL=http://localhost:3001   # Internal API URL for proxy
```

**Optional — Additional connectors:**
```bash
# X/Twitter via Grok
SIGNAL_GROK_API_KEY=xai-...

# Financial data (untested)
QUIVER_API_KEY=...              # Congress trading
UNUSUAL_WHALES_API_KEY=...      # Options flow
FINNHUB_API_KEY=...             # Market sentiment
```

See `.env.example` for all available options.

### Port Conflicts

If ports 3000/3001 are already in use:

```bash
# In .env
WEB_PORT=3010
API_PORT=3011
API_URL=http://localhost:3011

# Then export before running
export WEB_PORT=3010 API_PORT=3011 API_URL=http://localhost:3011
pnpm start:lan
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Aha Radar                                │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│   Web UI    │     API     │   Worker    │     Queue UI         │
│  (Next.js)  │  (Fastify)  │  (BullMQ)   │   (Dashboard)        │
│   :3000     │    :3001    │             │      :3101           │
└──────┬──────┴──────┬──────┴──────┬──────┴──────────────────────┘
       │             │             │
       └─────────────┼─────────────┘
                     │
       ┌─────────────┴─────────────┐
       │                           │
  ┌────┴────┐               ┌──────┴──────┐
  │ Postgres │               │    Redis    │
  │ +pgvector│               │   (BullMQ)  │
  │  :5432   │               │    :6379    │
  └──────────┘               └─────────────┘
```

### Pipeline Stages

1. **Ingest** — Fetch content from configured sources
2. **Normalize** — Convert to unified content format
3. **Embed** — Generate vector embeddings for semantic search
4. **Dedupe** — Remove duplicates by URL/content hash
5. **Triage** — AI scores relevance (Aha Score) with reasoning
6. **Rank** — Combine AI score with personalization signals
7. **Enrich** — Generate summaries for top items
8. **Digest** — Persist ranked items for delivery

## Features

### Content Sources

**Tested in production:**
- Reddit, Hacker News, X/Twitter (via Grok), RSS

**Implemented but not yet tested:**
- Lobsters, Product Hunt, Substack, Medium, YouTube, ArXiv, GitHub releases, SEC EDGAR, Congress trading, Options flow, Podcasts, Telegram, Polymarket

The connector architecture is modular — contributions to test and improve additional sources are welcome!

### Web Interface

- **Feed** — Browse ranked content with like/dislike actions
- **Digests** — View historical digest runs
- **Topics** — Manage source collections
- **Search** — Semantic search across all content
- **Bookmarks** — Save items for later
- **Admin** — System configuration and monitoring

### Admin Features

- Trigger pipeline runs manually
- Monitor source health and fetch status
- View system logs and provider calls
- Configure LLM providers and models
- Run A/B experiments on ranking algorithms
- Adjust budget and rate limits

## Development

### Project Structure

```
aharadar/
├── packages/
│   ├── api/          # Fastify API server
│   ├── web/          # Next.js frontend
│   ├── worker/       # BullMQ job processor
│   ├── cli/          # Command-line interface
│   ├── db/           # Database migrations & repos
│   ├── llm/          # LLM provider abstraction
│   ├── pipeline/     # Content processing stages
│   ├── connectors/   # Source connectors
│   ├── queues/       # Job queue definitions
│   └── shared/       # Shared utilities & types
├── scripts/          # Operational scripts
├── docker/           # Docker configurations
├── infra/            # Prometheus & Grafana configs
└── docs/             # Technical documentation
```

### Useful Commands

```bash
# Development
pnpm dev:api          # Run API server only
pnpm dev:web          # Run Next.js frontend only
pnpm dev:worker       # Run background worker only

# Database
./scripts/migrate.sh  # Apply migrations
./scripts/reset.sh    # Reset database (destroys data)

# Code quality
pnpm format           # Format with Biome
pnpm typecheck        # TypeScript check
pnpm test             # Run tests

# Infrastructure
./scripts/dev.sh      # Start Postgres + Redis
./scripts/down.sh     # Stop services
./scripts/logs.sh     # View logs
```

### Authentication (Dev Mode)

In development, you can bypass email authentication:

1. Go to the login page
2. (Optional) Enter an email for admin access
3. Click "Dev Bypass"

This sets auth cookies without requiring email verification.

## Monitoring

The stack includes Prometheus and Grafana for observability:

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3002 (admin/admin)
- **Queue UI**: http://localhost:3101

Pre-configured dashboards show:
- Pipeline run metrics
- LLM provider call stats
- Source fetch health
- Budget consumption

## Documentation

Detailed documentation is available in the `docs/` folder:

- [`docs/spec.md`](docs/spec.md) — Product specification
- [`docs/architecture.md`](docs/architecture.md) — System design
- [`docs/pipeline.md`](docs/pipeline.md) — Pipeline stages
- [`docs/connectors.md`](docs/connectors.md) — Connector development
- [`docs/api.md`](docs/api.md) — API reference
- [`docs/budgets.md`](docs/budgets.md) — Budget system
- [`docs/llm.md`](docs/llm.md) — LLM integration
- [`docs/personal-server-systemd.md`](docs/personal-server-systemd.md) — Personal server deployment with user systemd worker

## Tech Stack

- **Runtime**: Node.js 22, TypeScript 5.7
- **Frontend**: Next.js 16, React 19, TanStack Query
- **Backend**: Fastify, BullMQ
- **Database**: PostgreSQL 16 + pgvector
- **Cache/Queue**: Redis 7
- **LLM**: OpenAI, Anthropic Claude (provider-agnostic)
- **Monitoring**: Prometheus, Grafana
- **Code Quality**: Biome, Husky

## Contributing

Contributions are welcome! Please read the development guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm format && pnpm typecheck`
5. Submit a pull request

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(connectors): add Bluesky connector
fix(pipeline): handle empty embeddings
docs: update installation guide
```

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

Built with support from the open source community. Special thanks to:
- The Next.js and React teams
- PostgreSQL and pgvector contributors
- The BullMQ project
