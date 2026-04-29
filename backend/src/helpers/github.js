
// src/helpers/github.js
const path = require('path');

/**
 * Returns the repo used for config reads (templates, YAML prompts).
 * Falls back to GITHUB_REPO if GITHUB_CONFIG_REPO is not set.
 */
function getConfigRepo() {
  return process.env.GITHUB_CONFIG_REPO || process.env.GITHUB_REPO;
}

/**
 * Path to YAML prompt templates in the config repo.
 * All fetchFileFromRepo calls for YAML templates should use this constant.
 */
const YAML_TEMPLATE_PATH = 'config/prompts';

function getDestPath(filePath, baseFolder, folder, targetFolder) {
  const parts = filePath.split(path.posix.sep);
  const tmplIdx = parts.indexOf('templates');

  // everything after “templates/”
  const subpath = tmplIdx >= 0
    ? parts.slice(tmplIdx + 1)
    : parts.slice(1);

  // this will build: baseFolder/folder/targetFolder/...subpath
  return path.posix.join(
    baseFolder,
    folder,
    targetFolder,
    ...subpath
  );
}

async function copyFilesToFolder(files, folder, targetFolder, repo, baseFolder) {
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;
  const written = [];
  for (const file of files) {
    // build the full path including baseFolder
    const destPath = getDestPath(file.path, baseFolder, folder, targetFolder);
    console.log('→ writing to:', destPath);

    // base64 encode
    const content = Buffer.from(file.content, 'utf8').toString('base64');

    // try to grab existing SHA
    let sha;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner, repo, path: destPath, ref: 'main',
      });
      sha = data.sha;
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    // prepare params (include sha only if updating)
    const params = {
      owner,
      repo,
      path: destPath,
      message: `chore: add ${destPath}`,
      content,
      branch: 'main',
      ...(sha && { sha }),
    };

    // create or update
    const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);
    console.log(`✅ Wrote ${data.content.path} @ ${data.commit.sha}`);
    written.push(data.content.path);
  }
  const enc = encodeURIComponent;
  const encodedPath = [baseFolder, folder, targetFolder].map(enc).join('/');
  const url = `https://github.com/${owner}/${repo}/tree/main/${encodedPath}`;
  return {
    message: `🎉 All ${written.length} files created/updated successfully`,
    url,
    path: encodedPath
  };
}

async function createOrUpdateFileOnGitHub(
  filePath,
  fileContent,
) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  // Base64-encode the content
  const contentBase64 = Buffer.from(fileContent, "utf8").toString("base64");

  // See if the file already exists to fetch its SHA
  let sha;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: 'main',
    });
    sha = data.sha;
  } catch (err) {
    if (err.status !== 404) throw err;  // real error
    // 404 means "no existing file" → we'll create it
  }

  // Prepare params, including sha only if updating
  const params = {
    owner,
    repo,
    path: filePath,
    message: `chore: add ${filePath}`,
    content: contentBase64,
    branch: 'main',
    ...(sha && { sha }),
  };

  // Create or update the file
  const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);

  return {
    path: data.content.path,
    sha: data.content.sha,
    url: `https://github.com/${owner}/${repo}/tree/main/${filePath}`,
  };
}

async function readFolderContents(folderPath, repo) {
  console.log("🚀 ~ readFolderContents ~ folderPath:", folderPath, repo)

  const { Octokit } = await import("@octokit/rest");

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  // const repo  = process.env.GITHUB_REPO;
  const owner = process.env.GITHUB_OWNER;

  // 1️⃣ List everything in the folder
  const { data: items } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: folderPath,
  });

  // If it's not an array, the path pointed at a single file—normalize to array
  const list = Array.isArray(items) ? items : [items];
  // console.log("🚀 ~ readFolderContents ~ list:", list)

  const results = [];

  for (const item of list) {
    // if (item.type !== "file") continue;

    // 2️⃣ Fetch each file’s contents
    // const { data: fileData } = await octokit.rest.repos.getContent({
    //   owner,
    //   repo,
    //   path: item.path,
    // });
    // console.log("🚀 ~ readFolderContents ~ fileData:", fileData)

    // 3️⃣ Decode from base64
    // const decoded = Buffer.from(fileData.content, "base64").toString("utf8");

    results.push({
      name: item.name,
      path: item.path,
      // content: decoded,
    });
  }
  // console.log(results)
  return results;
}

