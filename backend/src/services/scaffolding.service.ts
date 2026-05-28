/**
 * scaffolding.service.ts — Project and study folder scaffolding
 *
 * Phase B-0.5: Replaces opaque folder template copy (config/templates/)
 * with explicit, testable scaffolding operations.
 *
 * Architecture:
 * - Structure defined in config/folderStructure.ts (single source of truth)
 * - Content templates fetched from qori-studies/_content/ at runtime
 * - Handlebars interpolation for project/study variables
 * - GitHub writes via existing createOrUpdateFileOnGitHub
 *
 * Called by:
 * - projectStartHandler.ts → scaffoldProject()
 * - briefHandler.ts → scaffoldStudy()
 * - createStudyHandler.ts → scaffoldStudy()
 */

import Handlebars from 'handlebars';
import { format } from 'date-fns';
import { fetchFileFromRepo, createOrUpdateFileOnGitHub } from '../helpers/github';
import { STUDY_FOLDERS, CONTENT_TEMPLATES, SCAFFOLDED_CONTENT } from '../config/folderStructure';

// ─── Types ───────────────────────────────────────────────────────────

export interface ScaffoldProjectResult {
  projectReadmePath: string;
  projectReadmeUrl: string;
  errors: string[];
}

export interface ScaffoldStudyResult {
  studyReadmePath: string;
  studyReadmeUrl: string;
  observerGuidesPaths: string[];
  errors: string[];
}

interface TemplateVariables {
  project_name: string;
  project_slug: string;
  study_name?: string;
  study_slug?: string;
  created_date: string;
  created_by: string;
}

// ─── Content template fetching ───────────────────────────────────────

const CONTENT_PATH = '_content';

/**
 * Fetch a content template from qori-studies/_content/.
 * Always fetches from 'main' branch — content templates are not branched.
 * Returns null on failure (graceful degradation).
 */
async function fetchContentTemplate(filename: string): Promise<string | null> {
  const repo = process.env.GITHUB_REPO;
  const owner = process.env.GITHUB_OWNER;
  console.log(`📥 fetchContentTemplate: ${filename} from ${owner}/${repo}/_content/ (ref: main)`);

  try {
    if (!repo) {
      console.warn('⚠️ GITHUB_REPO not set — cannot fetch content template');
      return null;
    }

    // Explicit ref: 'main' — content templates live on main, not feature branches
    const file = await fetchFileFromRepo(repo, CONTENT_PATH, filename, { ref: 'main' });
    console.log(`✅ fetchContentTemplate success: ${filename} (${file.content.length} chars)`);
    return file.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Content template fetch failed: ${filename} — ${message}`);
    console.error(`   Full error:`, err);
    return null;
  }
}

/**
 * Render a template with Handlebars variables.
 */
function renderTemplate(template: string, vars: TemplateVariables): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(vars);
}

// ─── Project scaffolding ─────────────────────────────────────────────

/**
 * Scaffold a new project folder.
 *
 * Creates:
 * - {project-slug}/README.md with folder structure documentation
 *
 * Called by projectStartHandler.ts when /qori-start creates a project.
 */
export async function scaffoldProject(
  projectSlug: string,
  projectName: string,
  createdBy: string,
): Promise<ScaffoldProjectResult> {
  const errors: string[] = [];

  const vars: TemplateVariables = {
    project_name: projectName,
    project_slug: projectSlug,
    created_date: format(new Date(), 'yyyy-MM-dd'),
    created_by: createdBy,
  };

  // Fetch project README template
  const readmeTemplate = await fetchContentTemplate(CONTENT_TEMPLATES.PROJECT_README);
  if (!readmeTemplate) {
    throw new Error('Failed to fetch project-readme-template.md — cannot scaffold project');
  }

  // Render and write README
  const readmeContent = renderTemplate(readmeTemplate, vars);
  const readmePath = `${projectSlug}/${SCAFFOLDED_CONTENT.PROJECT_README}`;

  const result = await createOrUpdateFileOnGitHub(readmePath, readmeContent);

  console.log(`✅ Project scaffolded: ${projectSlug}/README.md`);

  return {
    projectReadmePath: readmePath,
    projectReadmeUrl: result.url,
    errors,
  };
}

// ─── Study scaffolding ───────────────────────────────────────────────

/**
 * Scaffold a new study folder within a project.
 *
 * Creates:
 * - {project-slug}/{study-slug}/README.md with cascade status
 * - {project-slug}/{study-slug}/03-fieldwork/observer-guidelines.md
 * - {project-slug}/{study-slug}/03-fieldwork/observer-guide-expanded.md
 *
 * Called by briefHandler.ts and createStudyHandler.ts when a study is created.
 *
 * Partial failure semantics:
 * - README write failure = hard fail (throw)
 * - Observer guide write failure = soft fail (log, continue)
 */
export async function scaffoldStudy(
  projectSlug: string,
  studySlug: string,
  studyName: string,
  projectName: string,
  createdBy: string,
): Promise<ScaffoldStudyResult> {
  const errors: string[] = [];
  const observerGuidesPaths: string[] = [];

  const vars: TemplateVariables = {
    project_name: projectName,
    project_slug: projectSlug,
    study_name: studyName,
    study_slug: studySlug,
    created_date: format(new Date(), 'yyyy-MM-dd'),
    created_by: createdBy,
  };

  const studyRoot = `${projectSlug}/${studySlug}`;

  // 1. Write study README (required — fail if this fails)
  const readmeTemplate = await fetchContentTemplate(CONTENT_TEMPLATES.STUDY_README);
  if (!readmeTemplate) {
    throw new Error('Failed to fetch study-readme-template.md — cannot scaffold study');
  }

  const readmeContent = renderTemplate(readmeTemplate, vars);
  const readmePath = `${studyRoot}/${SCAFFOLDED_CONTENT.STUDY_README}`;
  const readmeResult = await createOrUpdateFileOnGitHub(readmePath, readmeContent);

  console.log(`✅ Study README scaffolded: ${readmePath}`);

  // 2. Write observer guidelines (optional — log warning, continue)
  const observerGuides = [
    { template: CONTENT_TEMPLATES.OBSERVER_GUIDELINES, dest: SCAFFOLDED_CONTENT.OBSERVER_GUIDELINES },
    { template: CONTENT_TEMPLATES.OBSERVER_GUIDE_EXPANDED, dest: SCAFFOLDED_CONTENT.OBSERVER_GUIDE_EXPANDED },
  ];

  for (const guide of observerGuides) {
    const content = await fetchContentTemplate(guide.template);
    if (!content) {
      errors.push(`Content fetch failed: ${guide.template}`);
      continue;
    }

    const guidePath = `${studyRoot}/${guide.dest}`;
    try {
      await createOrUpdateFileOnGitHub(guidePath, content);
      observerGuidesPaths.push(guidePath);
      console.log(`✅ Observer guide scaffolded: ${guidePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`GitHub write failed: ${guidePath} — ${message}`);
      console.warn(`⚠️ Observer guide write failed: ${guidePath}`);
    }
  }

  return {
    studyReadmePath: readmePath,
    studyReadmeUrl: readmeResult.url,
    observerGuidesPaths,
    errors,
  };
}
