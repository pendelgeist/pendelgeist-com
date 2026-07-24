import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'source');

// See analyze.js for why this exists: a handful of short keywords below
// collide with unrelated words under plain .includes() and need a
// word-boundary-safe check instead.
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

// Fine-grained food subcategories
function foodSubcategory(en) {
  const e = en.toLowerCase();
  // Meat & Seafood
  // 'ham' -> wholeWord: plain .includes('ham') also matches inside
  // "shampoo", "Yokohama", "Keirin", "Dreamland", "champagne", and
  // "shishamo" (a fish!) - wrongly pulling non-food items (including a real
  // win, "Japan Keirin Championship video") into Meat, and misrouting a
  // genuine seafood item away from Seafood & Seaweed.
  if (e.includes('beef') || e.includes('steak') || e.includes('pork') || e.includes('roast') || wholeWord(e, 'ham') || e.includes('sausage') || e.includes('horse meat') || e.includes('duck') || e.includes('chicken') || e.includes('jerky') || e.includes('yakiniku')) return 'Meat';
  if (e.includes('crab') || e.includes('lobster') || e.includes('fish') || e.includes('salmon') || e.includes('eel') || e.includes('prawn') || e.includes('sea urchin') || e.includes('mackerel') || e.includes('marlin') || e.includes('clam') || e.includes('abalone') || e.includes('turban') || e.includes('dried fish') || e.includes('seafood') || e.includes('ankimo') || e.includes('tarako') || e.includes('seaweed') || e.includes('nori') || e.includes('wakame') || e.includes('shishamo')) return 'Seafood & Seaweed';
  // Fresh produce & fruit
  if (e.includes('watermelon') || e.includes('strawberr') || e.includes('melon') || e.includes('cherri') || e.includes('apple') || e.includes('grape') || e.includes('peach') || e.includes('blueberr') || e.includes('orange') || e.includes('mandarin') || e.includes('banana') || e.includes('pomegranate') || e.includes('pear')) return 'Fruit';
  if (e.includes('corn') || e.includes('tomato') || e.includes('cucumber') || e.includes('vegetable') || e.includes('mushroom') || e.includes('matsutake') || e.includes('shiitake') || e.includes('bamboo shoot') || e.includes('cabbage') || e.includes('radish') || e.includes('edamame') || e.includes('lettuce') || e.includes('udo') || e.includes('ginger')) return 'Vegetables & Mushrooms';
  // Pickles & fermented
  if (e.includes('pickle') || e.includes('natto') || e.includes('miso') || e.includes('kimchi') || e.includes('takana') || e.includes('eggplant')) return 'Pickles & Fermented';
  // Rice
  if (e.includes('rice') && !e.includes('cracker') && !e.includes('seasoning') && !e.includes('rice bowl') && !e.includes('vermicelli') && !e.includes('porridge')) return 'Rice';
  // Noodles & pasta
  if (e.includes('ramen') || e.includes('noodle') || e.includes('udon') || e.includes('soba') || e.includes('spaghetti') || e.includes('pasta') || e.includes('vermicelli') || e.includes('somen') || e.includes('hiyamugi') || e.includes('tanmen')) return 'Noodles & Pasta';
  // Snacks & sweets
  if (e.includes('snack') || e.includes('chip') || e.includes('cracker') || e.includes('cookie') || e.includes('biscuit') || e.includes('chocolate') || e.includes('candy') || e.includes('sweet') || e.includes('cake') || e.includes('castella') || e.includes('jelly') || e.includes('ice cream') || e.includes('yokan') || e.includes('anmitsu') || e.includes('mochi') || e.includes('almond')) return 'Snacks & Sweets';
  // Prepared/convenience food
  if (e.includes('gyoza') || e.includes('dim sum') || e.includes('sushi') || e.includes('curry') || e.includes('stew') || e.includes('hot pot') || e.includes('soup') || e.includes('porridge') || e.includes('toast') || e.includes('bread') || e.includes('cereal') || e.includes('retort') || e.includes('frozen') || e.includes('cup ') || e.includes('instant') || e.includes('don ') || e.includes('bun') || e.includes('ochazuke') || e.includes('chinese bun')) return 'Prepared & Convenience Food';
  // Beverages
  if (e.includes('juice') || e.includes('tea') || e.includes('coffee') || e.includes('sake') || e.includes('liquor') || e.includes('beer') || e.includes('wine') || e.includes('alcohol') || e.includes('drink') || e.includes('budweiser') || e.includes('water') || e.includes('yogurt') || e.includes('milk') || e.includes('shake') || e.includes('gronsan')) return 'Beverages';
  // Condiments & pantry
  // 'oil' -> wholeWord: plain .includes('oil') also matches inside "toilet",
  // which wrongly pulled a real win ("Toilet paper", 1,500 JPY) into food.
  if (e.includes('furikake') || e.includes('seasoning') || e.includes('dressing') || e.includes('sauce') || wholeWord(e, 'oil') || e.includes('soy') || e.includes('vinegar') || e.includes('honey') || e.includes('jam') || e.includes('butter') || e.includes('salt') || e.includes('spice') || e.includes('ketchup') || e.includes('mayonnaise') || e.includes('dashi') || e.includes('kombu')) return 'Condiments & Pantry';
  // Pet food
  if (e.includes('dog food') || e.includes('cat food')) return 'Pet Food';
  // Diet/health food
  if (e.includes('diet') || e.includes('nutritional') || e.includes('supplement') || e.includes('health') || e.includes('fiber') || e.includes('collagen') || e.includes('cereal') || e.includes('balance')) return 'Diet & Health Food';
  // Cheese & dairy
  if (e.includes('cheese') || e.includes('yogurt') || e.includes('tofu') || e.includes('bean') || e.includes('soy milk')) return 'Dairy & Soy';
  return null; // not food
}

