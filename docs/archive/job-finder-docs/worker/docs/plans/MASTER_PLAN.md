# Job Finder Application - Master Development Plan

**Created:** 2025-10-27  
**Version:** 1.0  
**Status:** ACTIVE  
**Timeline:** 6-12 months  
**Last Updated:** 2025-10-27

---

## 🎯 Executive Summary

This master plan consolidates all sub-plans across the Job Finder Application ecosystem into a single, prioritized roadmap. The plan focuses on three parallel tracks:

1. **Autonomous Development System** (app-monitor evolution)
2. **Core Application Enhancements** (job-finder-BE, FE, worker)
3. **Quality & Testing** (test coverage across all repos)

**Key Metrics:**

- 5 repositories to manage
- 21 planning documents consolidated
- Estimated 6-12 months for full execution
- Priority: High-value features + autonomous system capabilities

---

## 🧭 Long-Term Goals (Through September 30, 2026)

- **Platform Decoupling & Deployment:** By April 30, 2026, run app-monitor as a project-agnostic system service on this workstation with a dedicated Cloudflare tunnel, per-work-target configuration loading sourced from each repository while keeping app-monitor-specific notes in its own database, and automatic production deployments triggered on every `main` push while maintaining the current quality gate guarantees.
- **Autonomous Development Platform:** Complete Phases 1 through 4 of the app-monitor evolution by July 31, 2026, achieving a sustained task success rate above 90%, auto-triaging at least 80% of failures without human intervention, and limiting human escalation time per task to under 30 minutes across any registered work target.
- **Multi-Model Efficiency:** Integrate Anthropic, OpenAI, Codex CLI, and Copilot provider abstractions with dynamic routing by May 31, 2026, cutting average token spend per completed task by at least 35% while keeping quality gate pass rates at or above 95%.
- **Dev-Bot Workspace Reliability:** By May 31, 2026, deliver configurable per-project bot templates and prompts in the frontend, enforce single-repository task boundaries, guarantee collision-free containerized workspaces, and preserve a proven `commit → push to staging` workflow that prevents loss of uncommitted changes while introducing dependency-aware scheduling that defers or sequences incompatible tasks automatically.
- **Operator Console Access:** By August 31, 2026, expose a UI flow that launches ephemeral operator dev-bots for the app-monitor work target, lets the operator choose Claude or Codex, and grants scoped production access (configuration, prompts, task creation) for real-time troubleshooting without compromising existing automation safeguards.
- **Worker Intelligence & Discovery:** Deliver the parser caching, auto-discovery, and quality monitoring milestones outlined in the worker improvement plan by June 30, 2026, driving cached parser coverage above 90%, uncovering a minimum of five net-new job sources each month, and reducing end-to-end job processing cost to below $0.15.
- **Documentation & Repository Realignment:** Sunset the `job-finder-app-manager` repository by August 31, 2026, migrate documentation into the respective work-target repositories (with cross-repo architecture docs synchronized automatically), and retain operational notes inside the app-monitor database without introducing app-monitor-aware files into the repos.
- **Operational Observability:** Stand up unified telemetry spanning logs, metrics, and incident response across repos by September 30, 2026, with alerting under five minutes from failure detection, 99.5% service availability targets codified, and quarterly disaster-recovery tests recorded in operations runbooks. Harden authentication (MFA or hardware keys) once risk warrants it.

---

## 🔀 Multi-Repo Work Target Strategy – Options Analysis

| Approach | Description | Pros | Cons |
| --- | --- | --- | --- |
| **Single Work Target (Preferred)** | Model the larger initiative (e.g., Job Finder) as one work target; individual tasks specify the repository they operate in. | Unified scheduling, reporting, and quality metrics across related repos; shared per-target configuration and notes; easier sequencing of cross-repo work while still constraining bots to one repo per task. | Requires careful task scoping and UI affordances so bots are never assigned cross-repo work; more complex target configuration schema; repository-level automation must prevent accidental multi-repo diffs. |
| **Multiple Work Targets (Per Repo)** | Create one work target per repository and coordinate the initiative manually across targets. | Simpler configuration and isolation per repo; less chance of accidental cross-repo changes; straightforward per-repo telemetry. | Fragmented visibility into initiative progress; duplicated planning effort; harder to stage automation that needs awareness of the larger project; increases overhead once work spans more than one repo. |

---

## 📊 Current State Assessment

### Repository Status (as of Oct 27, 2025)

| Repository                  | Purpose                         | Status        | Test Coverage            | Priority    |
| --------------------------- | ------------------------------- | ------------- | ------------------------ | ----------- |
| **job-finder-BE**           | Backend API, Firebase Functions | ✅ Stable     | ~60-70%                  | Medium      |
| **job-finder-FE**           | React Frontend Application      | ✅ Stable     | ~28%                     | Medium      |
| **job-finder-worker**       | Python Job Scraping Worker      | ✅ Stable     | ~56%                     | High        |
| **job-finder-shared-types** | TypeScript Type Definitions     | ✅ Stable     | N/A                      | Low         |
| **app-monitor**             | Dev-Bots Management System      | 🚧 Active Dev | BE: ~70-80%, FE: ~60-70% | **HIGHEST** |

### Completed Work ✅

- Backend testing infrastructure (256 tests passing)
- App-monitor basic architecture
- Core job finder features
- Firebase integration
- AI provider integration (Gemini, OpenAI)

### Active Plans

1. **EVOLUTION_PLAN_V2_REFINED.md** - Autonomous development system (PRIMARY)
2. **CODEX_IMPROVEMENT_PLAN.md** - Codex CLI integration
3. **copilot-integration-suggestions.md** - GitHub Copilot integration
4. **JOB_FINDER_WORKER_CONSOLIDATED_IMPROVEMENT_PLAN_V2.md** - Worker intelligence
5. **test-coverage-improvement-plan.md** - Testing strategy

---

## 🎪 Three-Track Parallel Execution

