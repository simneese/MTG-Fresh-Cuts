import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const seedPath = path.join(root, 'data', 'card-seeds.txt');
const catalogPath = path.join(root, 'public', 'card-catalog.json');
const searchUrl = 'https://api.scryfall.com/cards/search';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function primaryType(typeLine) {
  const type = typeLine.split('//')[0].split('—')[0];
  if (type.includes('Creature')) return 'Creature';
  if (type.includes('Land')) return 'Land';
  if (type.includes('Artifact')) return 'Artifact';
  if (type.includes('Instant')) return 'Instant';
  if (type.includes('Sorcery')) return 'Sorcery';
  if (type.includes('Enchantment')) return 'Enchantment';
  return 'Other';
}

function normalizeCard(card, requestedName) {
  const faces = card.card_faces ?? [];
  return {
    cacheKey: `cheap:${requestedName.toLowerCase()}`,
    id: card.id,
    name: card.name,
    nameKey: card.name.toLowerCase(),
    type: primaryType(card.type_line),
    typeLine: card.type_line,
    rarity: card.rarity,
    manaCost: card.mana_cost || faces.map((face) => face.mana_cost).filter(Boolean).join(' // ') || '—',
    manaValue: card.cmc,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity,
    oracleText: card.oracle_text || faces.map((face) => face.oracle_text).filter(Boolean).join('\n//\n'),
    keywords: card.keywords ?? [],
    imageUri: card.image_uris?.normal ?? faces[0]?.image_uris?.normal,
    backImageUri: faces[1]?.image_uris?.normal,
    artist: card.artist,
    producedMana: card.produced_mana ?? [],
    setCode: card.set.toUpperCase(),
    setName: card.set_name,
    collectorNumber: card.collector_number,
    priceUsd: card.prices?.usd ?? undefined,
    priceUsdFoil: card.prices?.usd_foil ?? undefined,
    priceUsdEtched: card.prices?.usd_etched ?? undefined,
    scryfallUri: card.scryfall_uri,
    fetchedAt: Date.now(),
  };
}

const seedText = await readFile(seedPath, 'utf8');
const requestedNames = [
  ...seedText.split(/\r?\n/),
  ...process.argv.slice(2),
].map((name) => name.trim()).filter(Boolean);
const uniqueNames = [...new Map(requestedNames.map((name) => [name.toLowerCase(), name])).values()];

let existing = [];
try {
  existing = JSON.parse(await readFile(catalogPath, 'utf8'));
} catch {
  existing = [];
}
const catalog = new Map(existing.map((card) => [card.nameKey, card]));
const missing = uniqueNames.filter((name) => {
  const card = catalog.get(name.toLowerCase());
  return !card || !card.cacheKey || !card.rarity || !card.typeLine || !Array.isArray(card.producedMana) || !Array.isArray(card.keywords) || (card.typeLine.includes('//') && !card.backImageUri);
});
const lookupNames = [...new Map(missing.map((name) => { const front = name.split(/\s+\/\/\s+/)[0].trim(); return [front.toLowerCase(), front]; })).values()];

for (let index = 0; index < lookupNames.length; index += 1) {
  if (index > 0) await sleep(120);
  const requestedName = lookupNames[index];
  const query = new URLSearchParams({ q: `!"${requestedName.replace(/"/g, '\\"')}" game:paper`, unique: 'prints', order: 'usd', dir: 'asc' });
  const response = await fetch(`${searchUrl}?${query}`, {
    headers: {
      Accept: 'application/json;q=0.9,*/*;q=0.8',
      'User-Agent': 'MTG Fresh Cuts catalog builder/0.1 (https://mtg-fresh-cuts.merry-spool-8051.chatgpt.site)',
    },
  });
  if (response.status === 429) throw new Error('Scryfall rate limit reached. Stop and try again later.');
  if (!response.ok) throw new Error(`Scryfall request failed with ${response.status}.`);
  const result = await response.json();
  const priced = result.data.filter((card) => Number.isFinite(Number(card.prices?.usd))).sort((a, b) => Number(a.prices.usd) - Number(b.prices.usd));
  const selected = priced[0] ?? result.data[0];
  if (selected) catalog.set(selected.name.toLowerCase(), normalizeCard(selected, requestedName));
  else console.warn('Not found:', requestedName);
}

const cards = [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name));
await writeFile(catalogPath, `${JSON.stringify(cards, null, 2)}\n`, 'utf8');
console.log(`Catalog contains ${cards.length} cards (${lookupNames.length} requested from Scryfall).`);
