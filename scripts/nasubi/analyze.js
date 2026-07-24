import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'source');

// Word-boundary-safe substring test, used only for the handful of keywords
// below that are short enough to collide with unrelated words (e.g. 'hair'
// inside 'chair', 'ham' inside 'shampoo'). Everywhere else in this file still
// uses plain .includes(), which is intentional: most keywords here are stems
// meant to match plural/compound forms (e.g. 'snack' matching 'snacks').
function wholeWord(e, kw) {
  return new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`).test(e);
}

// Parse entries
const entriesRaw = fs.readFileSync(path.join(SRC, 'nasubi-entries.md'), 'utf-8');
const entries = [];
for (const line of entriesRaw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || trimmed.includes('---') || trimmed.includes('Entry Month') || trimmed.includes('日本語')) continue;
  const parts = trimmed.split('|').map(p => p.trim()).filter(p => p);
  if (parts.length >= 4) {
    const entryCount = parseInt(parts[2].replace(/\s/g, '').replace(/\?/g, '0')) || 0;
    // One source row has a malformed Entry Month cell ("06    1" - stray
    // whitespace and a leftover digit); take just the leading token so it
    // merges into month 06 instead of forming its own phantom bucket.
    const prizeMonth = parts.length > 4 ? parts[4].trim().split(/\s+/)[0] || '' : '';
    let jpy = 0;
    if (parts.length > 5 && parts[5].trim()) {
      jpy = parseInt(parts[5].trim()) || 0;
    }
    entries.push({
      jp: parts[0], en: parts[1], entries: entryCount,
      entryMonth: parts[3].trim().split(/\s+/)[0] || '', prizeMonth, jpy,
      won: prizeMonth.length > 0
    });
  }
}

// Parse winnings
const winRaw = fs.readFileSync(path.join(SRC, 'nasubi-winnings.md'), 'utf-8');
const winnings = [];
for (const line of winRaw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || trimmed.includes('---') || trimmed.includes('JPY') || trimmed.includes('日本語')) continue;
  const parts = trimmed.split('|').map(p => p.trim()).filter(p => p);
  if (parts.length >= 3) {
    const jp = parts[0].replace(/^-+\s*/, '');
    const en = parts[1];
    const jpy = parseInt(parts[2]) || 0;
    const month = parts.length > 3 ? parts[3].trim().split(/\s+/)[0] || '' : '';
    winnings.push({ jp, en, jpy, month });
  }
}

const totalItems = entries.length;
const totalPostcards = entries.reduce((s, e) => s + e.entries, 0);
const wonEntries = entries.filter(e => e.won);
const totalWon = wonEntries.length;
const totalPostcardsWon = wonEntries.reduce((s, e) => s + e.entries, 0);

console.log('=== BASIC STATS ===');
console.log('Total unique contest items entered:', totalItems);
console.log('Total postcards/entries sent:', totalPostcards);
console.log('Items that resulted in a win (from entries):', totalWon);
console.log('Postcards sent for winning items:', totalPostcardsWon);
console.log(`Win rate by item: ${totalWon}/${totalItems} = ${(totalWon/totalItems*100).toFixed(1)}%`);
console.log(`Win rate by postcard: ${totalPostcardsWon}/${totalPostcards} = ${(totalPostcardsWon/totalPostcards*100).toFixed(1)}%`);
console.log();

const totalWinValue = winnings.reduce((s, w) => s + w.jpy, 0);
const nonZeroWins = winnings.filter(w => w.jpy > 0);
console.log('=== WINNINGS SUMMARY ===');
console.log('Total winning items (from winnings file):', winnings.length);
console.log('Total value won:', totalWinValue.toLocaleString(), 'JPY');
console.log('Average win value (all):', Math.round(totalWinValue / winnings.length).toLocaleString(), 'JPY');
console.log('Average win value (non-zero):', Math.round(totalWinValue / nonZeroWins.length).toLocaleString(), 'JPY');
console.log();

// Monthly entries breakdown
const monthlyEntries = {};
for (const e of entries) {
  const m = e.entryMonth;
  if (!monthlyEntries[m]) monthlyEntries[m] = { items: 0, postcards: 0, wins: 0, winPostcards: 0 };
  monthlyEntries[m].items++;
  monthlyEntries[m].postcards += e.entries;
  if (e.won) {
    monthlyEntries[m].wins++;
    monthlyEntries[m].winPostcards += e.entries;
  }
}

console.log('=== ENTRIES BY ENTRY MONTH ===');
const monthOrder = Object.keys(monthlyEntries).sort();
for (const m of monthOrder) {
  const d = monthlyEntries[m];
  const rate = d.items > 0 ? (d.wins/d.items*100).toFixed(1) : '0.0';
  console.log(`Month ${m}: ${d.items} items, ${d.postcards} postcards, ${d.wins} wins (${rate}%)`);
}
console.log();

// Monthly winnings
const monthlyWins = {};
for (const w of winnings) {
  const m = w.month;
  if (!monthlyWins[m]) monthlyWins[m] = { count: 0, value: 0 };
  monthlyWins[m].count++;
  monthlyWins[m].value += w.jpy;
}

console.log('=== WINNINGS BY PRIZE MONTH ===');
let cumulative = 0;
for (const m of Object.keys(monthlyWins).sort()) {
  const d = monthlyWins[m];
  cumulative += d.value;
  console.log(`Month ${m}: ${d.count} items, ${d.value.toLocaleString()} JPY (cumulative: ${cumulative.toLocaleString()} JPY)`);
}
console.log(`\nFINAL CUMULATIVE: ${cumulative.toLocaleString()} JPY`);
console.log();

// Top wins by value
const sortedWins = [...winnings].sort((a, b) => b.jpy - a.jpy);
console.log('=== TOP 15 MOST VALUABLE WINS ===');
for (const w of sortedWins.slice(0, 15)) {
  console.log(`  ${w.jpy.toLocaleString().padStart(7)} JPY - ${w.en} (month ${w.month})`);
}
console.log();

// Zero value
const zeroVal = winnings.filter(w => w.jpy === 0);
console.log(`=== ZERO VALUE WINS (promotional/novelty): ${zeroVal.length} ===`);
for (const w of zeroVal) {
  console.log(`  ${w.en} (month ${w.month})`);
}
console.log();

// ROI for won items. Excludes rows with an unknown postcard count (source
// data marks these '?', parsed above as 0) - those aren't a real 0-postcard
// win, just missing data, and would otherwise show up as a nonsensical
// "0 JPY/card" entry at the bottom of the worst-ROI list.
const wonWithEffort = entries.filter(e => e.won && e.jpy > 0 && e.entries > 0).map(e => ({
  name: e.en, postcards: e.entries, jpy: e.jpy, month: e.entryMonth,
  roi: e.jpy / e.entries
}));
wonWithEffort.sort((a, b) => b.roi - a.roi);

console.log('=== BEST ROI (highest JPY per postcard sent) ===');
for (const w of wonWithEffort.slice(0, 10)) {
  console.log(`  ${Math.round(w.roi).toLocaleString().padStart(7)} JPY/card - ${w.name} (${w.postcards} cards, ${w.jpy.toLocaleString()} JPY, month ${w.month})`);
}
console.log();
console.log('=== WORST ROI (lowest JPY per postcard sent) ===');
for (const w of wonWithEffort.slice(-10)) {
  console.log(`  ${Math.round(w.roi).toLocaleString().padStart(7)} JPY/card - ${w.name} (${w.postcards} cards, ${w.jpy.toLocaleString()} JPY, month ${w.month})`);
}
console.log();

// Most postcards sent
const entriesSorted = [...entries].sort((a, b) => b.entries - a.entries);
console.log('=== TOP 20 MOST POSTCARDS SENT (single item) ===');
for (const e of entriesSorted.slice(0, 20)) {
  const won = e.won ? ' ** WON **' : '';
  console.log(`  ${String(e.entries).padStart(4)} cards - ${e.en} (month ${e.entryMonth})${won}`);
}
console.log();

// Hirosue Ryoko
const hirosue = entries.filter(e => e.en.toLowerCase().includes('hirosue') || e.jp.includes('広末'));
const hirosueCards = hirosue.reduce((s, e) => s + e.entries, 0);
const hirosueWins = hirosue.filter(e => e.won);
console.log('=== HIROSUE RYOKO OBSESSION ===');
console.log('Total Hirosue-related items entered:', hirosue.length);
console.log('Total postcards for Hirosue items:', hirosueCards);
console.log('Hirosue items won:', hirosueWins.length);
if (hirosueWins.length > 0) {
  for (const w of hirosueWins) {
    console.log(`  Won: ${w.en} (${w.entries} cards, month ${w.entryMonth})`);
  }
}
console.log();

// Used panties
const panties = entries.filter(e => e.en.toLowerCase().includes('panties') || e.en.toLowerCase().includes('bloomers'));
const pantiesCards = panties.reduce((s, e) => s + e.entries, 0);
const pantiesWins = panties.filter(e => e.won);
console.log('=== USED PANTIES ENTRIES ===');
console.log('Total panties items entered:', panties.length);
console.log('Total postcards for panties:', pantiesCards);
console.log('Panties won:', pantiesWins.length);
if (pantiesWins.length > 0) {
  for (const w of pantiesWins) {
    console.log(`  Won: ${w.en} (${w.entries} cards, ${w.jpy} JPY)`);
  }
}
console.log();

// Category analysis
function categorize(en) {
  const e = en.toLowerCase();
  if (e.includes('rice') && !e.includes('crackers') && !e.includes('seasoning') && !e.includes('rice bowl') && !e.includes('vermicelli')) return 'Rice';
  if (e.includes('ramen') || e.includes('noodle') || e.includes('udon') || e.includes('soba') || e.includes('spaghetti') || e.includes('pasta')) return 'Noodles/Pasta';
  if (e.includes('snack') || e.includes('chip') || e.includes('cracker') || e.includes('cookie') || e.includes('biscuit') || e.includes('chocolate') || e.includes('candy') || e.includes('sweet') || e.includes('cake') || e.includes('castella') || e.includes('jelly') || e.includes('ice cream') || e.includes('yokan') || e.includes('anmitsu') || e.includes('mochi')) return 'Snacks/Sweets';
  // 'ham' -> wholeWord: plain .includes('ham') also matches inside "shampoo",
  // "Yokohama", "Keirin", "Dreamland", "champagne" etc., wrongly routing
  // those (including a real win, "Japan Keirin Championship video") into
  // this food category.
  if (e.includes('beef') || e.includes('steak') || e.includes('pork') || e.includes('duck') || e.includes('crab') || e.includes('lobster') || e.includes('fish') || e.includes('salmon') || e.includes('eel') || e.includes('prawn') || e.includes('sea urchin') || e.includes('mackerel') || wholeWord(e, 'ham') || e.includes('sausage') || e.includes('meat') || e.includes('matsutake') || e.includes('natto') || e.includes('watermelon') || e.includes('strawberr') || e.includes('melon') || e.includes('cherri') || e.includes('apple') || e.includes('grape') || e.includes('fruit') || e.includes('corn') || e.includes('tomato') || e.includes('cucumber') || e.includes('vegetable') || e.includes('mushroom') || e.includes('pickle') || e.includes('tofu') || e.includes('bean') || e.includes('miso') || e.includes('soy') || e.includes('seaweed') || e.includes('nori') || e.includes('horse meat') || e.includes('edamame') || e.includes('gyoza')) return 'Food (fresh/specialty)';
  if (e.includes('juice') || e.includes('tea') || e.includes('coffee') || e.includes('sake') || e.includes('liquor') || e.includes('beer') || e.includes('wine') || e.includes('alcohol') || e.includes('drink') || e.includes('budweiser') || e.includes('mineral water') || e.includes('yogurt drink') || e.includes('milk')) return 'Beverages';
  if (e.includes('tv') || e.includes('television') || e.includes('video') || e.includes('vcr') || e.includes('dvd') || e.includes('stereo') || e.includes('cd player') || (e.includes('md ') && !e.includes('md walk')) || e.includes('headphone') || e.includes('speaker') || e.includes('radio') || e.includes('audio') || e.includes('keyboard')) return 'Electronics (AV)';
  if (e.includes('computer') || e.includes('laptop') || e.includes('mac') || e.includes('vaio') || e.includes('gateway') || e.includes('printer') || e.includes('camera') || e.includes('fax') || e.includes('phone') || e.includes('mobile') || e.includes('pocket board') || e.includes('phs') || e.includes('pager') || e.includes('translation') || e.includes('internet') || e.includes('cd-rom') || e.includes('navigation') || e.includes('car nav')) return 'Electronics (IT/Tech)';
  if (e.includes('playstation') || e.includes('nintendo') || e.includes('sega') || e.includes('game soft') || e.includes('game boy') || e.includes('board game') || e.includes('figure') || e.includes('gundam') || e.includes('pokemon') || e.includes('tamagotchi') || e.includes('mobile game') || e.includes('handheld game')) return 'Games/Toys';
  if (e.includes('trip') || e.includes('travel') || e.includes('cruise') || e.includes('hawaii') || e.includes('air ticket') || e.includes('round-trip') || e.includes('tour')) return 'Travel';
  if (e.includes('toyota') || e.includes('nissan') || e.includes('honda') || e.includes('mazda') || e.includes('suzuki') || e.includes('daihatsu') || e.includes('subaru') || e.includes('mitsubishi') || e.includes('bmw') || e.includes('benz') || e.includes('volvo') || e.includes('renault') || e.includes('jeep') || e.includes('rover') || e.includes('opel') || e.includes('harley') || e.includes('scooter') || e.includes('bicycle') || e.includes('tire')) return 'Vehicles/Transport';
  if (e.includes('watch') || e.includes('ring') || e.includes('necklace') || e.includes('pendant') || e.includes('earring') || e.includes('bracelet') || e.includes('accessor') || e.includes('jewelry')) return 'Jewelry/Accessories';
  if (e.includes('hirosue') || e.includes('poster') || e.includes('phone card') || e.includes('telephone card') || e.includes('autograph') || e.includes('photo book') || e.includes('calendar') || e.includes('panties') || e.includes('bloomers') || e.includes('used')) return 'Celebrity/Collectibles';
  // 'hair' -> wholeWord: plain .includes('hair') also matches inside
  // "chair", which wrongly routed "Kokuyo desk and chair" - the single
  // biggest win in the dataset (99,800 JPY) - and several other chairs into
  // Personal Care/Beauty instead of Home/Appliances.
  // 'dryer' additionally excludes "dish dryer", a kitchen appliance that
  // isn't personal care despite sharing the word with "hair dryer".
  if (e.includes('shampoo') || e.includes('soap') || e.includes('cosmetic') || e.includes('cream') || e.includes('perfume') || e.includes('cologne') || e.includes('nail') || wholeWord(e, 'hair') || e.includes('toothbrush') || e.includes('toothpaste') || e.includes('shaver') || (e.includes('dryer') && !e.includes('dish dryer')) || e.includes('beauty') || e.includes('lotion') || e.includes('oil blot')) return 'Personal Care/Beauty';
  if (e.includes('desk') || e.includes('chair') || e.includes('pot') || e.includes('pan') || e.includes('cooker') || e.includes('vacuum') || e.includes('iron') || e.includes('purifier') || e.includes('refrigerator') || e.includes('microwave') || e.includes('washing') || e.includes('tent') || e.includes('pillow') || e.includes('futon') || e.includes('shelf') || e.includes('fan') || e.includes('steamer')) return 'Home/Appliances';
  if (e.includes('shirt') || e.includes('shoes') || e.includes('bag') || e.includes('belt') || e.includes('wallet') || e.includes('jean') || e.includes('sneaker') || e.includes('boot') || e.includes('hat') || e.includes('cap') || e.includes('scarf') || e.includes('sunglass') || e.includes('sock') || e.includes('apron') || e.includes('backpack') || e.includes('umbrella') || e.includes('swimsuit') || e.includes('pouch') || e.includes('case') || e.includes('clothing')) return 'Clothing/Fashion';
  if (e.includes('cash') || e.includes('gift cert') || e.includes('voucher') || e.includes('ticket') || e.includes('coupon') || e.includes('prize money') || e.includes('book voucher') || e.includes('meal ticket') || e.includes('lesson') || e.includes('invitation')) return 'Cash/Vouchers/Tickets';
  if (e.includes('golf') || e.includes('ski') || e.includes('surf') || e.includes('fishing') || e.includes('bodyboard') || e.includes('roller') || e.includes('binocular') || e.includes('telescope') || e.includes('soccer') || e.includes('wetsuit')) return 'Sports/Outdoor';
  return 'Other';
}

const cats = {};
for (const e of entries) {
  const cat = categorize(e.en);
  if (!cats[cat]) cats[cat] = { items: 0, postcards: 0, wins: 0, winValue: 0 };
  cats[cat].items++;
  cats[cat].postcards += e.entries;
  if (e.won) {
    cats[cat].wins++;
    cats[cat].winValue += e.jpy;
  }
}

console.log('=== CATEGORY BREAKDOWN (sorted by postcards sent) ===');
const catSorted = Object.entries(cats).sort((a, b) => b[1].postcards - a[1].postcards);
for (const [cat, d] of catSorted) {
  const rate = d.items > 0 ? (d.wins/d.items*100).toFixed(1) : '0.0';
  console.log(`${cat.padEnd(25)}: ${String(d.items).padStart(4)} items, ${String(d.postcards).padStart(6)} cards, ${String(d.wins).padStart(3)} wins (${rate}%), value: ${d.winValue.toLocaleString()} JPY`);
}
console.log();

// Items entered most months (persistence). The dedup key keeps digits (only
// strips non-alphanumerics), so distinct quantities/amounts of a same-named
// item don't collapse into one fake "recurring entry" - the original
// [^a-z]-only strip merged "1 million yen in cash", "3 million yen in cash",
// and "10 Million Yen in Cash" into a single bogus 5-month/261-postcard row.
const itemMonths = {};
for (const e of entries) {
  const key = e.en.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!itemMonths[key]) itemMonths[key] = { name: e.en, months: new Set(), totalCards: 0, won: false };
  itemMonths[key].months.add(e.entryMonth);
  itemMonths[key].totalCards += e.entries;
  if (e.won) itemMonths[key].won = true;
}

const persistent = Object.values(itemMonths).filter(i => i.months.size > 2).sort((a, b) => b.months.size - a.months.size);
console.log('=== MOST PERSISTENT ENTRIES (entered 3+ months) ===');
for (const p of persistent.slice(0, 20)) {
  const won = p.won ? ' ** WON **' : '';
  console.log(`  ${p.months.size} months, ${p.totalCards} total cards - ${p.name}${won}`);
}

// Calculate cost of postcards (50 yen per postcard in 1998)
console.log();
console.log('=== POSTCARD ECONOMICS ===');
const postcardCost = 50; // yen per postcard
const totalCost = totalPostcards * postcardCost;
console.log(`Postcard cost (${postcardCost} JPY each): ${totalCost.toLocaleString()} JPY`);
console.log(`Total value won: ${totalWinValue.toLocaleString()} JPY`);
console.log(`Net profit: ${(totalWinValue - totalCost).toLocaleString()} JPY`);
console.log(`ROI: ${((totalWinValue / totalCost - 1) * 100).toFixed(0)}%`);

export { entries, winnings, categorize, wholeWord };
