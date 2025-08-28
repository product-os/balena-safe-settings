const env = require('./env')
const { getInstallations } = require('./installationCache')

/**
 * Sync changed safe-settings organization files from the master admin PR
 * into the target organization's admin repository.
 * @param {import('probot').Probot} robot
 * @param {import('probot').Context} context
 * @param {string} orgName Destination organization login (also folder name under organizations/)
 * @param {string} destRepo Destination repo name inside orgName (e.g. admin repo)
 * @param {string} destinationFolder Base folder in destination repo where content lives (e.g. .github or .github/safe-settings)
 */
async function syncSafeSettingConfig(robot, context, orgName, destRepo, destinationFolder) {
  try {
    robot.log.info(`Syncing safe settings for organization: ${orgName}`);

    robot.log.info(`Organization: ${orgName}, Destination Repo: ${destRepo}, Destination Folder: ${destinationFolder}`);
    const pr = context.payload.pull_request;
    if (!pr) {
      robot.log.warn('No pull_request payload found; aborting sync');
      return;
    }
    const { owner: srcOwner, repo: srcRepo } = context.repo();
    const pull_number = pr.number;

    // Source base path where org folders live inside master admin repo

    // 'safe-settings' is the standard sub-folder path
    const configRoot = env.CONFIG_PATH || '.github/';
    const sourceBase = (`${configRoot}/${env.SAFE_SETTINGS_HUB_PATH}/organizations`).replace(/\/$/, '');
    robot.log.info(`DEBUG: sourceBase='${sourceBase}'`);

    // Debug info: log env and computed paths
    robot.log.info(`DEBUG: env.CONFIG_PATH='${env.CONFIG_PATH}', env.SAFE_SETTINGS_HUB_PATH='${env.SAFE_SETTINGS_HUB_PATH}'`);

    // List changed files in PR
    const files = await context.octokit.paginate(
      context.octokit.rest.pulls.listFiles,
      { owner: srcOwner, repo: srcRepo, pull_number, per_page: 100 }
    );

    robot.log.info(`DEBUG: PR #${pull_number} contains ${files.length} changed file(s)`);
    if (files.length) robot.log.info(`DEBUG: files=${files.map(f => f.filename).join(', ')}`);

    // Dump file objects for debugging filename issues
    if (files.length) {
      try {
        robot.log.info(`DEBUG: first file object = ${JSON.stringify(files[0], null, 2)}`);
        robot.log.info(`DEBUG: file[0] keys = ${Object.keys(files[0] || {}).join(', ')}`);
      } catch (e) {
        robot.log.info(`DEBUG: failed to stringify first file: ${e.message}`);
      }
      files.forEach((f, i) => {
        try {
          robot.log.info(`DEBUG: FILE[${i}] raw=${JSON.stringify(f)}`);
          robot.log.info(`DEBUG: FILE[${i}] filename=${JSON.stringify(f.filename)} length=${(f.filename || '').length}`);
        } catch (e) {
          robot.log.info(`DEBUG: FILE[${i}] stringify error: ${e.message}`);
        }
      });
    }

    const orgPrefix = `${sourceBase}/${orgName}/`;
    robot.log.info(`DEBUG: files=${files.map(f => f.filename).join(', ')}`);
    robot.log.info(`DEBUG: Path ${sourceBase}/${orgName}`);
    const relevant = files.filter(f => f.filename === `${sourceBase}/${orgName}` || f.filename.startsWith(orgPrefix));
    robot.log.info(`DEBUG: Found ${relevant.length} changed file(s) relevant to org ${orgName}`);
    if (!relevant.length) {
      robot.log.info(`No files for org ${orgName} in PR #${pull_number}`);
      // Detailed per-file checks to help debug matching
      files.forEach(f => {
        const exact = f.filename === `${sourceBase}/${orgName}`;
        const pref = f.filename.startsWith(orgPrefix);
        robot.log.info(`MATCH CHECK: file='${f.filename}' exact=${exact} prefix=${pref}`);
      });
      // Also show alternate check using CONFIG_PATH + '/organizations'
      const altBase = `${(env.CONFIG_PATH || '.github').replace(/\/$/, '')}/organizations`;
      const altPrefix = `${altBase}/${orgName}/`;
      files.forEach(f => {
        const exactAlt = f.filename === `${altBase}/${orgName}`;
        const prefAlt = f.filename.startsWith(altPrefix);
        robot.log.info(`ALT CHECK: file='${f.filename}' exactAlt=${exactAlt} prefAlt=${prefAlt}`);
      });
      return;
    }

    // Destination info
    const destOwner = orgName;
    // ensure destBase uses the configured CONFIG_PATH (fallback to '.github') and normalize trailing slash
    const destBase = (destinationFolder || env.CONFIG_PATH || '.github').replace(/\/$/, '');
    const destBaseBranch = 'main';
    const directPush = (env.SAFE_SETTINGS_HUB_DIRECT_PUSH === 'true' || env.SAFE_SETTINGS_HUB_DIRECT_PUSH === '1');

    // Find installation for destination org to auth
  const installs = await getInstallations(robot)
    const install = installs.find(i => i.account && i.account.type === 'Organization' && i.account.login.toLowerCase() === destOwner.toLowerCase());
    if (!install) {
      robot.log.warn(`Installation for destination org ${destOwner} not found; cannot sync`);
      return;
    }
    const githubDest = await robot.auth(install.id);

    robot.log.info(`Syncing from ${srcOwner}/${srcRepo} PR #${pull_number} to ${destOwner}/${destRepo}@${destBaseBranch} under ${destBase} (directPush=${directPush})`);

    // Create branch if not direct push
    const timestamp = Date.now();
    const branchName = directPush ? destBaseBranch : `safe-settings-sync/pr-${pull_number}-${orgName}-${timestamp}`;
    if (!directPush) {
      try {
        const baseRef = await githubDest.rest.git.getRef({ owner: destOwner, repo: destRepo, ref: `heads/${destBaseBranch}` });
        const baseSha = baseRef.data.object.sha;
        await githubDest.rest.git.createRef({ owner: destOwner, repo: destRepo, ref: `refs/heads/${branchName}`, sha: baseSha });
        robot.log.info(`Created branch ${branchName} in ${destOwner}/${destRepo}`);
      } catch (err) {
        if (err.status === 422) {
          robot.log.warn(`Branch ${branchName} already exists, continuing`);
        } else {
          throw err;
        }
      }
    }

    for (const f of relevant) {
      let relative;
      if (f.filename === `${sourceBase}/${orgName}`) {
        // top directory marker encountered (unlikely in changed files list) - skip
        continue;
      } else {
        relative = f.filename.slice(orgPrefix.length);
      }
      // place only the changed file under the configured CONFIG_PATH (e.g. '.github/<file>')
      const destPath = `${destBase}/${relative}`.replace(/\/+/g, '/');
      try {
        const srcContentResp = await context.octokit.rest.repos.getContent({ owner: srcOwner, repo: srcRepo, path: f.filename, ref: pr.head.sha });
        const data = srcContentResp.data;
        if (Array.isArray(data)) {
          // Skip directories; individual files will appear separately in changed files list
          continue;
        }
        const fileContent = Buffer.from(data.content, data.encoding).toString('utf8');
        const encoded = Buffer.from(fileContent, 'utf8').toString('base64');

        // Check existing file for sha
        let existingSha = undefined;
        try {
          const destGet = await githubDest.rest.repos.getContent({ owner: destOwner, repo: destRepo, path: destPath, ref: destBaseBranch });
          if (!Array.isArray(destGet.data)) existingSha = destGet.data.sha;
        } catch (getErr) {
          if (getErr.status !== 404) throw getErr; // ignore missing
        }

        await githubDest.rest.repos.createOrUpdateFileContents({
          owner: destOwner,
          repo: destRepo,
            path: destPath,
          message: directPush ? `Direct sync safe-settings from ${srcOwner}/${srcRepo} PR #${pull_number}` : `Sync safe-settings from ${srcOwner}/${srcRepo} PR #${pull_number}`,
          content: encoded,
          branch: branchName,
          sha: existingSha,
          committer: { name: 'Safe Settings Bot', email: 'safe-settings-bot@example.com' },
          author: { name: 'Safe Settings Bot', email: 'safe-settings-bot@example.com' }
        });
        robot.log.info(`Committed ${destPath} to ${destOwner}/${destRepo}@${branchName}`);
      } catch (fileErr) {
        robot.log.error(`Failed to sync file ${f.filename}: ${fileErr.message}`);
        throw fileErr;
      }
    }

    if (!directPush) {
      try {
        const prTitle = `Sync safe-settings from ${srcOwner}/${srcRepo} PR #${pull_number}`;
        const prBody = `Automated sync of safe-settings for ${orgName} from ${srcOwner}/${srcRepo} PR #${pull_number}.`;
        const created = await githubDest.rest.pulls.create({ owner: destOwner, repo: destRepo, title: prTitle, head: branchName, base: destBaseBranch, body: prBody });
        robot.log.info(`Created PR ${created.data.html_url} in ${destOwner}/${destRepo}`);
      } catch (prErr) {
        robot.log.error(`Failed to create PR in ${destOwner}/${destRepo}: ${prErr.message}`);
        throw prErr;
      }
    } else {
      robot.log.info(`Changes pushed directly to ${destOwner}/${destRepo}@${destBaseBranch}`);
    }
  } catch (err) {
    robot.log.error(`syncSafeSettingConfig error for org ${orgName}: ${err.message}`);
  }
}

