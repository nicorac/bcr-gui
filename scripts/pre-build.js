// run sequentially all the scripts in the pre-build directory
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

// Target directory containing pre-build scripts
const targetDir = path.join(process.cwd(), 'scripts', 'pre-build');

// Verify directory existence
if (!fs.existsSync(targetDir)) {
  console.error(`Directory not found: ${targetDir}`);
  process.exit(1);
}

// Read all JavaScript files from the target directory
const scripts = fs
  .readdirSync(targetDir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => path.join('scripts', 'pre-build', file))
  .sort();

if (scripts.length === 0) {
  console.log('No JavaScript files found in pre-build/');
  process.exit(0);
}

// Execute each script sequentially
for (const script of scripts) {
  console.log(`=== Executing ${script} ===`);

  const result = childProcess.spawnSync('node', [script], { stdio: 'inherit' });

  if (result.status !== 0) {
    console.error(`Script ${script} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }

  console.log();
}

console.log('All pre-build scripts executed successfully.');
