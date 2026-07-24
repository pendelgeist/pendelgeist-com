import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'source');

// See analyze.js for why this exists.
function wholeWord(e, kw) {
  return new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`).test(e);
}

const raw = fs.readFileSync(path.join(SRC, 'nasubi-in-korea-entries.md'), 'utf-8');
const lines = raw.split('\n');
const entries = [];
for (const line of lines) {
  const t = line.trim();
  if (!t.startsWith('|') || t.includes('---') || t.includes('日本語')) continue;
  const parts = t.split('|').map(p => p.trim()).filter(p => p);
  if (parts.length >= 4) {
    entries.push({
      jp: parts[0],
      en: parts[1],
      entries: parts[2].trim(),
      month: parts[3].trim().split(/\s+/)[0] || '',
    });
  }
}

console.log('=== KOREA OVERVIEW ===');
console.log('Total entries:', entries.length);

const months = {};
for (const e of entries) {
  if (!months[e.month]) months[e.month] = [];
  months[e.month].push(e);
}
console.log('Months:', Object.keys(months).sort().join(', '));
for (const [m, items] of Object.entries(months).sort()) {
  console.log(`  Month ${m}: ${items.length} items`);
}

// All entries have 'x' for entries count - check
const withCounts = entries.filter(e => e.entries !== 'x');
console.log('\nEntries with actual counts:', withCounts.length);
console.log('Entries with "x":', entries.filter(e => e.entries === 'x').length);

// Categorize
function categorize(en) {
  const e = en.toLowerCase();
  if (e.includes('kimchi') || e.includes('beef') || e.includes('pork') || e.includes('rib') ||
      e.includes('meat') || e.includes('kalbi') || e.includes('bulgogi') || e.includes('steak') ||
      e.includes('chicken') || e.includes('duck') || e.includes('ham') || e.includes('sausage') ||
      e.includes('jerky')) return 'Meat';
  if (e.includes('fish') || e.includes('crab') || e.includes('squid') || e.includes('pollock') ||
      e.includes('mackerel') || e.includes('seafood') || e.includes('seaweed') || e.includes('clam') ||
      e.includes('shrimp') || e.includes('prawn') || e.includes('octopus') || e.includes('abalone')) return 'Seafood';
  if (e.includes('rice') && !e.includes('cooker') && !e.includes('cracker')) return 'Rice';
  if (e.includes('noodle') || e.includes('ramen') || e.includes('udon') || e.includes('soba') ||
      e.includes('pasta') || e.includes('spaghetti') || e.includes('vermicelli')) return 'Noodles';
  if (e.includes('fruit') || e.includes('apple') || e.includes('grape') || e.includes('melon') ||
      e.includes('strawberr') || e.includes('orange') || e.includes('pear') || e.includes('peach') ||
      e.includes('persimmon') || e.includes('banana') || e.includes('watermelon') || e.includes('cherry')) return 'Fruit';
  if (e.includes('vegetable') || e.includes('mushroom') || e.includes('corn') || e.includes('potato') ||
      e.includes('radish') || e.includes('garlic') || e.includes('onion') || e.includes('ginseng') ||
      e.includes('carrot') || e.includes('cabbage') || e.includes('pepper') || e.includes('bean sprout')) return 'Vegetables';
  if (e.includes('snack') || e.includes('candy') || e.includes('cookie') || e.includes('chocolate') ||
      e.includes('cake') || e.includes('sweet') || e.includes('ice cream') || e.includes('jelly') ||
      e.includes('confection') || e.includes('cracker') || e.includes('biscuit') || e.includes('pastry') ||
      e.includes('mochi') || e.includes('castella') || e.includes('pie') || e.includes('gum')) return 'Snacks & Sweets';
  if (e.includes('tea') || e.includes('juice') || e.includes('coffee') || e.includes('drink') ||
      e.includes('beer') || e.includes('sake') || e.includes('wine') || e.includes('liquor') ||
      e.includes('soju') || e.includes('water') || e.includes('milk') || e.includes('yogurt') ||
      e.includes('cider') || e.includes('cola') || e.includes('beverage')) return 'Beverages';
  if (e.includes('sauce') || e.includes('oil') || e.includes('seasoning') || e.includes('vinegar') ||
      e.includes('salt') || e.includes('spice') || e.includes('miso') || e.includes('soy') ||
      e.includes('condiment') || e.includes('dressing') || e.includes('paste') || e.includes('honey')) return 'Condiments';
  if (e.includes('soup') || e.includes('stew') || e.includes('hot pot') || e.includes('curry') ||
      e.includes('porridge') || e.includes('dim sum') || e.includes('dumpling') || e.includes('gyoza') ||
      e.includes('bun') || e.includes('tofu') || e.includes('egg') || e.includes('bread') ||
      e.includes('food') || e.includes('meal') || e.includes('lunch') || e.includes('dinner') ||
      e.includes('set meal')) return 'Prepared Food';
  if (e.includes('tv') || e.includes('television') || e.includes('video') || e.includes('stereo') ||
      e.includes('camera') || e.includes('vcr') || e.includes('player') || e.includes('radio') ||
      e.includes('cassette') || e.includes('recorder') || e.includes('monitor') || e.includes('audio') ||
      e.includes('cd') || e.includes('md') || e.includes('speaker') || e.includes('headphone')) return 'Electronics (AV)';
  if (e.includes('computer') || e.includes('phone') || e.includes('fax') || e.includes('pager') ||
      e.includes('organizer') || e.includes('calculator') || e.includes('digital') || e.includes('electronic') ||
      e.includes('printer') || e.includes('palm') || e.includes('pocket')) return 'Electronics (IT)';
  if (e.includes('refrigerator') || e.includes('washing') || e.includes('microwave') || e.includes('cooker') ||
      e.includes('vacuum') || e.includes('air') || e.includes('heater') || e.includes('iron') ||
      e.includes('purifier') || e.includes('humidifier') || e.includes('dryer') || e.includes('fan') ||
      e.includes('pressure')) return 'Appliances';
  if (e.includes('cosmetic') || e.includes('shampoo') || e.includes('soap') || e.includes('toothbrush') ||
      e.includes('beauty') || e.includes('skin') || e.includes('perfume') || e.includes('hair') ||
      e.includes('lotion') || e.includes('cream') || e.includes('deodorant')) return 'Personal Care';
  if (e.includes('travel') || e.includes('hotel') || e.includes('accommodation') || e.includes('air ticket') ||
      e.includes('flight') || e.includes('trip') || e.includes('tour') || e.includes('honeymoon') ||
      e.includes('round-trip')) return 'Travel';
  if (e.includes('won') || e.includes('cash') || e.includes('money') || e.includes('bankbook') ||
      e.includes('gift certificate') || e.includes('voucher') || e.includes('coupon') ||
      e.includes('savings')) return 'Cash & Vouchers';
  if (e.includes('watch') || e.includes('bag') || e.includes('sunglasses') || e.includes('jewelry') ||
      e.includes('necklace') || e.includes('ring') || e.includes('bracelet') || e.includes('wallet') ||
      e.includes('tie') || e.includes('accessories') || e.includes('glasses')) return 'Accessories';
  // 'car' -> wholeWord: plain .includes('car') also matches inside "scarf",
  // "carpet", "carrier", and "care" - wrongly routing 9 of the published
  // 12 "Vehicles" items (mostly scarves) into this category.
  if (wholeWord(e, 'car') || e.includes('bicycle') || e.includes('bike') || e.includes('tire') ||
      e.includes('samsung') || e.includes('scooter') || e.includes('automobile')) return 'Vehicles';
  if (e.includes('bed') || e.includes('blanket') || e.includes('pillow') || e.includes('mattress') ||
      e.includes('sheet') || e.includes('comforter') || e.includes('quilt') || e.includes('futon') ||
      e.includes('bedding')) return 'Bedding';
  if (e.includes('towel') || e.includes('cloth') || e.includes('shirt') || e.includes('jacket') ||
      e.includes('pants') || e.includes('shoes') || e.includes('coat') || e.includes('sweater') ||
      e.includes('clothing') || e.includes('glove') || e.includes('hat') || e.includes('scarf') ||
      e.includes('socks') || e.includes('underwear') || e.includes('suit')) return 'Clothing';
  if (e.includes('pot') || e.includes('pan') || e.includes('knife') || e.includes('kitchen') ||
      e.includes('bowl') || e.includes('plate') || e.includes('cup') || e.includes('mug') ||
      e.includes('kettle') || e.includes('tableware') || e.includes('cutlery') || e.includes('cookware') ||
      e.includes('thermos') || e.includes('container') || e.includes('wok')) return 'Kitchenware';
  if (e.includes('desk') || e.includes('chair') || e.includes('shelf') || e.includes('chest') ||
      e.includes('cabinet') || e.includes('table') || e.includes('furniture') || e.includes('rattan') ||
      e.includes('stool') || e.includes('mirror')) return 'Furniture';
  if (e.includes('instrument') || e.includes('guitar') || e.includes('piano') || e.includes('music')) return 'Musical Instruments';
  return 'Other';
}

const cats = {};
for (const e of entries) {
  const cat = categorize(e.en);
  if (!cats[cat]) cats[cat] = [];
  cats[cat].push(e);
}

console.log('\n=== CATEGORY BREAKDOWN ===');
const catSorted = Object.entries(cats).sort((a, b) => b[1].length - a[1].length);
for (const [cat, items] of catSorted) {
  console.log(`${cat.padEnd(25)}: ${items.length} items`);
}

// Food vs non-food
const foodCats = ['Meat', 'Seafood', 'Rice', 'Noodles', 'Fruit', 'Vegetables', 'Snacks & Sweets', 'Beverages', 'Condiments', 'Prepared Food'];
const foodEntries = entries.filter(e => foodCats.includes(categorize(e.en)));
const nonFoodEntries = entries.filter(e => !foodCats.includes(categorize(e.en)));
console.log(`\nFood-related: ${foodEntries.length} / ${entries.length} (${(foodEntries.length/entries.length*100).toFixed(1)}%)`);
console.log(`Non-food: ${nonFoodEntries.length} / ${entries.length} (${(nonFoodEntries.length/entries.length*100).toFixed(1)}%)`);

// List notable items
console.log('\n=== NOTABLE ENTRIES ===');
console.log('High-value targets:');
for (const e of entries) {
  const en = e.en.toLowerCase();
  if (en.includes('million') || en.includes('samsung') || en.includes('honeymoon') ||
      en.includes('air ticket') || en.includes('round-trip') || en.includes('hotel') ||
      en.includes('bankbook') || en.includes('travel') || en.includes('car') ||
      en.includes('refrigerator') || en.includes('washing machine') || en.includes('television')) {
    console.log(`  Month ${e.month}: ${e.en} (${e.jp})`);
  }
}

// Print all entries by month for review
console.log('\n=== ALL ENTRIES BY MONTH ===');
for (const [m, items] of Object.entries(months).sort()) {
  console.log(`\n--- Month ${m} (${items.length} items) ---`);
  for (const e of items) {
    console.log(`  ${e.en}`);
  }
}

export { entries, categorize };