```
Track 1: AUTONOMOUS SYSTEM (App-Monitor Evolution)
├── Phase 1: Foundation (2-3 weeks) - Token tracking, Quality gates
├── Phase 2: Multi-Model (3-4 weeks) - Provider abstraction
├── Phase 3: Learning (3-4 weeks) - A/B testing, Experiments
├── Phase 4: Self-Improvement (2-3 weeks) - Auto-optimization
└── Phase 5: Self-Building (Ongoing) - System builds itself

Track 2: CORE APPLICATION (Job Finder Enhancements)
├── Phase 1: Worker Intelligence (3-4 weeks) - Smart caching
├── Phase 2: Cost Optimization (2-3 weeks) - Parser caching
├── Phase 3: Auto-Discovery (3-4 weeks) - New sources
└── Phase 4: Self-Healing (2-3 weeks) - Quality monitoring

Track 3: QUALITY & TESTING (All Repositories)
├── Phase 0: Architecture Foundation (2 weeks) - Critical path tests
├── Phase 1: Critical Tests (4 weeks) - High-impact areas
├── Phase 2: High-Impact Tests (3 weeks) - Important features
└── Phase 3: Infrastructure Tests (3 weeks) - Monitoring, devtools
```

**Timeline:** 12 weeks minimum per track (parallel execution = 12-16 weeks total)

---

## 🚀 Priority 1: Autonomous Development System

**Objective:** Build self-improving, autonomous development platform  
**Timeline:** 10-14 weeks (Phase 1-5)  
**Primary Document:** `EVOLUTION_PLAN_V2_REFINED.md`  
**Status:** Phase 1.0 ready to start

### Phase 1: Foundation (Weeks 1-3) 🔥 CRITICAL

**Goal:** Production-ready system with quality enforcement and budget controls

#### Phase 1.0: Preparation & Refactoring ✅ COMPLETED (2025-10-27)

- [x] Rename Claude Workers → Dev-Bots (all references)
- [x] Audit dev-bots folder, cleanup zombies
- [x] Replace static bot volumes with `WorkspaceOrchestrator` dynamic provisioning
- [x] Introduce PushCoordinator + workspace sealing pipeline for guaranteed staging pushes
- [x] Remove legacy worktrees/volume docs, update developer onboarding
- [x] Setup SQLite database for metrics/history

**Deliverables:**

- ✅ Unified dev-bots terminology
- ✅ Ephemeral workspace provisioning with automatic staging push + patch fallback
- ✅ Git push queue guarding concurrent dev-bot commits
- ✅ SQLite database operational with migrations
- ✅ 6 granular tasks completed (see `PHASE_1.0_TASKS.md`)

**Actual Implementation:**
Dynamic workspaces are created on-demand via `WorkspaceOrchestrator`, cloning `staging` into temporary directories inside Docker containers. Upon task completion, a sealing step commits, rebases, and pushes through `PushCoordinator`; conflicts produce archival patches in `dev-bots/artifacts/` so no work is lost when containers shut down.

**Database Layer:** ✅ Token usage, batch approvals, failure patterns, and quality scores tables created with full CRUD methods.

#### Phase 1.1: Token Tracking Integration ✅ COMPLETED (2025-10-27)

- [x] Research Claude API & Codex CLI usage limits ✅
- [x] Implement TokenTrackingService (wraps database methods) ✅
- [x] Add token tracking API endpoints ✅
- [x] Integrate with devBotsManager for automatic tracking ✅
- [x] Budget enforcement with warnings and hard stops ✅
- [ ] Dashboard token monitoring widgets (deferred to UI phase)

**Deliverables:**

- ✅ `tokenTracking.ts`: Service with budget management, usage recording, cost calculation
- ✅ `tokenTracking.test.ts`: Comprehensive test coverage
- ✅ `token-tracking.routes.ts`: REST API for token tracking (/token-tracking/\*)
- ✅ devBotsManager integration: Auto-records token usage on task completion
- ✅ Budget enforcement: Warnings at threshold, hard stop when exceeded
- ✅ Multi-provider support: Claude, Codex, OpenAI with separate budgets

#### Phase 1.2: Quality Gates Enforcement ✅ COMPLETED (2025-10-27)

- [x] Create QualityGateValidator service ✅
- [x] Integrate with devBotsManager ✅
- [x] Implement post-completion verification ✅
- [x] Quality gate results stored in tasks ✅
- [ ] Update agent prompts for quality requirements (deferred)
- [ ] Auto-healing task creation on failure (deferred to Phase 1.5)

**Deliverables:**

- ✅ `qualityGates.ts`: Service with 6 quality gates (linting, testing, typecheck, docs, git, build)
- ✅ `qualityGates.test.ts`: Comprehensive test coverage
- ✅ `quality-gates.routes.ts`: REST API for quality gates (/quality-gates/\*)
- ✅ devBotsManager integration: Auto-validates tasks after completion
- ✅ Configurable gate requirements (required vs optional)
- ✅ Weighted scoring system for overall quality
- ✅ Event emission for UI updates

#### Phase 1.3: Quality Scoring Framework (Week 2) 🔥 NEXT

- [ ] Implement TaskScoringService
- [ ] Create scoring algorithms (completion, quality, tests, process, efficiency)
- [ ] Create Review Agent personality
- [ ] Auto-calculate scores on completion
- [ ] Store scores in database

**Deliverables:**

- Every task scored automatically
- Review agent operational
- Quality trends tracked
- Historical scoring data

#### Phase 1.4: Batch Approval System (Week 2)

- [ ] Implement BatchApprovalManager
- [ ] Add batch counter tracking
- [ ] Integrate with task queue
- [ ] Add batch approval API
- [ ] Build UI controls for batch management

**Deliverables:**

- Approve N tasks at once
- System pauses when batch complete
- Failure stops execution immediately
- Batch history tracked

#### Phase 1.5: Basic Healing System (Weeks 2-3)

- [ ] Implement FailurePatternDetector
- [ ] Create healing task templates
- [ ] Add manual healing triggers
- [ ] Categorize failure types
- [ ] Store failure patterns

**Deliverables:**

- Automatic failure categorization
- Manual healing task creation
- Failure pattern history
- V1: All failures stop system

#### Phase 1.6: Dependency-Aware Scheduler (Weeks 3-4)

