// src/helpers/github.ts
import path from 'path';

// ─── Return types ────────────────────────────────────────────────────

/** Result of copyFilesToFolder — written files with a GitHub tree URL. */
export interface CopyFilesResult {
  message: string;
  url: string;
  path: string;
}

/** A template file read from the config repo (readFolders output item). */
export interface RepoFile {
  sha: string;
  name: string;
  path: string;
  content: string;
  ext: string;
}

/** A folder listing entry (readFolderContents output item). */
export interface FolderEntry {
  name: string;
  path: string;
}

/** Result of fetchFileFromRepo — a single file's content. */
export interface FetchedFile {
  name: string;
  path: string;
  content: string;
}

/** Result of fetchFileFromRepoByPath — a single file's content (no name). */
export interface FetchedFileByPath {
  path: string;
  content: string;
}

/** Result of createOrUpdateFileOnGitHub. */
export interface GitHubWriteResult {
  path: string;
  sha: string;
  url: string;
}

/** A parsed GitHub issue from AI-generated content. */
export interface ParsedGitHubIssue {
  title: string;
  body: string;
  labels: string[];
  priority?: string;
  effort?: string;
}

/** A created GitHub issue result. */
export interface CreatedGitHubIssue {
  number: number;
  title: string;
  url: string;
  priority?: string;
  effort?: string;
}

/** Result of deleteStudyFolderFromGitHub. */
export interface DeleteFolderResult {
  deleted: number;
  total?: number;
  errors?: Array<{ path: string; error: string }>;
  message: string;
}

/** A file input for copyFilesToFolder. */
interface TemplateFile {
  path: string;
  content: string;
}

/** A GitHub directory listing item (from Octokit getContent). */
interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string;
}

// ─── Config helpers ──────────────────────────────────────────────────

/**
 * Returns the repo used for config reads (templates, YAML prompts).
 * Falls back to GITHUB_REPO if GITHUB_CONFIG_REPO is not set.
 */
export function getConfigRepo(): string {
  const repo = process.env.GITHUB_CONFIG_REPO || process.env.GITHUB_REPO;
  if (!repo) throw new Error('Neither GITHUB_CONFIG_REPO nor GITHUB_REPO is set');
  return repo;
}

/**
 * Path to YAML prompt templates in the config repo.
 * All fetchFileFromRepo calls for YAML templates should use this constant.
 */
export const YAML_TEMPLATE_PATH = 'config/prompts';

/**
 * Returns the content repo (GITHUB_REPO). Throws if not set.
 * Use getConfigRepo() for config reads, getContentRepo() for content writes.
 */
export function getContentRepo(): string {
  const repo = process.env.GITHUB_REPO;
  if (!repo) throw new Error('GITHUB_REPO is not set');
  return repo;
}

// ─── Internal helpers ────────────────────────────────────────────────

function getDestPath(filePath: string, baseFolder: string, folder: string, targetFolder: string): string {
  const parts = filePath.split(path.posix.sep);
  const tmplIdx = parts.indexOf('templates');
  const subpath = tmplIdx >= 0 ? parts.slice(tmplIdx + 1) : parts.slice(1);
  return path.posix.join(baseFolder, folder, targetFolder, ...subpath);
}

// ─── GitHub operations ───────────────────────────────────────────────

export async function copyFilesToFolder(
  files: TemplateFile[],
  folder: string,
  targetFolder: string,
  repo: string,
  baseFolder: string,
): Promise<CopyFilesResult> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  const written: string[] = [];

  for (const file of files) {
    const destPath = getDestPath(file.path, baseFolder, folder, targetFolder);
    console.log('→ writing to:', destPath);
    const content = Buffer.from(file.content, 'utf8').toString('base64');

    let sha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner, repo, path: destPath, ref: 'main',
      });
      sha = (data as GitHubContentItem).sha;
    } catch (err: unknown) {
      if ((err as { status?: number }).status !== 404) throw err;
    }

    const params = {
      owner, repo, path: destPath,
      message: `chore: add ${destPath}`,
      content, branch: 'main',
      ...(sha && { sha }),
    };

    const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);
    console.log(`✅ Wrote ${data.content!.path} @ ${data.commit.sha}`);
    written.push(data.content!.path!);
  }

  // Filter empty strings to avoid leading slash, then encode each segment
  const pathSegments = [baseFolder, folder, targetFolder].filter(Boolean);
  const encodedPath = pathSegments.map(encodeURIComponent).join('/');
  const url = `https://github.com/${owner}/${repo}/tree/main/${encodedPath}`;
  return { message: `🎉 All ${written.length} files created/updated successfully`, url, path: pathSegments.join('/') };
}