async function readFolders(folderPath, repo) {
  console.log("🚀 ~ readFolders ~ folderPath:", folderPath)
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;

  // 1️⃣ List everything in the folder
  const { data: items } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: folderPath,
  });

  const list = Array.isArray(items) ? items : [items];
  const results = [];

  for (const item of list) {
    if (item.type === "dir") {
      // 2️⃣ Recurse into sub-folders
      const nested = await readFolders(item.path, repo);
      results.push(...nested);
    }
    else if (item.type === "file") {
      // 3️⃣ Fetch the file’s raw content
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: item.path,
      });
      const ext = path.extname(item.name).slice(1);

      // 4️⃣ Decode from Base64
      const content = Buffer.from(fileData.content, "base64").toString("utf8");

      results.push({
        sha: item.sha,
        name: item.name,
        path: item.path,
        content,
        ext              // now includes the file’s text
      });
    }
    // you can also handle symlink / submodule types if needed
  }

  return results;
}


async function fetchFileFromRepo(repo, folderPath, fileName) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;

  // build the full path
  const filePath = folderPath
    ? `${folderPath.replace(/\/$/, "")}/${fileName}`
    : fileName;

  try {
    // fetch the file
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    // fileData.content is base64 when type === "file"
    const content = Buffer.from(fileData.content, "base64").toString("utf8");

    // console.log(`🚀 ~ fetched ${filePath}:`, { name: fileName, path: filePath, content });
    return { name: fileName, path: filePath, content };
  } catch (err) {
    console.error(`Error fetching ${filePath} from ${owner}/${repo}:`, err);
    throw new Error(`Could not fetch file ${filePath}`);
  }
}

async function fetchFileFromRepoByPath(repo, folderPath) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;

  // build the full path
  const filePath = folderPath
    ? `${folderPath.replace(/\/$/, "")}`
    : "";

  try {
    // fetch the file
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    // fileData.content is base64 when type === "file"
    const content = Buffer.from(fileData.content, "base64").toString("utf8");

    console.log(`🚀 ~ fetched ${filePath}:`, { path: filePath, content });
    return { path: filePath, content };
  } catch (err) {
    console.error(`Error fetching ${filePath} from ${owner}/${repo}:`, err);
    throw new Error(`Could not fetch file ${filePath}`);
  }
}

async function listAllTopLevelFolders(repo) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const { data: items } = await octokit.rest.repos.getContent({
    owner: process.env.GITHUB_OWNER,
    repo,
    path: "", // root
  });
  // console.log("🚀 ~ listAllTopLevelFolders ~ items:", items)
  return items.filter(item => item.type === "dir");
}

async function listOrgRepos() {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER; // your org name

  // paginate through *all* pages of results
  const repos = await octokit.paginate(
    octokit.rest.repos.listForAuthenticatedUser,
    {
      visibility: "all",
      affiliation: "owner,collaborator,organization_member",
      per_page: 100,
    }
  );

  // console.log("Allowed repos:", repos.map(r => r.full_name));
  return repos;
}


// Function to parse GitHub issues from AI-generated content
/**
 * Formats the Research Source section in issue body to ensure the link is properly formatted
 * Replaces formats like "📊 [Full Research Readout](url)" with clean markdown link format
 * @param {string} body - The issue body text
 * @returns {string} - Formatted body with clean link format
 */
