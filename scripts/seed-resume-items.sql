-- Seed resume_items for all 5 resume versions
-- Run: sqlite3 /srv/job-finder/data/jobfinder.db < scripts/seed-resume-items.sql
--
-- Each resume is content-budgeted to fit on exactly one US Letter page.
-- Key bullets (first per role) may span 2 lines (~130-150 chars).
-- Supporting bullets: 1 line (~90-100 chars).

BEGIN TRANSACTION;

-- Clear existing resume_items (if any)
DELETE FROM resume_items;

-- ==============================================================================
-- rv-frontend — Frontend Engineer
-- Bullet allocation: 3/2/3/1 = 9 total, 2 projects
-- ==============================================================================

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-summary', 'rv-frontend', '0', 'narrative', 'Professional Summary', 'Frontend engineer with 8+ years building React, Angular, and TypeScript apps for clients including Amazon, McDonald''s, and Google. Ships PWAs, component libraries, and performance dashboards at scale.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-fulfil', 'rv-frontend', '1', 'work', 'Fulfil Solutions', 'Senior Software Engineer', 'Mountain View, CA — Remote (Portland, OR)', '2021-12', '2025-03', '["Angular","Ionic","TypeScript","Node.js","Firebase","Contentful","Stripe"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-meow', 'rv-frontend', '2', 'work', 'Meow Wolf', 'Front End Software Developer', 'Denver, CO — Remote', '2021-03', '2021-07', '["React","Styled Components","MaterialUI","Docker","Pub/Sub"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-opna', 'rv-frontend', '3', 'work', 'Opna Development', 'Co-Founder & Lead Engineer', 'San Francisco, CA', '2017-06', '2021-12', '["React","TypeScript","Node.js","GraphQL","Apollo","GCP","Firebase"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-consult', 'rv-frontend', '4', 'work', 'Various Consulting Projects', 'Software Engineer', 'San Francisco, CA', '2015-08', '2017-06', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-projects', 'rv-frontend', '5', 'section', 'Projects', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-skills', 'rv-frontend', '6', 'section', 'Skills', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-edu', 'rv-frontend', '7', 'section', 'Education & Certifications', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Fulfil highlights (3)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-fulfil-h1', 'rv-frontend', 'ri-fe-fulfil', '0', 'highlight', 'Shipped white-label grocery ordering PWA with Stripe payments and Contentful CMS, owning full product lifecycle from requirements through production', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-fulfil-h2', 'rv-frontend', 'ri-fe-fulfil', '1', 'highlight', 'Built marketplace integrations for DoorDash, Uber Eats, and Amazon Fresh into unified ordering UI', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-fulfil-h3', 'rv-frontend', 'ri-fe-fulfil', '2', 'highlight', 'Led observability migration to Grafana/Loki and built frontend performance dashboards for the team', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Meow Wolf highlights (2)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-meow-h1', 'rv-frontend', 'ri-fe-meow', '0', 'highlight', 'Built shared React component library with Styled Components and MaterialUI across product teams', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-meow-h2', 'rv-frontend', 'ri-fe-meow', '1', 'highlight', 'Integrated Pub/Sub architecture for real-time visitor tracking at immersive art installations', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Opna highlights (3)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-opna-h1', 'rv-frontend', 'ri-fe-opna', '0', 'highlight', 'Led consultancy delivering React/TypeScript apps for Intuit, McDonald''s, and Google on GCP', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-opna-h2', 'rv-frontend', 'ri-fe-opna', '1', 'highlight', 'Built McDonald''s digital ordering UI in React with Dialogflow NLP for menu navigation, substitutions, and coupons', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-opna-h3', 'rv-frontend', 'ri-fe-opna', '2', 'highlight', 'Built GraphQL/Apollo frontend for JLL enabling natural language facility request submission on GCP', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Consulting highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-consult-h1', 'rv-frontend', 'ri-fe-consult', '0', 'highlight', 'Shipped micro-credential builder for National Education Association and National Geographic on GCP', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: App Monitor (1 highlight, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, website, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-proj-appmon', 'rv-frontend', 'ri-fe-projects', '0', 'project', 'App Monitor', 'https://app-monitor.joshwentworth.com', 'Full-stack platform for orchestrating AI development agents with real-time event streaming', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-proj-appmon-h1', 'rv-frontend', 'ri-fe-proj-appmon', '0', 'highlight', 'React/Tailwind frontend with SSE for real-time AI agent status and 400+ automated tests', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Portfolio Website (description only, no highlights or tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-proj-portfolio', 'rv-frontend', 'ri-fe-projects', '1', 'project', 'Portfolio Website', 'Statically-generated portfolio with Gatsby, React, and TypeScript featuring MDX content, animated transitions, and CI/CD via GitHub Actions', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Skills (4 categories)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-sk-frontend', 'rv-frontend', 'ri-fe-skills', '0', 'skills', 'Frontend Frameworks', '["React","Angular","Tailwind CSS","MaterialUI","Styled Components","Radix UI"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-sk-lang', 'rv-frontend', 'ri-fe-skills', '1', 'skills', 'Languages & Core', '["TypeScript","JavaScript","Node.js","Express","Python","GraphQL"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-sk-cloud', 'rv-frontend', 'ri-fe-skills', '2', 'skills', 'Cloud & DevOps', '["GCP","Docker","Kubernetes","Firebase","GitHub Actions","CircleCI"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-sk-test', 'rv-frontend', 'ri-fe-skills', '3', 'skills', 'Testing & Quality', '["Playwright","Jest","Vitest","Sentry","Lighthouse"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Education (2 entries)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-edu-gcp', 'rv-frontend', 'ri-fe-edu', '0', 'education', 'Google Cloud', 'Professional Cloud Developer Certificate', '2021', '["Google Cloud Platform"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fe-edu-ucsc', 'rv-frontend', 'ri-fe-edu', '1', 'education', 'University of California — Santa Cruz', 'B.A. in Music', 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- ==============================================================================
-- rv-fullstack — Full Stack Engineer
-- Bullet allocation: 4/1/2/1 = 8 total, 2 projects
-- ==============================================================================

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-summary', 'rv-fullstack', '0', 'narrative', 'Professional Summary', 'Full-stack engineer with 8+ years designing end-to-end systems for clients including Amazon, McDonald''s, and Google. Expert in TypeScript, React, Node.js, and Python with event-driven architecture experience.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-fulfil', 'rv-fullstack', '1', 'work', 'Fulfil Solutions', 'Senior Software Engineer', 'Mountain View, CA — Remote (Portland, OR)', '2021-12', '2025-03', '["Angular","Node.js","TypeScript","MySQL","Redis","Pub/Sub","Kubernetes","Stripe"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-meow', 'rv-fullstack', '2', 'work', 'Meow Wolf', 'Front End Software Developer', 'Denver, CO — Remote', '2021-03', '2021-07', '["React","Docker","Styled Components","MaterialUI","Pub/Sub"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-opna', 'rv-fullstack', '3', 'work', 'Opna Development', 'Co-Founder & Lead Engineer', 'San Francisco, CA', '2017-06', '2021-12', '["React","TypeScript","Node.js","Python","GraphQL","Apollo","GCP","Docker"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-consult', 'rv-fullstack', '4', 'work', 'Various Consulting Projects', 'Software Engineer', 'San Francisco, CA', '2015-08', '2017-06', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-projects', 'rv-fullstack', '5', 'section', 'Projects', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-skills', 'rv-fullstack', '6', 'section', 'Skills', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-edu', 'rv-fullstack', '7', 'section', 'Education & Certifications', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Fulfil highlights (4)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-fulfil-h1', 'rv-fullstack', 'ri-fs-fulfil', '0', 'highlight', 'Launched Amazon Fresh — first tier-1 enterprise partner — with event-driven Pub/Sub pipeline for high-volume order processing', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-fulfil-h2', 'rv-fullstack', 'ri-fs-fulfil', '1', 'highlight', 'Doubled robotic fulfillment throughput by designing intelligent order batching algorithm', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-fulfil-h3', 'rv-fullstack', 'ri-fs-fulfil', '2', 'highlight', 'Shipped white-label grocery PWA with Angular/Ionic frontend, Contentful CMS, and Firebase hosting', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-fulfil-h4', 'rv-fullstack', 'ri-fs-fulfil', '3', 'highlight', 'Built unified ordering API for DoorDash, Uber Eats, and Amazon Fresh for multi-channel platform', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Meow Wolf highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-meow-h1', 'rv-fullstack', 'ri-fs-meow', '0', 'highlight', 'Built shared React component library and Docker deployment pipeline for immersive art venues', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Opna highlights (2)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-opna-h1', 'rv-fullstack', 'ri-fs-opna', '0', 'highlight', 'Co-founded consultancy delivering full-stack solutions for Intuit, McDonald''s, Google, and JLL on GCP', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-opna-h2', 'rv-fullstack', 'ri-fs-opna', '1', 'highlight', 'Built Python gRPC game server with Docker, cutting provisioning from minutes to seconds at scale', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Consulting highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-consult-h1', 'rv-fullstack', 'ri-fs-consult', '0', 'highlight', 'Built full-stack micro-credential platform with React and PostgreSQL on GCP for educator networks', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Job Finder (1 highlight, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-proj-jobfinder', 'rv-fullstack', 'ri-fs-projects', '0', 'project', 'Job Finder', 'AI-assisted job search platform with LiteLLM proxy for unified model routing across Claude, Gemini, and Ollama', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-proj-jf-h1', 'rv-fullstack', 'ri-fs-proj-jobfinder', '0', 'highlight', 'Monorepo with React/Vite frontend, Express API, Python worker, and shared TypeScript contracts', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: App Monitor (1 highlight, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, website, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-proj-appmon', 'rv-fullstack', 'ri-fs-projects', '1', 'project', 'App Monitor', 'https://app-monitor.joshwentworth.com', 'Platform orchestrating autonomous AI development agents with ephemeral Docker containers and real-time SSE', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-proj-am-h1', 'rv-fullstack', 'ri-fs-proj-appmon', '0', 'highlight', 'Shared TypeScript contracts across full-stack monorepo with 400+ automated tests and E2E coverage', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Skills (4 categories)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-sk-frontend', 'rv-fullstack', 'ri-fs-skills', '0', 'skills', 'Frontend', '["React","Angular","Tailwind CSS","Shadcn","MaterialUI","Styled Components"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-sk-backend', 'rv-fullstack', 'ri-fs-skills', '1', 'skills', 'Backend & APIs', '["Node.js","Express","Python","Flask","GraphQL","REST"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-sk-cloud', 'rv-fullstack', 'ri-fs-skills', '2', 'skills', 'Cloud & Infrastructure', '["GCP","Docker","Kubernetes","Firebase","GitHub Actions","CircleCI"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-sk-data', 'rv-fullstack', 'ri-fs-skills', '3', 'skills', 'Data & Messaging', '["MySQL","MongoDB","Redis","SQLite","Pub/Sub","BullMQ"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Education (2 entries)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-edu-gcp', 'rv-fullstack', 'ri-fs-edu', '0', 'education', 'Google Cloud', 'Professional Cloud Developer Certificate', '2021', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-fs-edu-ucsc', 'rv-fullstack', 'ri-fs-edu', '1', 'education', 'University of California — Santa Cruz', 'B.A. in Music', 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- ==============================================================================
-- rv-backend — Backend Engineer
-- Bullet allocation: 4/2/1/1 = 8 total, 2 projects
-- ==============================================================================

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-summary', 'rv-backend', '0', 'narrative', 'Professional Summary', 'Backend engineer with 8+ years building distributed systems and event-driven architectures for clients including Amazon, DoorDash, and Uber Eats. Deep expertise in Python, Node.js, and Kubernetes on GCP.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-fulfil', 'rv-backend', '1', 'work', 'Fulfil Solutions', 'Senior Software Engineer', 'Mountain View, CA — Remote (Portland, OR)', '2021-12', '2025-03', '["Node.js","TypeScript","MySQL","Redis","MongoDB","Pub/Sub","Kubernetes","Grafana/Loki"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-opna', 'rv-backend', '2', 'work', 'Opna Development', 'Co-Founder & Lead Engineer', 'San Francisco, CA', '2017-06', '2021-12', '["Node.js","Python","TypeScript","GraphQL","Apollo","GCP","Docker","gRPC"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-consult', 'rv-backend', '3', 'work', 'Various Consulting Projects', 'Software Engineer', 'San Francisco, CA', '2015-08', '2017-06', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-britelite', 'rv-backend', '4', 'work', 'Britelite Immersive', 'Technical Director', 'San Francisco, CA', '2013-02', '2015-09', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-projects', 'rv-backend', '5', 'section', 'Projects', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-skills', 'rv-backend', '6', 'section', 'Skills', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-edu', 'rv-backend', '7', 'section', 'Education & Certifications', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Fulfil highlights (4)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-fulfil-h1', 'rv-backend', 'ri-be-fulfil', '0', 'highlight', 'Architected event-driven Pub/Sub pipeline for Amazon Fresh — first tier-1 partner — with sub-second inventory sync', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-fulfil-h2', 'rv-backend', 'ri-be-fulfil', '1', 'highlight', 'Doubled robotic fulfillment throughput by designing intelligent order batching algorithm', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-fulfil-h3', 'rv-backend', 'ri-be-fulfil', '2', 'highlight', 'Built unified REST API for DoorDash, Uber Eats, and Amazon Fresh with webhook lifecycle events', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-fulfil-h4', 'rv-backend', 'ri-be-fulfil', '3', 'highlight', 'Cut infrastructure costs by migrating from Elastic to Grafana/Loki/Prometheus with PagerDuty alerting', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Opna highlights (2)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-opna-h1', 'rv-backend', 'ri-be-opna', '0', 'highlight', 'Designed microservice architecture with Dialogflow NLP and GraphQL/Apollo APIs on GCP App Engine', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-opna-h2', 'rv-backend', 'ri-be-opna', '1', 'highlight', 'Built Python gRPC game server with Docker, cutting provisioning from minutes to seconds', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Consulting highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-consult-h1', 'rv-backend', 'ri-be-consult', '0', 'highlight', 'Built micro-credential backend on GCP App Engine with PostgreSQL for national educator platforms', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Britelite highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-britelite-h1', 'rv-backend', 'ri-be-britelite', '0', 'highlight', 'Achieved 100% uptime across live events by engineering real-time social media API integrations', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Job Finder (1 highlight, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-proj-jobfinder', 'rv-backend', 'ri-be-projects', '0', 'project', 'Job Finder', 'AI-assisted job search platform with Python scraping worker, Express REST API, and SQLite database', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-proj-jf-h1', 'rv-backend', 'ri-be-proj-jobfinder', '0', 'highlight', 'Multi-service architecture: Express API, Flask worker, SQLite + sqlite-vec, Docker Compose', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Imagineer (1 highlight, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-proj-imagineer', 'rv-backend', 'ri-be-projects', '1', 'project', 'Imagineer', 'Full-stack AI/ML platform for Stable Diffusion image generation with split-service architecture', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-proj-im-h1', 'rv-backend', 'ri-be-proj-imagineer', '0', 'highlight', 'Flask API with GPU worker using subprocess execution for automatic VRAM management and model hot-swapping', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Skills (4 categories)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-sk-lang', 'rv-backend', 'ri-be-skills', '0', 'skills', 'Languages & Frameworks', '["Python","Node.js","TypeScript","Express","Flask","GraphQL"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-sk-cloud', 'rv-backend', 'ri-be-skills', '1', 'skills', 'Cloud & Infrastructure', '["GCP","Kubernetes","Docker","Linux","Firebase","Terraform"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-sk-data', 'rv-backend', 'ri-be-skills', '2', 'skills', 'Data & Messaging', '["MySQL","MongoDB","Redis","SQLite","PostgreSQL","Pub/Sub"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-sk-obs', 'rv-backend', 'ri-be-skills', '3', 'skills', 'Observability & DevOps', '["Grafana/Loki","Prometheus","Sentry","PagerDuty","GitHub Actions"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Education (2 entries)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-edu-gcp', 'rv-backend', 'ri-be-edu', '0', 'education', 'Google Cloud', 'Professional Cloud Developer Certificate', '2021', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-be-edu-ucsc', 'rv-backend', 'ri-be-edu', '1', 'education', 'University of California — Santa Cruz', 'B.A. in Music', 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- ==============================================================================
-- rv-ai — AI / ML Engineer
-- Bullet allocation: 3/3/1 = 7 total, 2 projects (2+2 highlights)
-- ==============================================================================

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-summary', 'rv-ai', '0', 'narrative', 'Professional Summary', 'AI/ML engineer with 8+ years of software experience and hands-on ML deployment from TinyML on embedded hardware to cloud-scale LLM orchestration. Proficient in Python, PyTorch, and TypeScript.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-fulfil', 'rv-ai', '1', 'work', 'Fulfil Solutions', 'Senior Software Engineer', 'Mountain View, CA — Remote (Portland, OR)', '2021-12', '2025-03', '["Node.js","TypeScript","Pub/Sub","MongoDB","Redis","MySQL","Kubernetes"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-opna', 'rv-ai', '2', 'work', 'Opna Development', 'Co-Founder & Lead Engineer', 'San Francisco, CA', '2017-06', '2021-12', '["Python","Node.js","TypeScript","Dialogflow","GCP","Docker","gRPC"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-britelite', 'rv-ai', '3', 'work', 'Britelite Immersive', 'Technical Director', 'San Francisco, CA', '2013-02', '2015-09', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-projects', 'rv-ai', '4', 'section', 'Projects', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-skills', 'rv-ai', '5', 'section', 'Skills', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-edu', 'rv-ai', '6', 'section', 'Education & Certifications', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Fulfil highlights (3)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-fulfil-h1', 'rv-ai', 'ri-ai-fulfil', '0', 'highlight', 'Doubled robotic fulfillment throughput by designing heuristic optimization for order batching', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-fulfil-h2', 'rv-ai', 'ri-ai-fulfil', '1', 'highlight', 'Built event-driven Pub/Sub data pipeline for Amazon Fresh with sub-second latency at scale', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-fulfil-h3', 'rv-ai', 'ri-ai-fulfil', '2', 'highlight', 'Cut mean time to detection with Grafana/Loki/Prometheus observability across Kubernetes', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Opna highlights (3)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-opna-h1', 'rv-ai', 'ri-ai-opna', '0', 'highlight', 'Built McDonald''s NLP ordering microservices with Dialogflow for intent recognition and entity extraction on GCP', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-opna-h2', 'rv-ai', 'ri-ai-opna', '1', 'highlight', 'Designed Dialogflow chatbot for JLL enabling natural language facility requests at enterprise scale', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-opna-h3', 'rv-ai', 'ri-ai-opna', '2', 'highlight', 'Built Python gRPC game server with Docker for real-time session management at scale', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Britelite highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-britelite-h1', 'rv-ai', 'ri-ai-britelite', '0', 'highlight', 'Delivered real-time interactive installations using Python and GLSL shaders with sub-frame latency', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Blinky Time (2 highlights, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-proj-blinky', 'rv-ai', 'ri-ai-projects', '0', 'project', 'Blinky Time — Music-Aware LED Visualizer', 'Wearable LED art platform with end-to-end TinyML pipeline for real-time beat detection on embedded hardware', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-proj-blinky-h1', 'rv-ai', 'ri-ai-proj-blinky', '0', 'highlight', 'PyTorch pipeline with quantization-aware training, exported to TFLite Micro for sub-10ms inference on nRF52840', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-proj-blinky-h2', 'rv-ai', 'ri-ai-proj-blinky', '1', 'highlight', 'Real-time audio DSP with music information retrieval for beat detection and genre classification', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Imagineer (2 highlights, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-proj-imagineer', 'rv-ai', 'ri-ai-projects', '1', 'project', 'Imagineer', 'Full-stack AI/ML platform for Stable Diffusion image generation with multi-LoRA model stacking', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-proj-im-h1', 'rv-ai', 'ri-ai-proj-imagineer', '0', 'highlight', 'Split-service Flask API with GPU worker for automatic VRAM management and model hot-swapping', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-proj-im-h2', 'rv-ai', 'ri-ai-proj-imagineer', '1', 'highlight', 'Semantic search via sentence-BERT embeddings for model recommendations and content-based retrieval', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Skills (4 categories)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-sk-ml', 'rv-ai', 'ri-ai-skills', '0', 'skills', 'AI / ML', '["PyTorch","TFLite Micro","Stable Diffusion","Hugging Face","LiteLLM","Ollama"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-sk-lang', 'rv-ai', 'ri-ai-skills', '1', 'skills', 'Languages & Frameworks', '["Python","TypeScript","Node.js","C++","Flask","Express","React"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-sk-cloud', 'rv-ai', 'ri-ai-skills', '2', 'skills', 'Cloud & Infrastructure', '["GCP","Docker","Kubernetes","Terraform","Linux","GitHub Actions"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-sk-data', 'rv-ai', 'ri-ai-skills', '3', 'skills', 'Data & Messaging', '["SQLite","MongoDB","MySQL","Redis","PostgreSQL","Pub/Sub"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Education (2 entries)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-edu-gcp', 'rv-ai', 'ri-ai-edu', '0', 'education', 'Google Cloud', 'Professional Cloud Developer Certificate', '2021', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-ai-edu-ucsc', 'rv-ai', 'ri-ai-edu', '1', 'education', 'University of California — Santa Cruz', 'B.A. in Music', 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- ==============================================================================
-- rv-solution-engineer — Solution Engineer
-- Bullet allocation: 3/3/1/1 = 8 total, 2 projects
-- ==============================================================================

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-summary', 'rv-solution-engineer', '0', 'narrative', 'Professional Summary', 'Solutions-oriented engineer with 10+ years building systems and delivering technical solutions for enterprise clients including Amazon, McDonald''s, and Google. Proven stakeholder engagement and project ownership.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-fulfil', 'rv-solution-engineer', '1', 'work', 'Fulfil Solutions', 'Senior Software Engineer', 'Mountain View, CA — Remote (Portland, OR)', '2021-12', '2025-03', '["Angular","Node.js","TypeScript","Pub/Sub","MySQL","Redis","Kubernetes","Stripe"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-opna', 'rv-solution-engineer', '2', 'work', 'Opna Development', 'Co-Founder & Lead Engineer', 'San Francisco, CA', '2017-06', '2021-12', '["Node.js","React","TypeScript","Python","GCP","Dialogflow","GraphQL"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-consult', 'rv-solution-engineer', '3', 'work', 'Various Consulting Projects', 'Software Engineer', 'San Francisco, CA', '2015-08', '2017-06', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, role, location, start_date, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-britelite', 'rv-solution-engineer', '4', 'work', 'Britelite Immersive', 'Technical Director', 'San Francisco, CA', '2013-02', '2015-09', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-projects', 'rv-solution-engineer', '5', 'section', 'Projects', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-skills', 'rv-solution-engineer', '6', 'section', 'Skills', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, order_index, ai_context, title, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-edu', 'rv-solution-engineer', '7', 'section', 'Education & Certifications', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Fulfil highlights (3)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-fulfil-h1', 'rv-solution-engineer', 'ri-se-fulfil', '0', 'highlight', 'Shipped grocery PWA end-to-end from stakeholder requirements through deployment and post-launch support', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-fulfil-h2', 'rv-solution-engineer', 'ri-se-fulfil', '1', 'highlight', 'Launched Amazon Fresh by collaborating with Amazon engineering to translate requirements into Pub/Sub architecture', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-fulfil-h3', 'rv-solution-engineer', 'ri-se-fulfil', '2', 'highlight', 'Built unified ordering API for DoorDash, Uber Eats, and Amazon, consolidating all order sources', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Opna highlights (3)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-opna-h1', 'rv-solution-engineer', 'ri-se-opna', '0', 'highlight', 'Co-founded consultancy leading client requirements and delivery for Intuit, McDonald''s, and Google', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-opna-h2', 'rv-solution-engineer', 'ri-se-opna', '1', 'highlight', 'Built McDonald''s NLP and JLL facility workflows with Dialogflow requiring deep stakeholder alignment', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-opna-h3', 'rv-solution-engineer', 'ri-se-opna', '2', 'highlight', 'Delivered Intuit marketing widgets on tight timelines serving high-traffic monthly impressions', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Consulting highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-consult-h1', 'rv-solution-engineer', 'ri-se-consult', '0', 'highlight', 'Delivered micro-credential builder on GCP for National Education Association and National Geographic', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Britelite highlight (1)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-britelite-h1', 'rv-solution-engineer', 'ri-se-britelite', '0', 'highlight', 'Directed technical delivery of interactive installations for Fortune 500 clients at live events', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: App Monitor (1 highlight, no tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, website, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-proj-appmon', 'rv-solution-engineer', 'ri-se-projects', '0', 'project', 'App Monitor', 'https://app-monitor.joshwentworth.com', 'Platform orchestrating autonomous AI development agents with real-time event streaming', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-proj-am-h1', 'rv-solution-engineer', 'ri-se-proj-appmon', '0', 'highlight', 'End-to-end delivery with comprehensive documentation and 400+ automated tests across all layers', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Project: Imagineer (description only, no highlights or tech)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-proj-imagineer', 'rv-solution-engineer', 'ri-se-projects', '1', 'project', 'Imagineer', 'Full-stack AI platform for Stable Diffusion image generation with interactive story engine and semantic model search', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Skills (4 categories)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-sk-lang', 'rv-solution-engineer', 'ri-se-skills', '0', 'skills', 'Languages & Frameworks', '["TypeScript","Python","Node.js","Express","React","Angular","GraphQL"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-sk-cloud', 'rv-solution-engineer', 'ri-se-skills', '1', 'skills', 'Cloud & Platform', '["GCP","Docker","Kubernetes","Firebase","Linux","GitHub Actions"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-sk-integ', 'rv-solution-engineer', 'ri-se-skills', '2', 'skills', 'APIs & Integrations', '["REST","GraphQL","Stripe","DoorDash","Uber Eats","Dialogflow","Salesforce"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, skills, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-sk-collab', 'rv-solution-engineer', 'ri-se-skills', '3', 'skills', 'Delivery & Collaboration', '["Requirements Gathering","Stakeholder Management","Project Scoping"]', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

-- Education (2 entries)
INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, end_date, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-edu-gcp', 'rv-solution-engineer', 'ri-se-edu', '0', 'education', 'Google Cloud', 'Professional Cloud Developer Certificate', '2021', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

INSERT INTO resume_items (id, resume_version_id, parent_id, order_index, ai_context, title, role, description, created_at, updated_at, created_by, updated_by)
VALUES ('ri-se-edu-ucsc', 'rv-solution-engineer', 'ri-se-edu', '1', 'education', 'University of California — Santa Cruz', 'B.A. in Music', 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.', '2026-03-09 02:04:54', '2026-03-09 02:04:54', 'contact@joshwentworth.com', 'contact@joshwentworth.com');

COMMIT;
