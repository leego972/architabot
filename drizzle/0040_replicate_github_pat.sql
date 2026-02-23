-- Add GitHub PAT and repo URL columns to replicate_projects
ALTER TABLE `replicate_projects` ADD COLUMN `githubPat` text;
ALTER TABLE `replicate_projects` ADD COLUMN `githubRepoUrl` text;

-- Update status enum to include new values
ALTER TABLE `replicate_projects` MODIFY COLUMN `status` enum('researching','research_complete','planning','plan_complete','building','build_complete','branded','pushing','pushed','deploying','deployed','testing','complete','error') NOT NULL DEFAULT 'researching';