- [ ] Define minimal metadata for expressing task dependencies and incompatibilities
- [ ] Detect pending tasks that touch the same repository or resource and serialize them when conflicts arise
- [ ] Surface blocking relationships in the UI and API so new tasks can be deferred gracefully
- [ ] Add safety checks that prevent bot execution when prerequisites are incomplete
- [ ] Log scheduling decisions for auditability and future optimization

**Deliverables:**

- Scheduler classifies tasks as compatible or blocked before dispatch
- UI clearly displays blocked/on-hold tasks with the reason
- Bots never run concurrently against incompatible scopes
- Audit log shows why tasks were deferred or allowed through

**Phase 1 Success Criteria:**

- [ ] 100 tasks executed with >90% success rate
- [ ] Daily token budgets respected
- [ ] All quality gates enforcing
- [ ] Batch approval system working
- [ ] Basic healing available

---

### Phase 2: Multi-Model Integration (Weeks 4-7)

**Goal:** Support multiple AI providers with intelligent routing

#### Phase 2.1: Model Research (Week 4)

- [ ] Research all Anthropic models (Claude family)
- [ ] Research OpenAI models (GPT-4, o1 series)
- [ ] Research Cursor integration
- [ ] Research GitHub Copilot capabilities
- [ ] Document costs, limits, strengths/weaknesses

**Deliverable:** `MODEL_RESEARCH.md`

#### Phase 2.2: Provider Abstraction Layer (Weeks 4-5)

- [ ] Create ModelProvider interface
- [ ] Implement AnthropicProvider
- [ ] Implement OpenAIProvider
- [ ] Implement CursorProvider (research first)
- [ ] Implement GitHubCopilotProvider
- [ ] Create provider registry
- [ ] Add provider health checks
- [ ] Implement failover logic

**Deliverables:**

- Unified provider interface
- 4 providers operational
- Token tracking per provider
- Provider health monitoring

#### Phase 2.3: Complexity-Based Routing (Week 6)

- [ ] Create ComplexityCalculator service
- [ ] Implement complexity scoring algorithm
- [ ] Create model selection logic
- [ ] Add manual override capability
- [ ] Log selection rationale
- [ ] Track selection accuracy

**Deliverables:**

- Tasks auto-routed to optimal model
- Complexity scores calculated
- Selection tracked for learning

#### Phase 2.4: GitHub Copilot Integration (Weeks 6-7)

**Reference:** `copilot-integration-suggestions.md`

- [ ] Research GitHub Copilot APIs
- [ ] Implement Copilot PR review automation
- [ ] Implement issue triage workflow
- [ ] Add async task support
- [ ] Create GitHub Actions workflows
- [ ] Integrate with quality gates

**Deliverables:**

- Copilot reviews PRs automatically
- Issues auto-triaged to tasks
- Async tasks supported
- Cost savings validated

#### Phase 2.5: Operator Console Interface (Week 7)

- [ ] Design UI flow to launch an ephemeral dev-bot targeting the app-monitor work target
- [ ] Allow provider selection (Claude or Codex) per operator session
- [ ] Grant scoped access so the operator bot can create tasks, edit prompts/configs, and inspect production logs without colliding with automation
- [ ] Record every operator session with audit metadata (who launched, provider, actions taken)
- [ ] Provide an emergency stop/cleanup routine that tears down the operator container and rolls back incomplete changes if needed

**Deliverables:**

- Operator console visible in the frontend with guarded entry points
- Operator bots inherit production configuration safely and exit cleanly
- Activity logs stored for future security hardening
- No regressions to automated workflows while the operator bot is running

**Phase 2 Success Criteria:**

- [ ] Multi-model routing reduces tokens by >20%
- [ ] Model selection accuracy >85%
- [ ] All providers integrated and monitored
- [ ] Copilot handling 80% of PR reviews

---

### Phase 3: A/B Testing & Learning (Weeks 8-11)

**Goal:** Systematic experimentation and continuous learning

#### Phase 3.1: A/B Testing Framework (Weeks 8-9)

- [ ] Create ExperimentManager service
- [ ] Implement variant assignment logic
- [ ] Add experiment tracking
- [ ] Create experiment definition API
- [ ] Build experiment management UI
- [ ] Implement pause/resume

**Deliverables:**

- Can define experiments via API/UI
- Tasks randomly assigned to variants
- Results tracked automatically
- Multiple concurrent experiments

#### Phase 3.2: Statistical Analysis (Week 9)

- [ ] Create StatisticalAnalyzer service
- [ ] Implement t-test comparison
- [ ] Calculate confidence intervals
- [ ] Determine significance
- [ ] Create results visualization
- [ ] Auto-graduate winning variants

**Deliverables:**

- Statistical significance calculated
- Clear winner determination
- Winning variants promoted
- Human-readable analysis

#### Phase 3.3: Adaptive Learning Integration (Weeks 10-11)

- [ ] Integrate existing AdaptiveLearning class
- [ ] Auto-record task feedback
- [ ] Enable pattern recognition
- [ ] Use predictions for planning
- [ ] Surface recommendations
- [ ] Configure learning parameters

**Deliverables:**

- All tasks record feedback automatically
- Patterns recognized and stored
- Success probability predicted
- Recommendations surfaced to humans

#### Phase 3.4: Learning Analysis Agent (Week 11)

- [ ] Create "Data Analyst" agent personality
- [ ] Create analysis prompt templates
- [ ] Implement periodic analysis triggers
- [ ] Generate analysis reports
- [ ] Add recommendation approval workflow
- [ ] Integrate with experiment system

**Deliverables:**

- Agent analyzes historical data
- Identifies patterns and correlations
- Proposes actionable experiments
- Reports comprehensive and actionable

**Phase 3 Success Criteria:**

- [ ] 3+ experiments show statistically significant results
- [ ] Learning system makes accurate predictions
- [ ] Data analyst generates valuable recommendations
- [ ] System continuously improving

---

### Phase 4: Self-Improvement (Weeks 12-14)

**Goal:** System can tune itself based on learnings

#### Phase 4.1: Self-Tuning Task Type (Week 12)