export async function createOrUpdateFileOnGitHub(
  filePath: string,
  fileContent: string,
): Promise<GitHubWriteResult> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  const repo = process.env.GITHUB_REPO!;
  const contentBase64 = Buffer.from(fileContent, 'utf8').toString('base64');

  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: filePath, ref: 'main',
    });
    sha = (data as GitHubContentItem).sha;
  } catch (err: unknown) {
    if ((err as { status?: number }).status !== 404) throw err;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const params = {
      owner, repo, path: filePath,
      message: `chore: add ${filePath}`,
      content: contentBase64, branch: 'main',
      ...(sha && { sha }),
    };

    try {
      const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);
      return {
        path: data.content!.path!,
        sha: data.content!.sha!,
        url: `https://github.com/${owner}/${repo}/blob/main/${filePath}`,
      };
    } catch (err: unknown) {
      const octokitErr = err as { status?: number; message?: string };
      if (octokitErr.status === 409 && attempt < maxAttempts) {
        console.warn(`⚠️ SHA conflict on ${filePath}, retrying (${attempt}/${maxAttempts})...`);
        try {
          const { data: freshData } = await octokit.rest.repos.getContent({
            owner, repo, path: filePath, ref: 'main',
          });
          sha = (freshData as GitHubContentItem).sha;
        } catch (fetchErr: unknown) {
          if ((fetchErr as { status?: number }).status === 404) sha = undefined;
          else throw fetchErr;
        }
        continue;
      }
      throw err;
    }
  }

  // Unreachable, but TypeScript needs a return
  throw new Error(`Failed to write ${filePath} after ${maxAttempts} attempts`);
}

export async function readFolderContents(folderPath: string, repo: string): Promise<FolderEntry[]> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;

  const { data: items } = await octokit.rest.repos.getContent({ owner, repo, path: folderPath });
  const list = (Array.isArray(items) ? items : [items]) as GitHubContentItem[];

  return list.map(item => ({ name: item.name, path: item.path }));
}

export async function readFolders(folderPath: string, repo: string): Promise<RepoFile[]> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;

  const { data: items } = await octokit.rest.repos.getContent({ owner, repo, path: folderPath });
  const list = (Array.isArray(items) ? items : [items]) as GitHubContentItem[];
  const results: RepoFile[] = [];

  for (const item of list) {
    if (item.type === 'dir') {
      const nested = await readFolders(item.path, repo);
      results.push(...nested);
    } else if (item.type === 'file') {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner, repo, path: item.path,
      });
      const ext = path.extname(item.name).slice(1);
      const content = Buffer.from((fileData as GitHubContentItem).content!, 'base64').toString('utf8');
      results.push({ sha: item.sha, name: item.name, path: item.path, content, ext });
    }
  }

  return results;
}

export async function fetchFileFromRepo(
  repo: string,
  folderPath: string,
  fileName: string,
  options?: { ref?: string },
): Promise<FetchedFile> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  // GITHUB_CONFIG_BRANCH allows fetching from a feature branch for local testing
  // Only apply to config repo operations (YAML templates), not content repo operations
  // Callers can override ref explicitly (e.g., scaffolding always fetches from 'main')
  const ref = options?.ref !== undefined
    ? (options.ref || undefined) // explicit ref passed (empty string = default branch)
    : (repo === getConfigRepo() ? (process.env.GITHUB_CONFIG_BRANCH || undefined) : undefined);

  const filePath = folderPath
    ? `${folderPath.replace(/\/$/, '')}/${fileName}`
    : fileName;

  try {
    const { data: fileData } = await octokit.rest.repos.getContent({ owner, repo, path: filePath, ref });
    const content = Buffer.from((fileData as GitHubContentItem).content!, 'base64').toString('utf8');
    return { name: fileName, path: filePath, content };
  } catch (err: unknown) {
    console.error(`Error fetching ${filePath} from ${owner}/${repo}:`, err);
    throw new Error(`Could not fetch file ${filePath}`);
  }
}

