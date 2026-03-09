-- Reframe resume highlights: strip fabricated numbers, focus on business outcomes
-- Keep only numbers that were in the originals (2x, 400+, 100%) or are clearly verifiable
-- Run: sqlite3 /srv/job-finder/data/jobfinder.db < scripts/update-resume-content.sql

BEGIN TRANSACTION;

-- ==============================================================================
-- FULFIL — PWA (fe-h1, fs-h4, se-h1)
-- Was: "20+ retail partners" (fabricated count)
-- Now: focus on what the product did for the business
-- ==============================================================================

UPDATE resume_items SET
  description = 'Shipped white-label grocery ordering PWA adopted across the retail partner base, owning full product lifecycle from requirements gathering to production deployment with Stripe payments and Contentful CMS',
  updated_at = datetime('now')
WHERE id = 'ri-fe-fulfil-h1';

UPDATE resume_items SET
  description = 'Shipped white-label grocery ordering PWA adopted across the retail partner base, owning full product lifecycle with Angular/Ionic frontend, Contentful CMS, and Firebase hosting',
  updated_at = datetime('now')
WHERE id = 'ri-fs-fulfil-h4';

UPDATE resume_items SET
  description = 'Shipped white-label grocery ordering PWA adopted across the retail partner base, owning end-to-end delivery from stakeholder requirements gathering through deployment and post-launch support',
  updated_at = datetime('now')
WHERE id = 'ri-se-fulfil-h1';

-- ==============================================================================
-- FULFIL — Amazon Fresh (fs-h1, be-h1, ai-h2)
-- Was: "5,000+ orders/day" (fabricated)
-- Now: keep "first tier-1 enterprise partner" (was in original), drop fake volume
-- ==============================================================================

UPDATE resume_items SET
  description = 'Launched Amazon Fresh/Whole Foods integration — first tier-1 enterprise partner — proving platform viability for high-volume grocery retailers with event-driven Pub/Sub architecture and sub-second inventory sync',
  updated_at = datetime('now')
WHERE id = 'ri-fs-fulfil-h1';

UPDATE resume_items SET
  description = 'Launched Amazon Fresh/Whole Foods integration — first tier-1 enterprise partner — architecting event-driven Pub/Sub pipeline with sub-second inventory sync across distributed factory systems',
  updated_at = datetime('now')
WHERE id = 'ri-be-fulfil-h1';

UPDATE resume_items SET
  description = 'Built event-driven Pub/Sub data pipeline for Amazon Fresh with sub-second latency — first tier-1 enterprise partner — proving platform viability at scale across distributed factory locations',
  updated_at = datetime('now')
WHERE id = 'ri-ai-fulfil-h2';

-- ==============================================================================
-- FULFIL — Order batching / 2x throughput (fs-h2, be-h2, ai-h1)
-- "2x" was in the original — keep it. Strip fake "~50 to 100+" numbers.
-- ==============================================================================

UPDATE resume_items SET
  description = 'Doubled robotic fulfillment throughput by designing intelligent order batching algorithm, enabling retail partners to fulfill more customer orders per shift with existing infrastructure',
  updated_at = datetime('now')
WHERE id = 'ri-fs-fulfil-h2';

UPDATE resume_items SET
  description = 'Doubled robotic fulfillment throughput by designing intelligent order batching algorithm, enabling retail partners to fulfill more customer orders per shift with existing infrastructure',
  updated_at = datetime('now')
WHERE id = 'ri-be-fulfil-h2';

UPDATE resume_items SET
  description = 'Doubled robotic fulfillment throughput by designing heuristic optimization algorithm for order batching, enabling retail partners to fulfill more customer orders per shift with existing infrastructure',
  updated_at = datetime('now')
WHERE id = 'ri-ai-fulfil-h1';

-- ==============================================================================
-- FULFIL — Observability / MTTR (fe-h3, be-h5, ai-h3, se-h4)
-- Was: "40%", "$2K/month", "15+ min to <60s" (all fabricated)
-- Now: describe the improvement and why it mattered
-- ==============================================================================

UPDATE resume_items SET
  description = 'Led observability migration to Grafana/Loki and built custom frontend performance dashboards, reducing incident resolution time across the engineering team',
  updated_at = datetime('now')
WHERE id = 'ri-fe-fulfil-h3';

UPDATE resume_items SET
  description = 'Reduced incident resolution time and cut infrastructure costs by migrating from Elastic to Grafana/Loki/Prometheus with PagerDuty alerting across all services',
  updated_at = datetime('now')
WHERE id = 'ri-be-fulfil-h5';

UPDATE resume_items SET
  description = 'Established Grafana/Loki/Prometheus observability infrastructure across Kubernetes deployments, significantly reducing mean time to detection and enabling proactive issue resolution',
  updated_at = datetime('now')