- [ ] Create system-optimization task type
- [ ] Implement optimization analysis logic
- [ ] Create change proposal system
- [ ] Integrate with task queue
- [ ] Add optimization history tracking
- [ ] Create optimization dashboard

**Deliverables:**

- System triggers optimization tasks
- Proposals specific and actionable
- Changes implemented via tasks
- Impact tracked over time

#### Phase 4.2: Prompt Evolution System (Week 13)

- [ ] Create PromptVersionManager service
- [ ] Implement prompt versioning
- [ ] Integrate with A/B testing
- [ ] Create prompt proposal logic
- [ ] Add rollback capability
- [ ] Create prompt history UI

**Deliverables:**

- Prompts versioned
- Can A/B test prompt variations
- Winning prompts auto-promoted
- Can rollback to previous versions

#### Phase 4.3: Auto-Triage System (Weeks 13-14)

- [ ] Create FailureTriage service
- [ ] Implement categorization logic
- [ ] Create triage response handlers
- [ ] Add auto-fix capabilities
- [ ] Implement intelligent retry
- [ ] Add triage history tracking
- [ ] Create triage configuration UI

**Deliverables:**

- All failures categorized automatically
- Appropriate triage response executed
- Auto-retry for fixable failures
- Unknown failures still stop system
- Triage success rate tracked

#### Phase 4.4: Config Self-Modification (Week 14)

- [ ] Create ConfigManager service
- [ ] Implement config change proposals
- [ ] Add approval workflow for critical changes
- [ ] Implement auto-apply for safe changes
- [ ] Add config version control
- [ ] Create config change history
- [ ] Add rollback mechanism
- [ ] Create config management UI

**Deliverables:**

- System proposes config changes
- Critical changes require approval
- Safe changes auto-applied
- All changes tracked and reversible

**Phase 4 Success Criteria:**

- [ ] System proposes viable optimization (validated)
- [ ] Auto-triage handles >80% of failures
- [ ] Prompt evolution shows improvement
- [ ] Config changes tracked and safe

---

### Phase 5: Self-Building System (Weeks 15+)

**Goal:** System builds and improves itself

#### Phase 5.1: Bootstrap Self-Building (Week 15)

- [ ] Create meta-development task queue
- [ ] Add task generation capability to analysts
- [ ] Create self-improvement task templates
- [ ] Add architectural change detection
- [ ] Implement human approval for arch changes
- [ ] Create impact monitoring

**Deliverables:**

- System creates its own tasks
- Self-improvement tasks follow same workflow
- Architectural changes flagged for review
- Impact tracked automatically

#### Phase 5.2: Continuous Evolution (Ongoing)

- Monitor system performance
- Analyze patterns
- Form hypotheses
- Design experiments
- Implement changes
- Track impact
- Learn and iterate

**Success Criteria:**

- [ ] System successfully implements self-improvement task
- [ ] Self-building maintains >90% quality
- [ ] Human intervention only for architectural decisions
- [ ] System gets better over time

---

## 🧠 Priority 2: Core Application Enhancements

**Objective:** Optimize job finder worker for cost and intelligence  
**Timeline:** 12-16 weeks  
**Primary Document:** `JOB_FINDER_WORKER_CONSOLIDATED_IMPROVEMENT_PLAN_V2.md`

### Phase 1: Smart Caching System (Weeks 1-4) 🔥 HIGH PRIORITY

**Goal:** 90%+ cost reduction through intelligent AI caching

#### Week 1-2: Parser Cache Infrastructure

- [ ] Design parser cache schema (Firestore/Redis)
- [ ] Implement ParserCacheService
- [ ] Create cache key generation (URL pattern-based)
- [ ] Add cache hit/miss tracking
- [ ] Build cache management API
- [ ] Add cache invalidation logic

**Deliverables:**

- Parser cache operational
- Cache hit rate >80% after warmup
- API for cache management
- Metrics tracked

#### Week 2-3: Quality Monitoring System

- [ ] Implement DataQualityMonitor service
- [ ] Add success rate tracking
- [ ] Add completeness scoring
- [ ] Add validation rule checks
- [ ] Trigger re-analysis on degradation
- [ ] Alert system for quality drops

**Deliverables:**

- Quality monitored per source
- Auto-healing on degradation
- Quality trends visualized
- Alerting operational

#### Week 3-4: First Discovery AI Integration

- [ ] Integrate Gemini/Claude for HTML analysis
- [ ] Generate Python parser code
- [ ] Store selectors and rules
- [ ] Cache generated parsers
- [ ] Track AI cost per discovery
- [ ] Monitor parser effectiveness

**Deliverables:**

- AI analyzes new sources
- Generates cached parsers
- 90%+ cost reduction achieved
- First discovery tracked

**Success Metrics:**

- [ ] 90%+ cost reduction after initial discovery
- [ ] Cache hit rate >80%
- [ ] Quality auto-healing working
- [ ] Faster scraping (no AI latency)

---

### Phase 2: Auto-Discovery System (Weeks 5-8)

**Goal:** Automatically detect and add new job sources

#### Week 5-6: Company Auto-Detection

- [ ] Implement CompanyDetector service
- [ ] Add new company identification logic
- [ ] Auto-spawn company analysis tasks
- [ ] Extract company info from job postings
- [ ] Store company profiles
- [ ] Track discovery success rate

**Deliverables:**

- New companies auto-detected
- Company profiles auto-created
- Discovery tasks queued
- Success rate tracked

#### Week 6-7: Source Pattern Detection

- [ ] Implement SourcePatternDetector service
- [ ] Identify new URL patterns
- [ ] Auto-spawn source discovery tasks
- [ ] Test parser generation
- [ ] Add to monitoring rotation
- [ ] Track pattern effectiveness

**Deliverables:**

- New sources auto-discovered
- Parsers auto-generated
- Sources added to rotation
- Pattern library built

#### Week 7-8: RSS/API Discovery

- [ ] Implement FeedDiscovery service
- [ ] Auto-detect RSS feeds
- [ ] Auto-detect job APIs
- [ ] Test feed parsing
- [ ] Add to scraping rotation
- [ ] Prioritize by job volume

**Deliverables:**

