const childProcess = require('child_process');

const branchName = 'i18n';
const remoteOrigin = 'weblate';
const remoteBranch = `${remoteOrigin}/${branchName}`;

/**
 * Executes a shell command and returns trimmed stdout string
 *
 * @param {string} command - Shell command to execute
 * @returns {string} Standard output
 */
function runCommand(command) {
  return childProcess.execSync(command, { encoding: 'utf8' }).trim();
}

/**
 * Safely resolves a git reference (returns null if ref does not exist)
 *
 * @param {string} ref - Git reference
 * @returns {string|null} Commit hash or null
 */
function safeRevParse(ref) {
  try {
    return runCommand(`git rev-parse --verify "${ref}"`);
  } catch {
    return null;
  }
}

// main script
try {
  const isCI = process.env.CI === 'true';

  console.log(`Fetching latest changes from ${remoteOrigin}...`);
  runCommand(`git fetch -- "${remoteOrigin}"`);

  const remoteHash = safeRevParse(remoteBranch);

  if (!remoteHash) {
    console.error(`[ERROR] Remote reference ${remoteBranch} could not be resolved.`);
    process.exit(1);
  }

  let localHash = null;

  if (isCI) {
    // In CI environment: compare origin/i18n directly
    console.log(`[INFO] Running in CI: fetching origin/${branchName}...`);
    runCommand(`git fetch -- origin ${branchName}`);
    localHash = safeRevParse(`origin/${branchName}`);
  } else {
    // In local environment: prefer local branch 'i18n'
    localHash = safeRevParse(branchName);
  }

  if (!localHash) {
    console.error(`[ERROR] Could not resolve local reference for '${branchName}'.`);
    process.exit(1);
  }

  if (localHash !== remoteHash) {
    console.error(`[ERROR] ${remoteOrigin} origin is not synchronized.`);
    console.error(` Local reference : ${localHash}`);
    console.error(` Remote reference: ${remoteHash}`);
    process.exit(1);
  } else {
    console.log(`[OK] Branch ${branchName} is up to date with ${remoteBranch}.`);
    process.exit(0);
  }

} catch (error) {
  console.error(`[ERROR] Failed to verify branch synchronization: ${error.message}`);
  process.exit(1);
}