WHERE id = 'ri-ai-fulfil-h3';

UPDATE resume_items SET
  description = 'Reduced incident resolution time by acting as first line of defense for production issues, building Grafana/Loki dashboards and Sentry alerting used across the engineering team',
  updated_at = datetime('now')
WHERE id = 'ri-se-fulfil-h4';

-- ==============================================================================
-- FULFIL — MongoSync (be-h4)
-- Was: "8+ hours/week" (fabricated)
-- Now: describe the automation and its effect
-- ==============================================================================

UPDATE resume_items SET
  description = 'Eliminated recurring manual data reconciliation by implementing real-time MongoSync replication between on-prem MongoDB clusters and cloud MySQL on Kubernetes',
  updated_at = datetime('now')
WHERE id = 'ri-be-fulfil-h4';

-- ==============================================================================
-- MEOW WOLF — Component library (fe-h1, fs-h1)
-- Was: "3 product teams", "30%" (fabricated precision)
-- Now: keep scope, drop fake reduction %
-- ==============================================================================

UPDATE resume_items SET
  description = 'Accelerated feature delivery across product teams by building and maintaining shared React component library with Styled Components and MaterialUI, establishing a consistent UI language and reducing duplicated work',
  updated_at = datetime('now')
WHERE id = 'ri-fe-meow-h1';

UPDATE resume_items SET
  description = 'Accelerated cross-team feature delivery by building shared React component library and Docker-based deployment pipeline, enabling real-time installation monitoring across immersive art venues',
  updated_at = datetime('now')
WHERE id = 'ri-fs-meow-h1';

-- ==============================================================================
-- MEOW WOLF — Visitor tracking (fe-h2)
-- Was: "3 installations", "1,000+ concurrent sessions" (fabricated)
-- Now: describe what it enabled
-- ==============================================================================

UPDATE resume_items SET
  description = 'Enabled real-time visitor tracking across immersive installations by integrating Pub/Sub event architecture, supporting high-concurrency user sessions at scale',
  updated_at = datetime('now')
WHERE id = 'ri-fe-meow-h2';

-- ==============================================================================
-- OPNA — McDonald's (fe-h2, ai-h1)
-- Was: "1,000+ item combinations" (fabricated)
-- Now: describe the work and what it enabled
-- ==============================================================================

UPDATE resume_items SET
  description = 'Built McDonald''s conversational ordering interface in React with full menu support including substitutions, modifications, and coupon redemption via Dialogflow NLP',
  updated_at = datetime('now')
WHERE id = 'ri-fe-opna-h2';

UPDATE resume_items SET
  description = 'Built McDonald''s conversational ordering NLP microservices with Dialogflow on GCP, supporting full menu navigation with complex intent recognition and entity extraction',
  updated_at = datetime('now')
WHERE id = 'ri-ai-opna-h1';

-- ==============================================================================
-- OPNA — JLL (fe-h3, fs-h2, be-h1, ai-h2, se-h3)
-- Was: "500+ commercial properties" (fabricated)
-- Now: keep "JLL", describe the scope as enterprise-scale
-- ==============================================================================

UPDATE resume_items SET
  description = 'Reduced facility request resolution time across JLL''s commercial property portfolio by building GraphQL/Apollo frontend enabling natural language facility request submission',
  updated_at = datetime('now')
WHERE id = 'ri-fe-opna-h3';

UPDATE resume_items SET
  description = 'Reduced facility request resolution time across JLL''s commercial property portfolio by designing microservice architecture with Dialogflow NLP, GraphQL/Apollo APIs, and App Engine on GCP',
  updated_at = datetime('now')
WHERE id = 'ri-fs-opna-h2';

UPDATE resume_items SET
  description = 'Reduced facility request resolution time across JLL''s commercial property portfolio by designing microservice architecture with Dialogflow NLP on GCP App Engine, GraphQL/Apollo APIs, and CI/CD on CircleCI',
  updated_at = datetime('now')
WHERE id = 'ri-be-opna-h1';

UPDATE resume_items SET
  description = 'Reduced facility request resolution time across JLL''s commercial property portfolio by designing Dialogflow chatbot architecture enabling natural language facility requests at enterprise scale',
  updated_at = datetime('now')
WHERE id = 'ri-ai-opna-h2';

UPDATE resume_items SET
  description = 'Built McDonald''s conversational ordering NLP and reduced JLL facility request resolution time across their commercial property portfolio by designing Dialogflow microservices — both requiring deep domain understanding and stakeholder alignment',
  updated_at = datetime('now')
WHERE id = 'ri-se-opna-h3';

-- ==============================================================================
-- OPNA — Game server (fs-h3, be-h2, ai-h3)
-- Was: "200+ concurrent", "5 min to 30 seconds" (fabricated)
-- Now: describe what it achieved
-- ==============================================================================