// Broad "is this food at all" check
function isFoodBroad(en) {
  return foodSubcategory(en) !== null;
}

const allFood = entries.filter(e => isFoodBroad(e.en));
const allFoodWon = allFood.filter(e => e.won);

console.log('=== FOOD DEEP DIVE: OVERVIEW ===');
console.log(`Total food-related entries: ${allFood.length} items, ${allFood.reduce((s,e) => s+e.entries, 0)} postcards`);
console.log(`Food wins: ${allFoodWon.length} items, ${allFoodWon.reduce((s,e) => s+e.jpy, 0).toLocaleString()} JPY`);
console.log(`Food win rate: ${(allFoodWon.length / allFood.length * 100).toFixed(1)}%`);
console.log(`Food as % of all entries: ${(allFood.length / entries.length * 100).toFixed(1)}% of items, ${(allFood.reduce((s,e) => s+e.entries, 0) / entries.reduce((s,e) => s+e.entries, 0) * 100).toFixed(1)}% of postcards`);
console.log();

// Subcategory breakdown
const subcats = {};
for (const e of allFood) {
  const sub = foodSubcategory(e.en);
  if (!subcats[sub]) subcats[sub] = { items: 0, postcards: 0, wins: 0, winValue: 0, winItems: [] };
  subcats[sub].items++;
  subcats[sub].postcards += e.entries;
  if (e.won) {
    subcats[sub].wins++;
    subcats[sub].winValue += e.jpy;
    subcats[sub].winItems.push(e);
  }
}

console.log('=== FOOD SUBCATEGORY BREAKDOWN ===');
const subSorted = Object.entries(subcats).sort((a, b) => b[1].postcards - a[1].postcards);
for (const [sub, d] of subSorted) {
  const rate = d.items > 0 ? (d.wins/d.items*100).toFixed(1) : '0.0';
  console.log(`${sub.padEnd(28)}: ${String(d.items).padStart(4)} items, ${String(d.postcards).padStart(5)} cards, ${String(d.wins).padStart(2)} wins (${rate}%), value: ${d.winValue.toLocaleString()} JPY`);
}
console.log();

// All food wins listed
console.log('=== ALL FOOD WINS (chronological by prize month) ===');
const foodWins = allFoodWon.sort((a, b) => {
  const am = a.prizeMonth.replace(/^0/, '');
  const bm = b.prizeMonth.replace(/^0/, '');
  return am.localeCompare(bm, undefined, {numeric: true});
});
for (const e of foodWins) {
  const sub = foodSubcategory(e.en);
  console.log(`  Month ${e.prizeMonth.padEnd(3)} | ${e.jpy.toLocaleString().padStart(6)} JPY | ${String(e.entries).padStart(3)} cards | ${e.en} [${sub}] (entered ${e.entryMonth})`);
}
console.log();

