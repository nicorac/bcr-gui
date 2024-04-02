/**
 * Update & synchronize language files
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Culture, CultureContent, I18nKey } from 'src/app/services/i18n.service';

// constants
const SHOW_DETAILS = false;
const basePath = path.resolve(path.dirname(__filename) + '/..');
const langDir = basePath + '/src/assets/i18n';
const configFile = '_cultures.json';

// fields
let activeCultureIDs: string[];
let allCultureIDs: string[];
let srcCultureID: string;
let srcCultureContent: CultureContent;
let srcCultureKeyCount: number;
let contents: { [key:string]: CultureContent };
let results: CheckResult[];

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
  cid: string = '';
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

  res.cid = cid;

  // extra keys
  res.extra = Object.keys(cultureContent).filter(k => srcCultureContent[<I18nKey>k] === undefined) as I18nKey[];

  // untranslated keys
  res.untranslated = Object.keys(srcCultureContent).filter(k => cultureContent[<I18nKey>k] === undefined || cultureContent[<I18nKey>k].trim().length === 0) as I18nKey[];

  return res;
}

// main function
async function main() {

  console.log(`Reading config file ${configFile}...`);

  // load available culture files (active or not)
  allCultureIDs = fs.readdirSync(langDir)
    .filter(i => /\.json$/.test(i))
    .filter(i => i !== configFile)
    .map(i => path.parse(i).name);

  // load defined cultures (except for srcCulture, that will be "shifted" below)
  activeCultureIDs = (<Culture[]>JSON.parse(fs.readFileSync(`${langDir}/${configFile}`).toString())).map(c => c.id);
  if (!allCultureIDs.length) {
    console.error('No cultures defined!');
    process.exit(1);
  }

  // src culture is the first one defined in cultures array
  srcCultureID = activeCultureIDs.shift()!;
  srcCultureContent = loadCultureContent(srcCultureID);
  srcCultureKeyCount = Object.keys(srcCultureContent).length;

  // load culture contents
  contents = Object.fromEntries(
    allCultureIDs.map(cid => [cid, loadCultureContent(cid)])
  );

  // init check results
  results = allCultureIDs
    .map(cid => checkCultureContent(cid))
    .sort((a, b) => a.untranslated.length - b.untranslated.length || a.cid?.localeCompare(b.cid))
  ;

  // print statistics
  console.log('----------------------------------------------------------------------------------------');
  console.log('This script will check i18n files for missing/extra/untranslated keys.');
  console.log('----------------------------------------------------------------------------------------');

  console.log(`Source language: ${srcCultureID}`);
  console.log(`Total key count: ${Object.keys(srcCultureContent).length}`);
  console.log();

  console.log('Check results:');
  for (const res of results) {
    console.log(
      ('['+res.cid+']:').padEnd(10, ' '),
      `Progress: ${Math.floor((srcCultureKeyCount-res.untranslated.length) / srcCultureKeyCount * 100).toString().padStart(4, ' ')}%,`,
      `Untranslated: ${res.untranslated.length.toString().padStart(4, ' ')},`,
      `Active: ${res.cid === srcCultureID || activeCultureIDs.includes(res.cid)}`,
    );
    if (res.extra.length) {
      console.error(`  Extra: ${res.extra.join(', ')}`);
    }
    if (SHOW_DETAILS && res.untranslated.length) {
      console.warn(`  Untranslated: ${res.untranslated.join(', ')}`);
    }
  }
  console.log();

}

main();