UPDATE resume_items SET
  description = 'Built Python gRPC game server orchestration with Docker, automating server provisioning and enabling the platform to scale concurrent player sessions on demand',
  updated_at = datetime('now')
WHERE id = 'ri-fs-opna-h3';

UPDATE resume_items SET
  description = 'Built Python gRPC game server orchestration with Docker and Gunicorn, automating server provisioning and enabling the platform to scale concurrent player sessions on demand',
  updated_at = datetime('now')
WHERE id = 'ri-be-opna-h2';

UPDATE resume_items SET
  description = 'Built Python gRPC game server orchestration with Docker for real-time session management, automating server provisioning and enabling on-demand scaling of concurrent players',
  updated_at = datetime('now')
WHERE id = 'ri-ai-opna-h3';

-- ==============================================================================
-- OPNA — HIPAA / Driver's Benefits (be-h3, se-h4)
-- Was: "10,000+ patient records" (fabricated)
-- Now: describe compliance work and outcome
-- ==============================================================================

UPDATE resume_items SET
  description = 'Ensured HIPAA compliance by implementing Salesforce integration using Apex for Driver''s Benefits case management platform, enabling the company to handle sensitive patient records',
  updated_at = datetime('now')
WHERE id = 'ri-be-opna-h3';

UPDATE resume_items SET
  description = 'Ensured HIPAA compliance by managing Salesforce integration for Driver''s Benefits, navigating complex compliance requirements and legacy system constraints to enable handling of sensitive patient records',
  updated_at = datetime('now')
WHERE id = 'ri-se-opna-h4';

-- ==============================================================================
-- CONSULTING — Credentialing (fe-h1, fs-h1, be-h1, se-h1)
-- Was: "5,000+ educators" (fabricated)
-- Now: describe the work and who it served
-- ==============================================================================

UPDATE resume_items SET
  description = 'Enabled digital credentialing for educators across National Education Association and National Geographic by designing and shipping micro-credential builder UI in React on GCP App Engine',
  updated_at = datetime('now')
WHERE id = 'ri-fe-consult-h1';

UPDATE resume_items SET
  description = 'Enabled digital credentialing for educators across National Education Association and National Geographic by building full-stack micro-credential platform with React frontend and PostgreSQL on GCP App Engine',
  updated_at = datetime('now')
WHERE id = 'ri-fs-consult-h1';

UPDATE resume_items SET
  description = 'Enabled digital credentialing for educators across National Education Association and National Geographic by designing micro-credential builder backend on GCP App Engine with PostgreSQL',
  updated_at = datetime('now')
WHERE id = 'ri-be-consult-h1';

UPDATE resume_items SET
  description = 'Enabled digital credentialing for educators across National Education Association and National Geographic by designing and delivering micro-credential builder on GCP App Engine',
  updated_at = datetime('now')
WHERE id = 'ri-se-consult-h1';

-- ==============================================================================
-- BRITELITE — Installations (ai-h1, se-h1)
-- Was: "12+" (fabricated), "5,000+ attendees" (fabricated)
-- Now: describe the work
-- ==============================================================================

UPDATE resume_items SET
  description = 'Delivered interactive installations for Fortune 500 clients by designing real-time multimedia systems using Python and GLSL shaders with sub-frame latency requirements',
  updated_at = datetime('now')
WHERE id = 'ri-ai-britelite-h1';

UPDATE resume_items SET
  description = 'Directed technical delivery of interactive installations for Fortune 500 clients — managed client relationships, hardware procurement, and on-site deployment for large-scale live events',
  updated_at = datetime('now')
WHERE id = 'ri-se-britelite-h1';

-- ==============================================================================
-- BRITELITE — Live events (be-h1, se-h2)
-- Was: "15+" (fabricated)
-- Now: keep "100% uptime" (was in original), drop fake event count
-- ==============================================================================

UPDATE resume_items SET
  description = 'Achieved 100% uptime across live broadcast events by engineering real-time social media integration systems for Facebook, Instagram, and Twitter APIs',
  updated_at = datetime('now')
WHERE id = 'ri-be-britelite-h1';

UPDATE resume_items SET
  description = 'Achieved 100% uptime across live broadcast events by engineering real-time social media integrations for Instagram, Twitter, and Facebook',
  updated_at = datetime('now')
WHERE id = 'ri-se-britelite-h2';

-- ==============================================================================
-- SE — Intuit widgets (se-h2)
-- Was: "5 widgets", "4-week", "100K+ impressions" (fabricated)
-- Now: describe the delivery and outcome
-- ==============================================================================

UPDATE resume_items SET
  description = 'Delivered marketing widgets for Intuit on tight timelines with comprehensive unit test coverage, earning repeat engagements through reliable on-schedule delivery',
  updated_at = datetime('now')
WHERE id = 'ri-se-opna-h2';

COMMIT;