function formatResearchSourceLink(body) {
  if (!body) return body;
  
  // Check if body contains Research Source section
  if (!body.includes('Research Source') || !body.includes('Full Research Readout')) {
    return body; // No Research Source section, return as-is
  }
  
  // Simple and robust pattern: find the Research Source section and clean up the link
  // This handles: "## Research Source\n\n📊 [Full Research Readout](url)" or any variation
  const pattern = /(##\s*Research\s*Source[^\n]*\n\s*\n?)([^\n]*?)(📊\s*)?\[Full\s*Research\s*Readout\]\(([^)]+)\)/gi;
  
  const originalBody = body;
  const formatted = body.replace(pattern, (match, heading, beforeLink, emoji, url) => {
    // Extract the URL (should be in capture group 4)
    if (!url) {
      // Fallback: try to extract URL from the full match
      const urlMatch = match.match(/\[Full\s*Research\s*Readout\]\(([^)]+)\)/);
      if (urlMatch && urlMatch[1]) {
        url = urlMatch[1];
      } else {
        // Can't extract URL, return original
        console.warn('⚠️ Could not extract URL from Research Source link:', match);
        return match;
      }
    }
    
    // Clean heading and ensure proper format
    const cleanHeading = heading.trim();
    // Return clean format: heading + blank line + link (no emoji, no extra text)
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

function parseGitHubIssues(issuesContent) {
  try {
    // Try to parse as JSON first (new format)
    const trimmedContent = issuesContent.trim();
    
    // Remove markdown code fences if present
    let jsonContent = trimmedContent;
    if (trimmedContent.startsWith('```json')) {
      jsonContent = trimmedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (trimmedContent.startsWith('```')) {
      jsonContent = trimmedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Try parsing as JSON
    const parsed = JSON.parse(jsonContent);
    console.log('✅ Successfully parsed JSON, structure:', Array.isArray(parsed) ? 'array' : 'object', parsed.issues ? 'with issues' : '');
    
    // Handle array format: [{study: "...", issues: [...]}]
    if (Array.isArray(parsed)) {
      const allIssues = [];
      for (const item of parsed) {
        if (item.issues && Array.isArray(item.issues)) {
          console.log(`Found ${item.issues.length} issues in array item`);
          allIssues.push(...item.issues);
        }
      }
      
      if (allIssues.length > 0) {
        console.log(`✅ Extracted ${allIssues.length} issues from JSON array format`);
        // Convert to expected format
        return allIssues.map(issue => ({
          title: issue.title,
          body: formatResearchSourceLink(issue.body),
          labels: issue.labels || [],
          priority: issue.priority,
          effort: issue.effort
        }));
      }
    }
    
    // Handle object format: {study: "...", issues: [...]}
    if (parsed.issues && Array.isArray(parsed.issues)) {
      console.log(`✅ Extracted ${parsed.issues.length} issues from JSON object format`);
      return parsed.issues.map(issue => ({
        title: issue.title,
        body: formatResearchSourceLink(issue.body),
        labels: issue.labels || [],
        priority: issue.priority,
        effort: issue.effort
      }));
    }
    
    // If it's already an array of issues
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) {
      console.log(`✅ Extracted ${parsed.length} issues from direct array format`);
      return parsed.map(issue => ({
        title: issue.title,
        body: formatResearchSourceLink(issue.body),
        labels: issue.labels || [],
        priority: issue.priority,
        effort: issue.effort
      }));
    }
    
    console.warn('⚠️ JSON parsed but no issues found in expected format');
    
  } catch (jsonError) {
    // If JSON parsing fails, fall back to old markdown format
    console.log('❌ JSON parsing failed, trying markdown format:', jsonError.message);
    console.log('Content preview:', issuesContent.substring(0, 200));
  }
  
  // Fallback to old markdown format parser
  const issues = [];
  const issueBlocks = issuesContent.split('---').filter(block => block.trim());

  for (const block of issueBlocks) {
    const lines = block.trim().split('\n');
    const issue = {};

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
        // Everything after **BODY:** is the issue body
        const bodyStartIndex = lines.indexOf(line);
        issue.body = lines.slice(bodyStartIndex + 1).join('\n').trim();
      }
    }

    if (issue.title && issue.body) {
      // Format the Research Source link in the body
      issue.body = formatResearchSourceLink(issue.body);
      issues.push(issue);
    }
  }

  return issues;
}

// Function to create GitHub issues
async function createGitHubIssues(issues) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  const createdIssues = [];

  for (const issue of issues) {
    try {
      // Create the issue
      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels || []
      });

      createdIssues.push({
        number: data.number,
        title: data.title,
        url: data.html_url,
        priority: issue.priority,
        effort: issue.effort
      });

      console.log(`✅ Created issue #${data.number}: ${data.title}`);
    } catch (error) {
      console.error(`❌ Failed to create issue "${issue.title}":`, error.message);
    }
  }

  return createdIssues;
}