- RSS feeds auto-discovered
- APIs auto-detected
- Feeds parsed and monitored
- Prioritization working

**Success Metrics:**

- [ ] New sources added automatically
- [ ] Discovery success rate >70%
- [ ] No manual source additions needed
- [ ] Source diversity increases

---

### Phase 3: Self-Healing System (Weeks 9-12)

**Goal:** Automatically fix issues when data quality degrades

#### Week 9-10: Healing Orchestration

- [ ] Implement HealingOrchestrator service
- [ ] Add degradation detection
- [ ] Create healing task queue
- [ ] Prioritize healing by impact
- [ ] Track healing success rate
- [ ] Alert on repeated failures

**Deliverables:**

- Healing orchestrated automatically
- Degradation triggers healing
- Success rate tracked
- Repeated failures escalated

#### Week 10-11: Re-Analysis Pipeline

- [ ] Implement ReAnalyzer service
- [ ] Trigger AI re-analysis on failure
- [ ] Update cached parsers
- [ ] Validate new parsers
- [ ] Roll back on continued failure
- [ ] Track re-analysis cost

**Deliverables:**

- Failed sources re-analyzed
- Parsers updated automatically
- Validation before deployment
- Cost tracked

#### Week 11-12: Multi-Provider Fallback

- [ ] Implement ProviderFallback service
- [ ] Try alternative AI providers
- [ ] Compare parser quality
- [ ] Select best performer
- [ ] Track provider success rates
- [ ] Optimize provider selection

**Deliverables:**

- Multiple providers tried
- Best parser selected
- Provider performance tracked
- Optimal routing learned

**Success Metrics:**

- [ ] 95%+ source uptime
- [ ] Healing success rate >85%
- [ ] Automatic recovery working
- [ ] Minimal manual intervention

---

### Phase 4: Experimentation & Optimization (Weeks 13-16)

**Goal:** Continuous improvement through A/B testing

#### Week 13-14: A/B Testing Framework

- [ ] Implement WorkerExperiment service
- [ ] Define experiment types (parser, provider, rules)
- [ ] Random variant assignment
- [ ] Track results by variant
- [ ] Calculate statistical significance
- [ ] Auto-promote winners

**Deliverables:**

- A/B testing framework operational
- Experiments running automatically
- Results statistically valid
- Winners promoted

#### Week 14-15: Cost Optimization Experiments

- [ ] Test different AI providers
- [ ] Test prompt variations
- [ ] Test caching strategies
- [ ] Measure cost vs quality
- [ ] Optimize for cost/quality ratio
- [ ] Document best practices

**Deliverables:**

- Cost optimizations identified
- Best practices documented
- Optimal configurations found
- Cost reduced further

#### Week 15-16: Quality Optimization Experiments

- [ ] Test validation rule variations
- [ ] Test data enrichment strategies
- [ ] Test strike filter variations
- [ ] Measure quality improvements
- [ ] Balance quality vs performance
- [ ] Document optimal configs

**Deliverables:**

- Quality optimizations identified
- Optimal validation rules
- Strike filters tuned
- Quality metrics improved

**Success Metrics:**

- [ ] 3+ experiments completed
- [ ] Cost reduced by additional 10-20%
- [ ] Quality improved measurably
- [ ] System continuously optimizing

---

## 🧪 Priority 3: Quality & Testing

**Objective:** Achieve 60-75% test coverage across all repositories  
**Timeline:** 12 weeks  
**Primary Document:** `test-coverage-improvement-plan.md`  
**Status:** Backend mostly complete, Frontend/Worker/App-Monitor in progress

### Phase 0: Architecture Foundation (Weeks 1-2) 🔥 CRITICAL

**Goal:** Foundation tests required before Evolution Plan Phase 1

**Reference:** `TEST-ARCHITECTURE-ALIGNMENT-ANALYSIS.md`

#### Week 1: App-Monitor Critical Services

- [ ] SQLite database tests (1 day)
- [ ] TokenTracking service tests (2 days)
- [ ] BatchApproval service tests (2 days)
- [ ] QualityGates service tests (2 days)

**Deliverables:**

- All Phase 1 services tested before implementation
- Database operations validated
- Token tracking verified
- Batch approval proven

#### Week 2: Worker Intelligence Tests

- [ ] Parser caching tests (2-3 days)
- [ ] Cache hit/miss validation
- [ ] Quality monitoring tests (2 days)
- [ ] Health monitoring tests (2 days)

**Deliverables:**

- Parser cache validated
- Quality monitoring proven
- Health checks working
- Cache invalidation tested

**Phase 0 Success Criteria:**

- [ ] 9-10 days of foundation tests complete
- [ ] 160% risk reduction achieved
- [ ] Enables all Phase 1 features
- [ ] Critical path unblocked

---

### Phase 1: Critical Tests (Weeks 3-6)

**Goal:** 70% risk reduction in critical paths

#### Week 3-4: Backend Critical (job-finder-BE)

**Current:** ~60-70% coverage (mostly complete ✅)

Remaining work:

- [ ] Provider abstraction layer tests
- [ ] PDF service comprehensive tests
- [ ] Document generation edge cases
- [ ] Resume/cover letter validation
- [ ] Error handling scenarios

**Deliverables:**

- Provider abstraction tested
- PDF generation validated
- Edge cases covered
- 70% coverage maintained

#### Week 4-5: Frontend Critical (job-finder-FE)

**Current:** ~28% coverage (needs work ⚠️)

Priority tests:

- [ ] DocumentBuilderPage tests (3 days)
- [ ] ContentItemsPage tests (3 days)
- [ ] Form validation tests (2 days)
- [ ] State management tests (2 days)
- [ ] API integration tests (2 days)

**Deliverables:**

- Core pages tested
- Form validation working
- State management validated
- API calls tested
- 60% coverage target

#### Week 5-6: Worker Critical (job-finder-worker)

**Current:** ~56% coverage (good start ✅)

Priority tests:

- [ ] Orchestrator tests (2-3 days)
- [ ] Strike filter tests (2 days)
- [ ] Queue management tests (2 days)
- [ ] RSS parser tests (2 days)
- [ ] Error handling tests (2 days)