export async function fetchFileFromRepoByPath(repo: string, folderPath: string): Promise<FetchedFileByPath> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;
  // GITHUB_CONFIG_BRANCH only applies to config repo, not content repo
  const ref = repo === getConfigRepo() ? (process.env.GITHUB_CONFIG_BRANCH || undefined) : undefined;

  const filePath = folderPath ? folderPath.replace(/\/$/, '') : '';

  try {
    const { data: fileData } = await octokit.rest.repos.getContent({ owner, repo, path: filePath, ref });
    const content = Buffer.from((fileData as GitHubContentItem).content!, 'base64').toString('utf8');
    return { path: filePath, content };
  } catch (err: unknown) {
    console.error(`Error fetching ${filePath} from ${owner}/${repo}:`, err);
    throw new Error(`Could not fetch file ${filePath}`);
  }
}

export async function listAllTopLevelFolders(repo: string): Promise<GitHubContentItem[]> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const { data: items } = await octokit.rest.repos.getContent({
    owner: process.env.GITHUB_OWNER!, repo, path: '',
  });
  return ((Array.isArray(items) ? items : [items]) as GitHubContentItem[]).filter(item => item.type === 'dir');
}

export async function listOrgRepos(): Promise<unknown[]> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const repos = await octokit.paginate(
    octokit.rest.repos.listForAuthenticatedUser,
    { visibility: 'all', affiliation: 'owner,collaborator,organization_member', per_page: 100 },
  );
  return repos;
}

// ─── Issue parsing and creation ──────────────────────────────────────

function formatResearchSourceLink(body: string): string {
  if (!body) return body;
  if (!body.includes('Research Source') || !body.includes('Full Research Readout')) {
    return body;
  }

  const pattern = /(##\s*Research\s*Source[^\n]*\n\s*\n?)([^\n]*?)(📊\s*)?\[Full\s*Research\s*Readout\]\(([^)]+)\)/gi;
  const originalBody = body;

  const formatted = body.replace(pattern, (_match, heading: string, _beforeLink: string, _emoji: string, url: string) => {
    if (!url) {
      const urlMatch = _match.match(/\[Full\s*Research\s*Readout\]\(([^)]+)\)/);
      if (urlMatch?.[1]) {
        url = urlMatch[1];
      } else {
        console.warn('⚠️ Could not extract URL from Research Source link:', _match);
        return _match;
      }
    }
    const cleanHeading = heading.trim();
    const result = `${cleanHeading}\n\n[Full Research Readout](${url})`;
    console.log('✅ Formatted Research Source link:', result.substring(0, 100));
    return result;
  });

  if (formatted !== originalBody) {
    console.log('✅ Research Source link formatted successfully');
  } else {
    console.warn('⚠️ Research Source link format not changed - pattern may not have matched');
    console.log('Body snippet:', body.substring(body.indexOf('Research Source') - 50, body.indexOf('Research Source') + 200));
  }

  return formatted;
}

