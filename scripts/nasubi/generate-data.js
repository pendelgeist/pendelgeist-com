#!/usr/bin/env node
/**
 * Regenerates public/nasubi/data/entries-japan.json, winnings-japan.json,
 * and entries-korea.json from the raw source tables in scripts/nasubi/source/,
 * using the same (bug-fixed) parsing and categorization logic as analyze.js /
 * analyzefood.js / analyzekorea.js - imported directly rather than
 * reimplemented, so there's one source of truth for how an entry is parsed
 * or categorized.
 *
 * Also prints every table content.json's narrative sections quote numbers
 * from (category breakdowns, food subcategory breakdown, persistence index,
 * Korea category breakdown), so a content edit can be checked against fresh
 * output instead of hand-recomputed.
 *
 * Run with: node scripts/nasubi/generate-data.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../public/nasubi/data');

// analyze.js / analyzefood.js / analyzekorea.js each log their own report to
// stdout as a side effect of being loaded (that's their whole purpose when
// run directly) - silence that here so this script's own output stays clean.
async function importQuietly(specifier) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await import(specifier);
  } finally {
    console.log = originalLog;
  }
}

const { entries: japanEntries, winnings: japanWinnings, categorize: japanCategorize } = await importQuietly('./analyze.js');
const { foodSubcategory } = await importQuietly('./analyzefood.js');
const { entries: koreaEntries, categorize: koreaCategorize } = await importQuietly('./analyzekorea.js');

// --- Write the raw browsable datasets ---

const entriesJapanOut = japanEntries.map(e => ({
  jp: e.jp, en: e.en,
  postcards: e.entries,
  entryMonth: e.entryMonth || null,
  prizeMonth: e.prizeMonth || null,
  jpy: e.jpy || null,
}));
fs.writeFileSync(path.join(DATA_DIR, 'entries-japan.json'), JSON.stringify(entriesJapanOut));

const winningsJapanOut = japanWinnings.map(w => ({ jp: w.jp, en: w.en, jpy: w.jpy, month: w.month || null }));
fs.writeFileSync(path.join(DATA_DIR, 'winnings-japan.json'), JSON.stringify(winningsJapanOut));

const entriesKoreaOut = koreaEntries.map(e => ({ jp: e.jp, en: e.en, month: e.month || null }));
fs.writeFileSync(path.join(DATA_DIR, 'entries-korea.json'), JSON.stringify(entriesKoreaOut));

console.log(`Wrote entries-japan.json (${entriesJapanOut.length} rows), winnings-japan.json (${winningsJapanOut.length} rows), entries-korea.json (${entriesKoreaOut.length} rows).\n`);

// --- Print the tables content.json's narrative sections need to match ---

function printTable(title, rows, cols) {
  console.log(`=== ${title} ===`);
  for (const r of rows) console.log('  ' + cols.map(c => c(r)).join(' | '));
  console.log();
}

// Japan category breakdown (top categories by postcards, as published)
const jCats = {};
for (const e of japanEntries) {
  const cat = japanCategorize(e.en);
  (jCats[cat] ??= { items: 0, postcards: 0, wins: 0, winValue: 0 });
  jCats[cat].items++;
  jCats[cat].postcards += e.entries;
  if (e.won) { jCats[cat].wins++; jCats[cat].winValue += e.jpy; }
}
printTable(
  'JAPAN CATEGORY BREAKDOWN (sorted by postcards)',
  Object.entries(jCats).sort((a, b) => b[1].postcards - a[1].postcards),
  [
    ([cat]) => cat.padEnd(24),
    ([, d]) => `${d.items} items`,
    ([, d]) => `${d.postcards} cards`,
    ([, d]) => `${d.wins} wins`,
    ([, d]) => `${(d.items ? d.wins / d.items * 100 : 0).toFixed(1)}%`,
    ([, d]) => `${d.winValue.toLocaleString()} JPY`,
  ]
);

// Food subcategory breakdown
const allFood = japanEntries.filter(e => foodSubcategory(e.en.toLowerCase()) !== null);
const foodSubcats = {};
for (const e of allFood) {
  const sub = foodSubcategory(e.en.toLowerCase());
  (foodSubcats[sub] ??= { items: 0, postcards: 0, wins: 0, winValue: 0 });
  foodSubcats[sub].items++;
  foodSubcats[sub].postcards += e.entries;
  if (e.won) { foodSubcats[sub].wins++; foodSubcats[sub].winValue += e.jpy; }
}
const allFoodWon = allFood.filter(e => e.won);
console.log('=== FOOD DEEP DIVE OVERVIEW ===');
console.log(`  ${allFood.length} items, ${allFood.reduce((s, e) => s + e.entries, 0)} postcards`);
console.log(`  ${allFoodWon.length} wins, ${allFoodWon.reduce((s, e) => s + e.jpy, 0).toLocaleString()} JPY`);
console.log(`  win rate ${(allFoodWon.length / allFood.length * 100).toFixed(1)}%`);
console.log(`  ${(allFood.length / japanEntries.length * 100).toFixed(1)}% of items, ${(allFood.reduce((s, e) => s + e.entries, 0) / japanEntries.reduce((s, e) => s + e.entries, 0) * 100).toFixed(1)}% of postcards`);
console.log();
printTable(
  'FOOD SUBCATEGORY BREAKDOWN (sorted by postcards)',
  Object.entries(foodSubcats).sort((a, b) => b[1].postcards - a[1].postcards),
  [
    ([sub]) => sub.padEnd(24),
    ([, d]) => `${d.items} items`,
    ([, d]) => `${d.postcards} cards`,
    ([, d]) => `${d.wins} wins`,
    ([, d]) => `${(d.items ? d.wins / d.items * 100 : 0).toFixed(1)}%`,
    ([, d]) => `${d.winValue.toLocaleString()} JPY`,
  ]
);

// Persistence index (digit-preserving key - see analyze.js)
const itemMonths = {};
for (const e of japanEntries) {
  const key = e.en.toLowerCase().replace(/[^a-z0-9]/g, '');
  (itemMonths[key] ??= { name: e.en, months: new Set(), totalCards: 0, won: false });
  itemMonths[key].months.add(e.entryMonth);
  itemMonths[key].totalCards += e.entries;
  if (e.won) itemMonths[key].won = true;
}
const persistent = Object.values(itemMonths).filter(i => i.months.size > 2).sort((a, b) => b.months.size - a.months.size);
printTable(
  'PERSISTENCE INDEX (top 20, 3+ months)',
  persistent.slice(0, 20),
  [p => `${p.months.size} months`, p => `${p.totalCards} cards`, p => p.name, p => p.won ? '** WON **' : ''],
);

// Monthly entries (confirms the "06    1" malformed row merges into June)
const monthlyEntries = {};
for (const e of japanEntries) {
  (monthlyEntries[e.entryMonth] ??= { items: 0, postcards: 0, wins: 0 });
  monthlyEntries[e.entryMonth].items++;
  monthlyEntries[e.entryMonth].postcards += e.entries;
  if (e.won) monthlyEntries[e.entryMonth].wins++;
}
printTable(
  'MONTHLY ENTRIES',
  Object.entries(monthlyEntries).sort(),
  [([m]) => m.padEnd(6), ([, d]) => `${d.items} items`, ([, d]) => `${d.postcards} cards`, ([, d]) => `${d.wins} wins`],
);

// Korea category breakdown
const kCats = {};
for (const e of koreaEntries) {
  const cat = koreaCategorize(e.en);
  kCats[cat] = (kCats[cat] ?? 0) + 1;
}
printTable(
  'KOREA CATEGORY BREAKDOWN',
  Object.entries(kCats).sort((a, b) => b[1] - a[1]),
  [([cat]) => cat.padEnd(24), ([, n]) => `${n} items`, ([, n]) => `${(n / koreaEntries.length * 100).toFixed(1)}%`],
);