**Deliverables:**

- Orchestration validated
- Filters tested comprehensively
- Queue operations proven
- Parsers validated
- 75% coverage target

**Phase 1 Success Criteria:**

- [ ] Backend: 70% coverage maintained
- [ ] Frontend: 60% coverage achieved
- [ ] Worker: 75% coverage achieved
- [ ] 70% risk reduction in critical paths

---

### Phase 2: High-Impact Tests (Weeks 7-9)

**Goal:** Additional 60% risk reduction

#### Week 7: Backend High-Impact

- [ ] Middleware comprehensive tests
- [ ] Validation helpers full coverage
- [ ] Response helpers edge cases
- [ ] Configuration tests
- [ ] Utility functions coverage

**Deliverables:**

- Middleware fully tested
- Helpers comprehensively covered
- Config validated
- 75% backend coverage

#### Week 8: Frontend High-Impact

- [ ] Job config page tests
- [ ] Applications page tests
- [ ] Auth flow tests
- [ ] Navigation tests
- [ ] Component library tests

**Deliverables:**

- Core flows tested
- Auth validated
- Navigation proven
- 65% frontend coverage

#### Week 9: Worker High-Impact

- [ ] Company detection tests
- [ ] Flask API endpoint tests
- [ ] Database operations tests
- [ ] Firestore integration tests
- [ ] External API mocking tests

**Deliverables:**

- Detection logic tested
- APIs validated
- DB operations proven
- 80% worker coverage

**Phase 2 Success Criteria:**

- [ ] Backend: 75% coverage
- [ ] Frontend: 65% coverage
- [ ] Worker: 80% coverage
- [ ] 60% additional risk reduction

---

### Phase 3: Infrastructure Tests (Weeks 10-12)

**Goal:** Additional 40% coverage improvement

#### Week 10: App-Monitor Backend

**Current:** ~70-80% (mostly complete ✅)

Remaining:

- [ ] DevBots manager edge cases
- [ ] Process manager complex scenarios
- [ ] Route integration tests
- [ ] WebSocket connection tests
- [ ] Error recovery tests

**Deliverables:**

- Edge cases covered
- Complex scenarios tested
- Integration validated
- 80% coverage target

#### Week 11: App-Monitor Frontend

**Current:** ~60-70% (good progress ✅)

Remaining:

- [ ] Task management UI tests
- [ ] WebSocket UI tests
- [ ] Log viewer tests
- [ ] Settings page tests
- [ ] Dashboard tests

**Deliverables:**

- UI components tested
- WebSocket interactions validated
- Log viewer proven
- 75% coverage target

#### Week 12: Integration & E2E

- [ ] End-to-end workflow tests
- [ ] Cross-service integration tests
- [ ] Performance tests
- [ ] Load tests
- [ ] Smoke tests

**Deliverables:**

- E2E flows tested
- Integration proven
- Performance validated
- Production-ready suite

**Phase 3 Success Criteria:**

- [ ] App-Monitor BE: 80% coverage
- [ ] App-Monitor FE: 75% coverage
- [ ] E2E tests operational
- [ ] Production-ready quality

---

## 📋 Repository-Specific Task Lists

### Repository 1: app-monitor (HIGHEST PRIORITY)

**Current Status:** Active development, backend ~70-80%, frontend ~60-70%  
**Timeline:** 15+ weeks (Evolution Plan execution)  
**Primary Documents:**

- `EVOLUTION_PLAN_V2_REFINED.md`
- `PHASE_1.0_TASKS.md`
- `CODEX_IMPROVEMENT_PLAN.md`
- `copilot-integration-suggestions.md`

#### Immediate Tasks (Week 1) ✅ COMPLETED

1. [x] Rename Claude Workers → Dev-Bots across codebase ✅
2. [x] Audit and cleanup dev-bots folder ✅
3. [x] Introduce WorkspaceOrchestrator for per-task workspaces ✅
4. [x] Add PushCoordinator + workspace sealing pipeline ✅
5. [x] Setup SQLite database ✅
6. [x] Remove legacy worktrees/volume docs ✅

#### Phase 1.1-1.5 Tasks (Weeks 1-3)

7. [ ] Implement TokenTrackingService
8. [ ] Create QualityGateValidator
9. [ ] Build TaskScoringService
10. [ ] Implement BatchApprovalManager
11. [ ] Create FailurePatternDetector
12. [ ] Build manual healing system

#### Phase 2 Tasks (Weeks 4-7)

13. [ ] Research all AI model capabilities
14. [ ] Build provider abstraction layer
15. [ ] Implement AnthropicProvider
16. [ ] Implement OpenAIProvider
17. [ ] Implement CursorProvider
18. [ ] Implement GitHubCopilotProvider
19. [ ] Create ComplexityCalculator
20. [ ] Build model selection logic

#### Phase 3 Tasks (Weeks 8-11)

21. [ ] Create ExperimentManager
22. [ ] Build A/B testing framework
23. [ ] Implement StatisticalAnalyzer
24. [ ] Integrate AdaptiveLearning
25. [ ] Create Data Analyst agent

#### Phase 4 Tasks (Weeks 12-14)

26. [ ] Build self-tuning task type
27. [ ] Implement PromptVersionManager
28. [ ] Create FailureTriage service
29. [ ] Build ConfigManager
30. [ ] Add auto-triage responses

#### Phase 5 Tasks (Week 15+)

31. [ ] Create meta-development queue
32. [ ] Enable self-improvement tasks
33. [ ] Monitor continuous evolution

**Success Metrics:**

- Phase 1 complete: >90% task success rate
- Phase 2 complete: 20%+ token reduction
- Phase 3 complete: 3+ significant experiments
- Phase 4 complete: 80%+ auto-triage success
- Phase 5 complete: System builds itself

---

### Repository 2: job-finder-worker (HIGH PRIORITY)

**Current Status:** Stable, ~56% test coverage  
**Timeline:** 12-16 weeks  
**Primary Document:** `JOB_FINDER_WORKER_CONSOLIDATED_IMPROVEMENT_PLAN_V2.md`

#### Phase 1: Smart Caching (Weeks 1-4)

