/**
 * Check repository status before building Android app.
 */
const fs = require('fs');
const process = require('process');
const simpleGit = require('simple-git');

// ========== test version file ===========
const versionFile = 'android/app/build.gradle';

// read build file content
const content = fs.readFileSync(versionFile).toString();

// extract versions
const versionName = /^\s+versionName\s+"(?<ver>.*?)"$/gm.exec(content)?.groups['ver'];
console.log('Found versionName:', versionName);
const versionCode = /^\s+versionCode\s+(?<ver>.*?)$/gm.exec(content)?.groups['ver'];
console.log('Found versionCode:', versionCode);

// build expected versionCode
const expectedVersionCode = versionName.split('.').map((p, ix) => p.padStart(ix === 0 ? 0 : 3, '0')).join('');

// test
if (versionCode !== expectedVersionCode) {
  console.log('Expected version code:', expectedVersionCode);
  console.error('[ERROR] Please fix "versionCode" in file:', versionFile);
  process.exit(1);
}

// ========== test weblate repo update ===========
const git = simpleGit({
  baseDir: './' // Path relative to your main project root
});

async function checkExternalRepo() {
  try {
    console.log('Fetching external repository updates...');
    await git.fetch('weblate');

    const status = await git.status();

    // Check if the current branch is behind its remote tracking branch
    if (status.behind > 0) {
      console.warn(`WARNING: External repository is behind by ${status.behind} commit(s). Updating...`);
      await git.pull();
      console.log('External repository successfully updated.');
    } else {
      console.log('External repository is up to date.');
    }
  } catch (error) {
    console.error('Pre-build check failed:', error.message);
    process.exit(1); // Stop the build process on failure
  }
}

checkExternalRepo();
