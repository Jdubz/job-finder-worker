-- Normalize match-policy to remove legacy weights and require missingRequiredScore

-- Remove deprecated weights block and ensure missingRequiredScore is set explicitly
UPDATE job_finder_config
SET payload_json = json_set(
        json_remove(payload_json, '$.weights'),
        '$.technology.missingRequiredScore',
        COALESCE(json_extract(payload_json, '$.technology.missingRequiredScore'), -15)
    )
WHERE id = 'match-policy';

-- Optional: vacuum not required here