1. [ ] Design parser cache schema
2. [ ] Implement ParserCacheService
3. [ ] Build cache key generation
4. [ ] Add cache hit/miss tracking
5. [ ] Create DataQualityMonitor
6. [ ] Implement success rate tracking
7. [ ] Add completeness scoring
8. [ ] Build quality alerting
9. [ ] Integrate Gemini/Claude for HTML analysis
10. [ ] Generate and cache Python parsers
11. [ ] Track AI costs
12. [ ] Monitor parser effectiveness

#### Phase 2: Auto-Discovery (Weeks 5-8)

13. [ ] Implement CompanyDetector
14. [ ] Build new company identification
15. [ ] Auto-spawn company analysis tasks
16. [ ] Extract company info from jobs
17. [ ] Implement SourcePatternDetector
18. [ ] Identify new URL patterns
19. [ ] Auto-spawn source discovery
20. [ ] Implement FeedDiscovery
21. [ ] Auto-detect RSS feeds
22. [ ] Auto-detect job APIs
23. [ ] Add to scraping rotation

#### Phase 3: Self-Healing (Weeks 9-12)

24. [ ] Implement HealingOrchestrator
25. [ ] Build degradation detection
26. [ ] Create healing task queue
27. [ ] Prioritize healing by impact
28. [ ] Implement ReAnalyzer
29. [ ] Trigger AI re-analysis
30. [ ] Update cached parsers
31. [ ] Validate new parsers
32. [ ] Implement ProviderFallback
33. [ ] Try alternative providers
34. [ ] Track provider success

#### Phase 4: Experimentation (Weeks 13-16)

35. [ ] Implement WorkerExperiment service
36. [ ] Define experiment types
37. [ ] Random variant assignment
38. [ ] Calculate statistical significance
39. [ ] Test different AI providers
40. [ ] Test prompt variations
41. [ ] Test caching strategies
42. [ ] Optimize cost/quality ratio
43. [ ] Test validation rules
44. [ ] Test enrichment strategies
45. [ ] Balance quality vs performance

#### Testing Tasks (Parallel)

46. [ ] Parser caching tests (2-3 days)
47. [ ] Quality monitoring tests (2 days)
48. [ ] Orchestrator tests (2-3 days)
49. [ ] Strike filter tests (2 days)
50. [ ] Queue management tests (2 days)
51. [ ] RSS parser tests (2 days)
52. [ ] Company detection tests
53. [ ] Database operations tests
54. [ ] API integration tests

**Success Metrics:**

- 90%+ cost reduction achieved
- 80%+ cache hit rate
- 70%+ auto-discovery success
- 85%+ self-healing success
- 75-85% test coverage

---

### Repository 3: job-finder-BE (MEDIUM PRIORITY)

**Current Status:** Stable, ~60-70% test coverage ✅  
**Timeline:** 4-6 weeks (maintenance + enhancements)  
**Primary Document:** `test-coverage-improvement-plan.md`

#### Testing Tasks (Weeks 1-2)

1. [ ] Provider abstraction layer tests
2. [ ] PDF service comprehensive tests
3. [ ] Document generation edge cases
4. [ ] Resume/cover letter validation
5. [ ] Error handling scenarios
6. [ ] Middleware edge cases
7. [ ] Validation helpers full coverage
8. [ ] Response helpers edge cases
9. [ ] Configuration tests
10. [ ] Utility functions coverage

#### Enhancement Tasks (Weeks 3-4)

11. [ ] Integrate with multi-provider system
12. [ ] Add provider health checks
13. [ ] Implement provider failover
14. [ ] Enhanced error handling
15. [ ] Performance optimizations

#### Integration Tasks (Weeks 5-6)

16. [ ] Integration with app-monitor
17. [ ] WebSocket event emission
18. [ ] Task queue integration
19. [ ] Quality gate integration
20. [ ] Metrics reporting

**Success Metrics:**

- Maintain 70% test coverage
- Zero production errors
- <200ms API response times
- Integration with autonomous system

---

### Repository 4: job-finder-FE (MEDIUM PRIORITY)

**Current Status:** Stable, ~28% test coverage ⚠️  
**Timeline:** 6-8 weeks  
**Primary Document:** `test-coverage-improvement-plan.md`

#### Critical Testing (Weeks 1-2)

1. [ ] DocumentBuilderPage tests (3 days)
2. [ ] ContentItemsPage tests (3 days)
3. [ ] Form validation tests (2 days)
4. [ ] State management tests (2 days)
5. [ ] API integration tests (2 days)

#### High-Impact Testing (Weeks 3-4)

6. [ ] Job config page tests
7. [ ] Applications page tests
8. [ ] Auth flow tests
9. [ ] Navigation tests
10. [ ] Component library tests

#### UI Enhancement (Weeks 5-6)

11. [ ] App-monitor integration UI
12. [ ] Task queue visualization
13. [ ] Quality metrics dashboard
14. [ ] Token usage display
15. [ ] Batch approval controls

#### E2E Testing (Weeks 7-8)

16. [ ] End-to-end user flows
17. [ ] Cross-page navigation
18. [ ] Form submission flows
19. [ ] Error handling flows
20. [ ] Performance testing

**Success Metrics:**

- 60-65% test coverage
- All critical paths tested
- Zero UI errors
- <2s page load times

---

### Repository 5: job-finder-shared-types (LOW PRIORITY)

**Current Status:** Stable, type definitions only  
**Timeline:** 1-2 weeks (maintenance only)

#### Maintenance Tasks

1. [ ] Add types for new app-monitor features
2. [ ] Add types for multi-provider system
3. [ ] Add types for worker intelligence features
4. [ ] Document type usage
5. [ ] Version management

**Success Metrics:**

- All new features typed
- Zero type errors
- Documentation complete

---

## 📅 Consolidated Timeline

### Months 1-2: Foundation

- **Week 1-2:** App-Monitor Phase 1.0-1.2 (Dev-Bots rename, token tracking, quality gates)
- **Week 3-4:** App-Monitor Phase 1.3-1.5 (Quality scoring, batch approval, healing)
- **Week 5-6:** Worker Phase 1 Start (Smart caching infrastructure)
- **Week 7-8:** Testing Phase 0 (Architecture foundation tests)

