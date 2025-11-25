-- Update ai_context to new taxonomy:
-- work, highlight, project, education, skills, narrative, section

-- First, clear old values to reclassify
UPDATE content_items SET ai_context = NULL;

-- Narrative items (overview, bio, closing notes)
UPDATE content_items SET ai_context = 'narrative'
WHERE id IN ('overview', 'biography', 'closing-notes');

-- Section containers (groupings that organize children)
UPDATE content_items SET ai_context = 'section'
WHERE id IN ('selected-projects', 'skills-technologies', 'education-certificates');

-- Work experience (root level items with a role = job title)
UPDATE content_items SET ai_context = 'work'
WHERE parent_id IS NULL
  AND role IS NOT NULL
  AND ai_context IS NULL
  AND id NOT IN ('overview', 'biography', 'closing-notes', 'selected-projects', 'skills-technologies', 'education-certificates');

-- Highlights (children of work items)
UPDATE content_items SET ai_context = 'highlight'
WHERE parent_id IN (SELECT id FROM content_items WHERE ai_context = 'work')
  AND ai_context IS NULL;

-- Education items (children of education-certificates)
UPDATE content_items SET ai_context = 'education'
WHERE parent_id = 'education-certificates';

-- Personal projects (children of selected-projects)
UPDATE content_items SET ai_context = 'project'
WHERE parent_id = 'selected-projects';

-- Skills (children of skills-technologies)
UPDATE content_items SET ai_context = 'skills'
WHERE parent_id = 'skills-technologies';

-- Catch any remaining items: if they have a parent, likely highlights; otherwise section
UPDATE content_items SET ai_context = 'highlight'
WHERE ai_context IS NULL AND parent_id IS NOT NULL;

UPDATE content_items SET ai_context = 'section'
WHERE ai_context IS NULL AND parent_id IS NULL;
