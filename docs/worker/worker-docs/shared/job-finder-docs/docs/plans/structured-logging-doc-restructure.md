# Structured Logging Documentation Restructure

**Date:** 2025-10-28  
**Owner:** _TBD (proposed hand-off to platform team)_  

## Objective
Centralize the cross-repository structured logging guidance without duplicating service-specific runbooks. The current `STRUCTURED_LOGGING_MIGRATION.md` mixes shared context with detailed instructions for `job-finder-shared-types`, `job-finder-BE`, `job-finder-FE`, and `job-finder-worker`. We need a sustainable layout that keeps high-level architecture in one place while pushing implementation specifics into the owning repositories.

## Proposed End State
1. **Shared Architecture Doc** (new repo: `job-finder-architecture` or equivalent)  
   - Summarizes logging goals, schema ownership, environments, and cross-service dependencies.  
   - Links to service-level runbooks.  
2. **Service-Level Docs** (existing repos)  
   - Each repository maintains its own “structured logging” doc/runbook with implementation details.  
   - The App Monitor repo covers log aggregation, file watching, and Cloud Logging forwarding.  
3. **job-finder-docs**  
   - Retains only the plan + high-level navigation pointer to the shared architecture doc.

## Work Breakdown
1. **Inventory & Gap Analysis**
   - [ ] Confirm existing logging docs in each repo (`app-monitor/docs/dev-monitor`, `job-finder-BE/docs`, `job-finder-FE/docs`, `job-finder-worker/docs`).  
   - [ ] Identify missing or outdated service-level instructions (e.g., FE Cloud Logging runbook).
2. **Author Shared Architecture Doc**
   - [ ] Draft `logging/structured-logging-overview.md` in the shared architecture repository.  
   - [ ] Extract cross-repo context (schema ownership, shared-types versioning, Cloud Logging targets) from `STRUCTURED_LOGGING_MIGRATION.md`.  
   - [ ] Reference service docs instead of duplicating instructions.
3. **Publish Service-Level Updates**
   - [ ] Split current migration doc into four sections and migrate each section into the owning repo if a runbook is missing.  
   - [ ] Update each repo’s README/nav to link to the new runbook.  
   - [ ] Ensure examples reflect current code paths (e.g., `cloud-logger.ts`, FE logger helper, worker JSON formatter).
4. **Retire Legacy Migration Doc**
   - [ ] Replace `STRUCTURED_LOGGING_MIGRATION.md` with a short stub pointing to the shared architecture doc and service runbooks.  
   - [ ] Log the change in the documentation tracker.

## Open Questions
1. Who will steward the new shared architecture repository?  
2. Do we want automated link checking across all logging docs?  
3. Should App Monitor host canonical log-schema validation tooling, or does it remain in shared-types?

## Target Timeline
- Inventory & gap analysis: **by 2025-11-01**  
- Shared architecture doc draft: **by 2025-11-04**  
- Service-level migrations: **by 2025-11-08**  
- Legacy doc stub + tracker updates: **by 2025-11-08**

_Update this plan as owners are assigned and tasks progress._