### Months 3-4: Multi-Model & Intelligence

- **Week 9-10:** App-Monitor Phase 2.1-2.2 (Model research, provider abstraction)
- **Week 11-12:** App-Monitor Phase 2.3-2.4 (Complexity routing, Copilot integration)
- **Week 13-14:** Worker Phase 1 Complete (Quality monitoring, first discovery)
- **Week 15-16:** Worker Phase 2 Start (Auto-discovery system)

### Months 5-6: Learning & Optimization

- **Week 17-18:** App-Monitor Phase 3.1-3.2 (A/B testing, statistical analysis)
- **Week 19-20:** App-Monitor Phase 3.3-3.4 (Adaptive learning, analysis agent)
- **Week 21-22:** Worker Phase 2 Complete, Phase 3 Start (Self-healing)
- **Week 23-24:** Testing Phase 1-2 (Critical and high-impact tests)

### Month 7+: Self-Improvement & Continuous Evolution

- **Week 25-26:** App-Monitor Phase 4 (Self-improvement, auto-triage)
- **Week 27-28:** App-Monitor Phase 5 Start (Self-building system)
- **Week 29-30:** Worker Phase 3-4 (Self-healing complete, experimentation)
- **Week 31+:** Continuous evolution and optimization

---

## 🎯 Success Criteria & KPIs

### Autonomous System (App-Monitor)

- [ ] 90%+ task success rate
- [ ] 20%+ token cost reduction
- [ ] 85%+ model selection accuracy
- [ ] 80%+ auto-triage success
- [ ] System builds itself successfully

### Worker Intelligence

- [ ] 90%+ cost reduction via caching
- [ ] 80%+ cache hit rate
- [ ] 70%+ auto-discovery success
- [ ] 95%+ source uptime
- [ ] 85%+ self-healing success

### Quality & Testing

- [ ] Backend: 70-75% coverage (maintained)
- [ ] Frontend: 60-65% coverage (achieved)
- [ ] Worker: 75-85% coverage (achieved)
- [ ] App-Monitor: 75-80% coverage (both)
- [ ] Zero critical bugs in production

### Overall Application

- [ ] <200ms API response times
- [ ] <2s page load times
- [ ] 99.9% uptime
- [ ] 50% reduction in manual interventions
- [ ] Continuous improvement demonstrated

---

## 📚 Document Organization

### Archive (Completed/Superseded)

The following documents should be archived:

1. **Test Coverage Duplicates:**
   - `test-coverage-plan.md` → Superseded by `test-coverage-improvement-plan.md`
   - `TEST_COVERAGE_PLAN.md` → Superseded by `test-coverage-improvement-plan.md`
   - `test-coverage-analysis.md` → Completed, info in SUMMARY

2. **Partial/Draft Plans:**
   - `EVOLUTION_PLAN.md` → Superseded by `EVOLUTION_PLAN_V2_REFINED.md`
   - `JOB_FINDER_WORKER_CONSOLIDATED_IMPROVEMENT_PLAN.md` → Superseded by V2

3. **Status Reports (Completed Work):**
   - `TEST-WORK-SUMMARY.md` → Historical record, work complete
   - `APP-MONITOR-QUICKSTART.md` → Superseded by active plans

### Active Documents (Keep)

1. `MASTER_PLAN.md` (this document) - **PRIMARY REFERENCE**
2. `EVOLUTION_PLAN_V2_REFINED.md` - Detailed autonomous system plan
3. `PHASE_1.0_TASKS.md` - Granular task definitions
4. `CODEX_IMPROVEMENT_PLAN.md` - Codex integration strategy
5. `copilot-integration-suggestions.md` - Copilot integration strategy
6. `JOB_FINDER_WORKER_CONSOLIDATED_IMPROVEMENT_PLAN_V2.md` - Worker intelligence
7. `test-coverage-improvement-plan.md` - Testing strategy
8. `TEST-IMPLEMENTATION-PROGRESS.md` - Live progress tracking
9. `TEST-COVERAGE-SUMMARY.md` - Coverage overview
10. `test-coverage-quick-reference.md` - Developer quick guide
11. `test-scenarios-by-repository.md` - Detailed test scenarios
12. `ALIGNMENT-SUMMARY.md` - Architecture alignment
13. `TEST-ARCHITECTURE-ALIGNMENT-ANALYSIS.md` - Detailed alignment
14. `README.md` - Directory index

---

## 🚀 Getting Started

### For Project Managers

1. **Read:** This master plan (executive summary + timelines)
2. **Review:** Repository-specific task lists
3. **Plan:** Sprint/iteration planning from consolidated timeline
4. **Track:** Use TEST-IMPLEMENTATION-PROGRESS.md for live updates

### For Developers

1. **Start:** Review repository-specific task list (your repo)
2. **Reference:** Detailed plan documents as needed
3. **Execute:** Follow phase-by-phase approach
4. **Update:** Mark tasks complete in progress docs

### For Stakeholders

1. **Review:** Executive summary (top of document)
2. **Understand:** Three-track parallel execution strategy
3. **Monitor:** Success criteria & KPIs
4. **Decide:** Resource allocation and priorities

### Current Status & Next Actions

**Phase 1.0:** ✅ COMPLETED (2025-10-27)

**Next Phase: 1.1 - Token Tracking Integration**

1. ⏭️ Research Claude API & Codex CLI usage limits
2. ⏭️ Implement TokenTrackingService
3. ⏭️ Add token tracking API endpoints
4. ⏭️ Integrate hard stop on budget exceeded
5. ⏭️ Dashboard token monitoring widgets

---

**Document Status:** ✅ ACTIVE - PRIMARY REFERENCE
**Last Updated:** 2025-10-27 (Phase 1.0 completed)
**Current Phase:** Phase 1.1 - Token Tracking Integration
**Next Review:** Weekly during execution
**Owner:** Development Team

---

_This master plan consolidates 21 planning documents into a single, actionable roadmap. All sub-plans remain valid for detailed reference, but this document provides the unified strategy and prioritization._