/**
 * Handle closed pull requests to sync safe-settings changes to target organizations.
 * Focus on the organization and repository specified in the pull request and if they belong to the Safe-Settings Hub.
 * @param {import('probot').Probot} robot
 * @param {import('probot').Context} context
 */
async function hubSyncHandler(robot, context) {
  const { payload } = context;
  const { repository, pull_request } = payload || {};
  robot.log.info(`Received 'pull_request.closed' event: ${pull_request && pull_request.number}`);
  try {
    // Ensure the event is from the configured Safe-Settings Hub repo/org
    const isMasterRepo = repository && repository.name === env.SAFE_SETTINGS_HUB_REPO;
    const isMasterOrg = repository && repository.owner && repository.owner.login === env.SAFE_SETTINGS_HUB_ORG;

    if (!(isMasterRepo && isMasterOrg)) {
      robot.log.info(`Pull request.closed is not from master admin repo/org (${env.SAFE_SETTINGS_HUB_ORG}/${env.SAFE_SETTINGS_HUB_REPO}), ignoring`);
      return;
    }

    robot.log.info(`Pull request closed on Safe-Settings Hub: (${repository.full_name})`);

    // Get the PR details
    const pr = pull_request;
    const { owner, repo } = context.repo();
    const pull_number = pr.number;
    const baseSettingsPath = `${(env.CONFIG_PATH || '.github').replace(/\/$/, '')}/${env.SAFE_SETTINGS_HUB_PATH}/organizations`;

    // Paginate through all files changed in the PR
    const files = await context.octokit.paginate(
      context.octokit.rest.pulls.listFiles,
      { owner, repo, pull_number, per_page: 100 }
    );

    robot.log.info(`Files changed in PR #${pull_number}: ${files.map(f => f.filename).join(', ')}`);

    // Normalize baseSettingsPath (remove trailing slash if any)
    const normalizedBase = baseSettingsPath.replace(/\/$/, '');
    robot.log.debug(`Normalized base path: ${normalizedBase}`);

    // Escape string for use in RegExp
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build a RegExp that captures the first path segment after the base path
    const basePattern = new RegExp(`^${escapeRegex(normalizedBase)}/([^/]+)(?:/|$)`);
    robot.log.debug(`Base pattern for org matching: ${basePattern}`);

    // Collect unique org names
    const orgNamesSet = new Set();
    files.forEach(f => {
      const m = f.filename.match(basePattern);
      if (m && m[1]) {
        orgNamesSet.add(m[1]);
      }
    });

    const orgNames = Array.from(orgNamesSet); // e.g. ['jester-lab', 'jefeish']
    robot.log.info(`Orgs updated in PR #${pull_number}: ${orgNames.join(', ')}`);

    // Iterate over each updated org and sync settings
    for (const orgName of orgNames) {
      const destRepo = env.ADMIN_REPO;
      const destinationFolder = env.CONFIG_PATH || '.github';
      await syncSafeSettingConfig(robot, context, orgName, destRepo, destinationFolder);
    }
  } catch (err) {
    robot.log.error(`Failed to sync safe settings: ${err && err.message ? err.message : err}`);
  }
}

module.exports = { hubSyncHandler };