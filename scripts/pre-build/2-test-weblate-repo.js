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

// main script
try {
  console.log(`Fetching latest changes from ${remoteBranch}...`);
  runCommand(`git fetch -- "${remoteOrigin}"`);

  // Get commit hashes for local and remote branches
  const localHash = runCommand(`git rev-parse ${branchName}`);
  const remoteHash = runCommand(`git rev-parse ${remoteBranch}`);

  if (localHash !== remoteHash) {
    console.error(`[ERROR] ${remoteOrigin} origin is not synchronized, please check it.`);
    process.exit(1);
  }
  else {
    // all OK
    console.log(`[OK] Branch ${branchName} is up to date with ${remoteBranch}.`);
    process.exit(0);
  }

} catch (error) {
  console.error(`[ERROR] Failed to verify branch synchronization: ${error.message}`);
  process.exit(1);
}
