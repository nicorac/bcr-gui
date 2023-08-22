/**
 * Create a bunch of test  files
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const basePath = path.dirname(__filename);
const demoAudioFilename = 'create-test-files.m4a';
const outDir = basePath + '/out';

// readline sync
function readLineAsync(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve, reject) => {
    rl.question(message, (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * The value is no lower than min (or the next integer greater than min
 * if min isn't an integer) and no greater than max (or the next integer
 * lower than max if max isn't an integer).
 * Using Math.round() will give you a non-uniform distribution!
 */
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * get a random person name
 */
function getRandomName() {

  const names = ['Adrian', 'Alexandra', 'Amanda', 'Blake', 'Bobby', 'Brooke', 'Cameron', 'Camille', 'Carlos', 'Celine', 'Cleo', 'Danny', 'David', 'Denise',
    'Elaine', 'Ellison', 'Emilio', 'Evelyn', 'Francisco', 'Grace', 'Gwen', 'Hailey', 'Harrison', 'Heidi', 'Iris', 'Isabel', 'Jack', 'Jason', 'John',
    'Kassidy', 'Keira', 'Laura', 'Leonard', 'Louis', 'Malcolm', 'Marianna', 'Matteo', 'Mitchell', 'Naomi', 'Nelson', 'Olivia', 'Orlando', 'Patrick',
    'Paula', 'Raymond', 'Regina', 'Rodrigo', 'Rosa', 'Scarlet', 'Simon', 'Stephen', 'Terry', 'Tessa', 'Tommy', 'Valery', 'Vincent', 'Walter', 'Zachary'];

  const surnames = [ 'Adams', 'Andersen', 'Baker', 'Baldwin', 'Becker', 'Blackwell', 'Cabrera', 'Callahan', 'Coleman', 'Cooper', 'Dalton', 'Davis', 'Diaz',
    'Dixon', 'Edwards', 'Farrell', 'Fleming', 'Ford', 'Gallagher', 'Garrison', 'Gibbs', 'Gilmore', 'Goodman', 'Hamilton', 'Hoffman', 'Houston',
    'Ibarra', 'Jackson', 'Jefferson', 'Keller', 'Knight', 'Larsen', 'Lopez', 'Mann', 'McCall', 'McDowell', 'Nava', 'Nicholson', 'Nielsen',
    'Ortega', 'Patterson', 'Reeves', 'Robinson', 'Sanford', 'Sullivan', 'Vega', 'Ventura', 'Weaver', 'Winters', 'Woods', 'Zimmerman' ];

  return names[getRandomInt(0, names.length-1)] + ' ' + surnames[getRandomInt(0, surnames.length-1)];

}

// main function
(async () => {

  var count = await readLineAsync('How many files must be generated? ');
  console.log(`Generating ${count} files...`);

  // create dir (if needed)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  // create files
  let time = new Date().getTime();
  for (let i = 1; i <= count; i++) {
    const baseName = `test_file_${i.toString().padStart(4, '0')}`;

    // audio file
    fs.copyFileSync(`${basePath}/${demoAudioFilename}`, `${outDir}/${baseName}.m4a`);

    // metadata file
    const randomPhoneNumber = "+39 123 " + getRandomInt(0, 9999999).toString().padStart(7, '0');
    const randomName = getRandomName();
    const db = {
      timestamp_unix_ms: time,
      direction: Math.random() >= .5 ? 'out' : 'in',
      sim_slot: null,
      call_log_name: randomName,
      calls: [
        {
          phone_number: randomPhoneNumber,
          phone_number_formatted: randomPhoneNumber,
          caller_name: randomName,
          contact_name: randomName,
        }
      ],
      output: {
        format: {
            type: "M4A\/AAC",
            mime_type_container: "audio\/mp4",
        },
        recording: {
          channel_count: 1,
          duration_secs_total: 3,
          duration_secs_encoded: 3,
        }
      }
    };
    fs.writeFileSync(`${outDir}/${baseName}.json`, JSON.stringify(db, null, 3));

    // change time for next file (subtract 15min...10hours)
    time -= getRandomInt(15 * 60000, 600 * 60000);

  }

})();