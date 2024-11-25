/**
 * Run npm build
 */
const process = require('process');
const { spawn } = require('child_process');
const isWindows = process.platform === 'win32';

// Android commandline
let androidCmdLine = (isWindows ? 'gradlew.bat' : './gradlew');

// main
(async () => {

  // Android build
  process.chdir('./android');
  try {
    await runCommand(androidCmdLine, [ 'assembleRelease' ]);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  finally {
    process.chdir('..');
  }

})();


// Function to run a command and wait for completion
function runCommand(command, args) {
  return new Promise((resolve, reject) => {

    const childProcess = spawn(command, args, { shell: isWindows });

    // Output stdout in real-time
    childProcess.stdout.on('data', (data) => console.log(data.toString('utf8')));

    // Output stderr in real-time
    childProcess.stderr.on('data', (data) => console.error(data.toString('utf8')));

    // Handle process close event
    childProcess.on('close', (code) => resolve(code));

    // Handle errors
    childProcess.on('error', (error) => reject(error));

  });
}