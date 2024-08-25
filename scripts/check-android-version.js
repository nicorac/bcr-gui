/**
 * Create a bunch of test  files
 */
const fs = require('fs');
const process = require('process');
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