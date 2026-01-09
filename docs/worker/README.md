> Status: Active
> Owner: @jdubz
> Last Updated: 2026-01-09

# Job Finder Worker

Python worker service for job processing, company enrichment, and AI-powered analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Flask Worker                             │
├─────────────────────────────────────────────────────────────────┤
│  Queue Processors:                                               │
│    - JobProcessor: Job extraction, matching, scoring            │
│    - CompanyProcessor: Company enrichment via search/AI         │
│    - SourceProcessor: Job source discovery and scraping         │
├─────────────────────────────────────────────────────────────────┤
│  AI Integration (via AgentManager):                             │
│    - Supported agents: claude.cli, gemini.api                   │
│    - Budget enforcement and per-scope enablement                │
│    - Task types: extraction, analysis                           │
├─────────────────────────────────────────────────────────────────┤
│  Scoring System:                                                 │
│    - Profile reducer derives skills/experience from content-items│
│    - Experience-weighted skill matching with analog support     │
│    - Configurable bonuses/penalties via SkillMatchConfig        │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### AgentManager (`ai/agent_manager.py`)

Centralizes AI provider selection:
- Reads fresh config per call from `ai-settings`
- Traverses fallback chain until success or exhaustion
- Enforces daily budgets with model-specific cost rates
- Disables agents per-scope on auth/quota failures

### Profile Reducer (`profile/reducer.py`)

Derives scoring profile from content-items:
- Calculates `skill_years` from work history date ranges
- Handles overlapping jobs (counts longest coverage per month)
- Normalizes skills (lowercase, punctuation, synonyms)
- Builds analog map for equivalent skill matching

### Scoring Engine (`scoring/engine.py`)

Experience-weighted skill matching:
- `baseMatchScore` + `yearsMultiplier * min(years, maxYearsBonus)`
- Analog skills score neutral (not penalized)
- Missing skills apply `missingScore` penalty
- Capped by `maxBonus` and `maxPenalty`

Location/timezone scoring (uses personal-info):
- Remote: Bonus if allowed
- Hybrid/Onsite same city: Bonus (hybrid) or neutral (onsite)
- Hybrid/Onsite different city: Hard reject if `relocationAllowed=false`, else penalty
- Timezone: Per-hour penalty up to max, then hard reject

### Company Info Fetcher (`company_info_fetcher.py`)

Multi-source company enrichment:
- Web search via Tavily/Brave APIs
- Multi-query fallback strategy
- Workday URL company name extraction
- AI extraction with disambiguation hints

## Configuration

### Environment Variables

```bash
# Required
SQLITE_DB_PATH=/srv/job-finder/data/jobfinder.db

# AI Providers (at least one required)
CLAUDE_CODE_OAUTH_TOKEN=...  # For claude.cli agent
GOOGLE_API_KEY=...           # For gemini.api agent
# GEMINI_API_KEY=...         # Alternative to GOOGLE_API_KEY

# Search APIs (for company enrichment)
TAVILY_API_KEY=...
BRAVE_API_KEY=...
```

### Database Config

All configuration stored in `job_finder_config` table:
- `ai-settings`: Agent configs, fallback chains, model rates
- `match-policy`: Scoring weights, skill matching config
- `prefilter-policy`: Pre-match filtering rules
- `worker-settings`: Runtime settings (taskDelaySeconds, polling)

## Running

### Development

```bash
cd job-finder-worker
source venv/bin/activate
pip install -r requirements.txt
./run_dev.sh
```

### Production

```bash
./run_prod.sh
# Health check
curl -s http://localhost:5555/health
```

## Queue Item Types

| Type | Processor | Description |
|------|-----------|-------------|
| JOB | JobProcessor | Extract and score job listing |
| COMPANY | CompanyProcessor | Enrich company data |
| SCRAPE | SourceProcessor | Scrape job source for listings |
| SOURCE_DISCOVERY | SourceProcessor | Discover new job sources |
| SCRAPE_SOURCE | SourceProcessor | Full source scrape cycle |

## Files

```
src/job_finder/
├── ai/
│   ├── agent_manager.py      # AI provider orchestration
│   ├── providers.py          # Provider implementations (Claude CLI, Gemini API)
│   └── search_client.py      # Tavily/Brave clients
├── job_queue/
│   ├── processors/
│   │   ├── job_processor.py
│   │   ├── company_processor.py
│   │   └── source_processor.py
│   └── config_loader.py      # Config from database
├── profile/
│   └── reducer.py            # Content-items → ScoringProfile
├── scoring/
│   └── engine.py             # Job-candidate fit scoring
├── company_info_fetcher.py   # Company enrichment
└── flask_worker.py           # Main entry point
```