// Monthly food entry pattern
const monthOrder = ['01-02','03','04','05','06','07','08','09','10','11','12'];
console.log('=== FOOD ENTRIES & WINS BY MONTH ===');
for (const m of monthOrder) {
  const monthFood = allFood.filter(e => e.entryMonth === m);
  const monthFoodWins = monthFood.filter(e => e.won);
  const postcards = monthFood.reduce((s,e) => s+e.entries, 0);
  const winValue = monthFoodWins.reduce((s,e) => s+e.jpy, 0);
  if (monthFood.length === 0) continue;
  const rate = (monthFoodWins.length / monthFood.length * 100).toFixed(1);
  console.log(`Month ${m.padEnd(5)}: ${String(monthFood.length).padStart(3)} items, ${String(postcards).padStart(5)} cards, ${String(monthFoodWins.length).padStart(2)} wins (${rate}%), value: ${winValue.toLocaleString()} JPY`);
  if (monthFoodWins.length > 0) {
    for (const w of monthFoodWins) {
      console.log(`           Won: ${w.en} (${w.entries} cards -> ${w.jpy.toLocaleString()} JPY, arrived ${w.prizeMonth})`);
    }
  }
}
console.log();

// Food drought analysis: longest gap between food wins by prize month
console.log('=== FOOD WIN TIMELINE & DROUGHTS ===');
const foodWinMonths = foodWins.map(e => {
  let m = e.prizeMonth;
  if (m === '01-02') return 1.5;
  return parseInt(m);
}).sort((a,b) => a-b);

let prevMonth = 0;
const droughts = [];
for (const m of foodWinMonths) {
  if (prevMonth > 0) {
    const gap = m - prevMonth;
    if (gap > 0) droughts.push({ from: prevMonth, to: m, gap });
  }
  prevMonth = m;
}
droughts.sort((a,b) => b.gap - a.gap);
console.log('Months with food wins:', [...new Set(foodWinMonths.map(m => m === 1.5 ? 'Jan-Feb' : `Month ${m}`))].join(', '));
console.log('Longest gaps between food wins:');
for (const d of droughts.slice(0, 5)) {
  const fromStr = d.from === 1.5 ? 'Jan-Feb' : `Month ${d.from}`;
  const toStr = d.to === 1.5 ? 'Jan-Feb' : `Month ${d.to}`;
  console.log(`  ${fromStr} -> ${toStr} (${d.gap} month gap)`);
}
console.log();

// Edible vs not-actually-edible food wins
console.log('=== EDIBILITY OF FOOD WINS ===');
console.log('Could Nasubi actually eat/use these wins?');
for (const e of foodWins) {
  const en = e.en.toLowerCase();
  let edible = 'Yes';
  if (en.includes('dog food') || en.includes('cat food')) edible = 'NO - Pet food';
  if (en.includes('diet') && en.includes('tea')) edible = 'Yes (drink)';
  if (en.includes('furikake') || en.includes('seasoning') || en.includes('sauce') || en.includes('dressing') || en.includes('mayonnaise')) edible = 'Condiment only';
  console.log(`  ${edible.padEnd(18)} | ${e.en}`);
}
console.log();

// Caloric analysis - rough
console.log('=== FOOD WINS: SURVIVAL VALUE ===');
console.log('High survival value (substantial calories/nutrition):');
const highSurvival = foodWins.filter(e => {
  const en = e.en.toLowerCase();
  return en.includes('rice') || en.includes('natto') || en.includes('beef') || en.includes('steak') || en.includes('lobster') || en.includes('spaghetti') || en.includes('pasta') || en.includes('bread') || en.includes('ice cream') || en.includes('chocolate') || en.includes('duck') || en.includes('bean') || en.includes('strawberr') || en.includes('tomato') || en.includes('potato');
});
for (const e of highSurvival) {
  console.log(`  ${e.en} (${e.jpy.toLocaleString()} JPY, month ${e.prizeMonth})`);
}
console.log();

console.log('Low/no survival value (condiments, novelties, pet food):');
const lowSurvival = foodWins.filter(e => {
  const en = e.en.toLowerCase();
  return en.includes('dog food') || en.includes('furikake') || en.includes('mayonnaise') || en.includes('sauce') || en.includes('dressing') || en.includes('pickle') || en.includes('seasoning');
});
for (const e of lowSurvival) {
  console.log(`  ${e.en} (${e.jpy.toLocaleString()} JPY, month ${e.prizeMonth})`);
}
console.log();

// How many total food entries never won anything
const neverWonFood = allFood.filter(e => !e.won);
console.log('=== THE FOOD THAT NEVER CAME ===');
console.log(`Total food items entered but never won: ${neverWonFood.length} / ${allFood.length}`);
console.log('Most postcards sent for food items that never won:');
const neverWonSorted = neverWonFood.sort((a,b) => b.entries - a.entries);
for (const e of neverWonSorted.slice(0, 15)) {
  console.log(`  ${String(e.entries).padStart(4)} cards - ${e.en} (month ${e.entryMonth})`);
}

export { entries, foodSubcategory, isFoodBroad };