/**
 * Recursively delete a folder and all its contents from GitHub
 * @param {string} folderPath - The path to the folder to delete
 * @param {string} repo - The repository name
 * @returns {Promise<Object>} Result object with deleted count
 */
async function deleteStudyFolderFromGitHub(folderPath, repo) {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;

  if (!folderPath) {
    console.warn('⚠️ No folder path provided, skipping GitHub deletion');
    return { deleted: 0, message: 'No folder path provided' };
  }

  // Decode the path if it's URL encoded
  const decodedPath = decodeURIComponent(folderPath);
  
  let deletedCount = 0;
  const errors = [];

  /**
   * Recursively get all files in a directory
   */
  async function getAllFilesInFolder(path) {
    const files = [];
    try {
      const { data: items } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: path,
        ref: 'main',
      });

      const list = Array.isArray(items) ? items : [items];

      for (const item of list) {
        if (item.type === 'dir') {
          // Recursively get files from subdirectories
          const subFiles = await getAllFilesInFolder(item.path);
          files.push(...subFiles);
        } else if (item.type === 'file') {
          files.push({
            path: item.path,
            sha: item.sha,
          });
        }
      }
    } catch (err) {
      if (err.status === 404) {
        console.log(`📁 Folder ${path} does not exist in GitHub, skipping`);
        return files;
      }
      throw err;
    }

    return files;
  }

  try {
    // Get all files in the folder recursively
    const allFiles = await getAllFilesInFolder(decodedPath);
    console.log(`📋 Found ${allFiles.length} files to delete in ${decodedPath}`);

    if (allFiles.length === 0) {
      return { deleted: 0, message: 'No files found to delete' };
    }

    // Delete all files
    for (const file of allFiles) {
      try {
        await octokit.rest.repos.deleteFile({
          owner,
          repo,
          path: file.path,
          message: `chore: delete study folder - ${decodedPath}`,
          sha: file.sha,
          branch: 'main',
        });
        deletedCount++;
        console.log(`✅ Deleted: ${file.path}`);
      } catch (err) {
        console.error(`❌ Error deleting file ${file.path}:`, err.message);
        errors.push({ path: file.path, error: err.message });
      }
    }

    return {
      deleted: deletedCount,
      total: allFiles.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Deleted ${deletedCount} file(s) from ${decodedPath}`
    };
  } catch (error) {
    console.error('❌ Error deleting study folder from GitHub:', error);
    throw new Error(`Failed to delete study folder from GitHub: ${error.message}`);
  }
}

module.exports = {
  getConfigRepo,
  YAML_TEMPLATE_PATH,
  copyFilesToFolder,
  readFolderContents,
  listAllTopLevelFolders,
  listOrgRepos,
  fetchFileFromRepo,
  readFolders,
  createOrUpdateFileOnGitHub,
  fetchFileFromRepoByPath,
  parseGitHubIssues,
  createGitHubIssues,
  deleteStudyFolderFromGitHub
};