export function parseGitHubIssues(issuesContent: string): ParsedGitHubIssue[] {
  try {
    const trimmedContent = issuesContent.trim();
    let jsonContent = trimmedContent;
    if (trimmedContent.startsWith('```json')) {
      jsonContent = trimmedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (trimmedContent.startsWith('```')) {
      jsonContent = trimmedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent) as
      | ParsedGitHubIssue[]
      | { issues?: ParsedGitHubIssue[] }
      | Array<{ issues?: ParsedGitHubIssue[] }>;

    console.log('✅ Successfully parsed JSON, structure:', Array.isArray(parsed) ? 'array' : 'object',
      (parsed as { issues?: unknown }).issues ? 'with issues' : '');

    // Handle array format: [{study: "...", issues: [...]}]
    if (Array.isArray(parsed)) {
      const allIssues: ParsedGitHubIssue[] = [];
      for (const item of parsed) {
        if ('issues' in item && Array.isArray(item.issues)) {
          console.log(`Found ${item.issues.length} issues in array item`);
          allIssues.push(...item.issues);
        }
      }
      if (allIssues.length > 0) {
        console.log(`✅ Extracted ${allIssues.length} issues from JSON array format`);
        return allIssues.map(issue => ({
          title: issue.title, body: formatResearchSourceLink(issue.body),
          labels: issue.labels || [], priority: issue.priority, effort: issue.effort,
        }));
      }
      // Direct array of issues
      if (parsed.length > 0 && 'title' in parsed[0]) {
        console.log(`✅ Extracted ${parsed.length} issues from direct array format`);
        return (parsed as ParsedGitHubIssue[]).map(issue => ({
          title: issue.title, body: formatResearchSourceLink(issue.body),
          labels: issue.labels || [], priority: issue.priority, effort: issue.effort,
        }));
      }
    }

    // Handle object format: {study: "...", issues: [...]}
    if (!Array.isArray(parsed) && parsed.issues && Array.isArray(parsed.issues)) {
      console.log(`✅ Extracted ${parsed.issues.length} issues from JSON object format`);
      return parsed.issues.map(issue => ({
        title: issue.title, body: formatResearchSourceLink(issue.body),
        labels: issue.labels || [], priority: issue.priority, effort: issue.effort,
      }));
    }

    console.warn('⚠️ JSON parsed but no issues found in expected format');
  } catch (jsonError: unknown) {
    const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
    console.log('❌ JSON parsing failed, trying markdown format:', message);
    console.log('Content preview:', issuesContent.substring(0, 200));
  }

  // Fallback to old markdown format parser
  const issues: ParsedGitHubIssue[] = [];
  const issueBlocks = issuesContent.split('---').filter(block => block.trim());

  for (const block of issueBlocks) {
    const lines = block.trim().split('\n');
    const issue: Partial<ParsedGitHubIssue> = {};

    for (const line of lines) {
      if (line.startsWith('**TITLE:**')) {
        issue.title = line.replace('**TITLE:**', '').trim();
      } else if (line.startsWith('**PRIORITY:**')) {
        issue.priority = line.replace('**PRIORITY:**', '').trim();
      } else if (line.startsWith('**EFFORT:**')) {
        issue.effort = line.replace('**EFFORT:**', '').trim();
      } else if (line.startsWith('**LABELS:**')) {
        issue.labels = line.replace('**LABELS:**', '').trim().split(',').map(l => l.trim());
      } else if (line.startsWith('**BODY:**')) {
        const bodyStartIndex = lines.indexOf(line);
        issue.body = lines.slice(bodyStartIndex + 1).join('\n').trim();
      }
    }

    if (issue.title && issue.body) {
      issue.body = formatResearchSourceLink(issue.body);
      issues.push(issue as ParsedGitHubIssue);
    }
  }

  return issues;
}

// createGitHubIssues REMOVED (PH-4 / ADR 0036).
// Dead code — never called. Issue creation now goes through ticketHandler
// with idempotent CreatedIssue mapping.

export async function deleteStudyFolderFromGitHub(folderPath: string, repo: string): Promise<DeleteFolderResult> {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER!;

  if (!folderPath) {
    console.warn('⚠️ No folder path provided, skipping GitHub deletion');
    return { deleted: 0, message: 'No folder path provided' };
  }

  const decodedPath = decodeURIComponent(folderPath);
  let deletedCount = 0;
  const errors: Array<{ path: string; error: string }> = [];

  async function getAllFilesInFolder(dirPath: string): Promise<Array<{ path: string; sha: string }>> {
    const files: Array<{ path: string; sha: string }> = [];
    try {
      const { data: items } = await octokit.rest.repos.getContent({
        owner, repo, path: dirPath, ref: 'main',
      });
      const list = (Array.isArray(items) ? items : [items]) as GitHubContentItem[];

      for (const item of list) {
        if (item.type === 'dir') {
          const subFiles = await getAllFilesInFolder(item.path);
          files.push(...subFiles);
        } else if (item.type === 'file') {
          files.push({ path: item.path, sha: item.sha });
        }
      }
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) {
        console.log(`📁 Folder ${dirPath} does not exist in GitHub, skipping`);
        return files;
      }
      throw err;
    }
    return files;
  }

  try {
    const allFiles = await getAllFilesInFolder(decodedPath);
    console.log(`📋 Found ${allFiles.length} files to delete in ${decodedPath}`);

    if (allFiles.length === 0) {
      return { deleted: 0, message: 'No files found to delete' };
    }

    for (const file of allFiles) {
      try {
        await octokit.rest.repos.deleteFile({
          owner, repo, path: file.path,
          message: `chore: delete study folder - ${decodedPath}`,
          sha: file.sha, branch: 'main',
        });
        deletedCount++;
        console.log(`✅ Deleted: ${file.path}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`❌ Error deleting file ${file.path}:`, message);
        errors.push({ path: file.path, error: message });
      }
    }

    return {
      deleted: deletedCount, total: allFiles.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Deleted ${deletedCount} file(s) from ${decodedPath}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Error deleting study folder from GitHub:', error);
    throw new Error(`Failed to delete study folder from GitHub: ${message}`);
  }
}
