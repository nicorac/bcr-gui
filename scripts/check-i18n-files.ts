/**
 * Update & synchronize language files
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Culture, CultureContent, I18nKey } from 'src/app/services/i18n.service';

// constants
const basePath = path.resolve(path.dirname(__filename) + '/..');
const langDir = basePath + '/src/assets/i18n';
const configFile = '_cultures.json';

// fields
let cultureIDs: string[];
let srcCultureID: string;
let srcCultureContent: CultureContent;
let srcCultureKeyCount: number;
let contents: { [key:string]: CultureContent };
let results: { [key:string]: CheckResult };

// readline sync
async function readLineAsync(message: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise<string>((resolve, reject) => {
    rl.question(message, (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}

/**
 * Results class
 */
class CheckResult {
  missing: I18nKey[] = [];
  extra: I18nKey[] = [];
  untranslated: I18nKey[] = [];
}

/**
 * Load content of a culture
 */
function loadCultureContent(cultureId: string): CultureContent {
  return JSON.parse(fs.readFileSync(`${langDir}/${cultureId}.json`).toString());
}

/**
 * Save content of a culture sorting its keys
 */
function saveCultureContent(cultureId: string, content: CultureContent) {
  fs.writeFileSync(`${langDir}/${cultureId}.json`, JSON.stringify(content, Object.keys(content).sort(), 2));
}

/**
 * Check culture content (using srcCulture as reference)
 */
function checkCultureContent(cid: string): CheckResult {

  const res = new CheckResult();
  const cultureContent = contents[cid];

  // missing keys
  res.missing = Object.keys(srcCultureContent).filter(k => cultureContent[<I18nKey>k] === undefined) as I18nKey[];

  // extra keys
  res.extra = Object.keys(cultureContent).filter(k => srcCultureContent[<I18nKey>k] === undefined) as I18nKey[];

  // untranslated keys
  res.untranslated = Object.keys(srcCultureContent).filter(k => cultureContent[<I18nKey>k] !== undefined && cultureContent[<I18nKey>k].trim().length === 0) as I18nKey[];

  return res;
}

/**
 * Fix culture files
 */
function fixFiles() {
  Object.entries(results).forEach(([cid, res]) => {
    if (res.missing.length) {
      console.log(`Fixing culture ${cid}`);
      const content = contents[cid];
      // add missing keys
      res.missing.forEach(k => content[<I18nKey>k] = '');
      // save lang file
      saveCultureContent(cid, content);
    }
  });
}

// main function
async function main() {

  console.log(`Reading config file ${configFile}...`);

  // load defined cultures (except for srcCulture, that will be "shifted" below)
  cultureIDs = (<Culture[]>JSON.parse(fs.readFileSync(`${langDir}/${configFile}`).toString())).map(c => c.id);
  if (!cultureIDs.length) {
    console.error('No cultures defined!');
    process.exit(1);
  }

  // src culture is the first one defined in cultures array
  srcCultureID = cultureIDs.shift()!;
  srcCultureContent = loadCultureContent(srcCultureID);
  srcCultureKeyCount = Object.keys(srcCultureContent).length;

  // load culture contents
  contents = Object.fromEntries(
    cultureIDs.map(cid => [cid, loadCultureContent(cid)])
  );

  // init check results
  results = Object.fromEntries(
    cultureIDs.map(cid => [cid, checkCultureContent(cid)])
  );

  // print statistics
  console.log('----------------------------------------------------------------------------------------');
  console.log('This script will check i18n files for missing/extra/untranslated keys.');
  console.log('----------------------------------------------------------------------------------------');

  console.log(`Source language: ${srcCultureID}`);
  console.log(`Total key count: ${Object.keys(srcCultureContent).length}`);
  console.log();

  console.log('Check results:');
  let totalMissing = 0;
  for (const cid in results) {
    const res = results[cid];
    console.log(`[${cid}]: Progress: ${Math.floor((srcCultureKeyCount-res.untranslated.length) / srcCultureKeyCount * 100)}%, Untranslated: ${res.untranslated.length}, Missing: ${res.missing.length}, Extra: ${res.extra.length}`);
    if (res.missing.length) {
      totalMissing += res.missing.length;
      console.error(`  Missing: ${res.missing.join(', ')}`);
    }
    if (res.extra.length) {
      console.error(`  Extra: ${res.extra.join(', ')}`);
    }
    if (res.untranslated.length) {
      console.warn(`  Untranslated: ${res.untranslated.join(', ')}`);
    }
  }

  // ask permission to fix files
  if (totalMissing) {
    console.log();
    var choice = (await readLineAsync('One or more files has missing keys. Do you want to fix them (y/N)? ')).toLowerCase();
    if (choice === 'y') {
      fixFiles();
    }
  }

}

main();
