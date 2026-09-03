import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

const root = process.cwd();
const seedPath = path.join(root, 'data', 'card-seeds.txt');
const catalogPath = path.join(root, 'public', 'card-catalog.json');
const bulkDataUrl = 'https://api.scryfall.com/bulk-data';
const cardLimit = Number(process.env.CATALOG_CARD_LIMIT ?? 3000);
const commanderLimit = Number(process.env.CATALOG_COMMANDER_LIMIT ?? 500);
const requestHeaders = {
  Accept: 'application/json;q=0.9,*/*;q=0.8',
  'User-Agent':
    'MTG Fresh Cuts catalog builder/0.2 (https://github.com/simneese/MTG-Fresh-Cuts)',
};

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

function normalizeCard(card, requestedName = card.name) {
  const faces = card.card_faces ?? [];
  return {
    cacheKey: `cheap:${requestedName.toLowerCase()}`,
    id: card.id,
    name: card.name,
    nameKey: card.name.toLowerCase(),
    type: primaryType(card.type_line),
    typeLine: card.type_line,
    rarity: card.rarity,
    manaCost:
      card.mana_cost ||
      faces
        .map((face) => face.mana_cost)
        .filter(Boolean)
        .join(' // ') ||
      '—',
    manaValue: card.cmc,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity,
    oracleText:
      card.oracle_text ||
      faces
        .map((face) => face.oracle_text)
        .filter(Boolean)
        .join('\n//\n'),
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
    edhrecRank: card.edhrec_rank ?? null,
    scryfallUri: card.scryfall_uri,
    fetchedAt: Date.now(),
  };
}

function normalPrice(card) {
  const price = Number(card.prices?.usd);
  return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY;
}

function cheapestPrinting(cards) {
  return [...cards].sort((a, b) => {
    const priceDifference = normalPrice(a) - normalPrice(b);
    if (Number.isFinite(priceDifference) && priceDifference !== 0)
      return priceDifference;
    if (Number.isFinite(normalPrice(a))) return -1;
    if (Number.isFinite(normalPrice(b))) return 1;
    return String(b.released_at ?? '').localeCompare(
      String(a.released_at ?? ''),
    );
  })[0];
}

async function requestJson(url, label) {
  const response = await fetch(url, { headers: requestHeaders });
  if (response.status === 429)
    throw new Error('Scryfall rate limit reached. Stop and try again later.');
  if (!response.ok)
    throw new Error(`${label} request failed with ${response.status}.`);
  return response.json();
}

const bulkManifest = await requestJson(
  bulkDataUrl,
  'Scryfall bulk-data manifest',
);
const defaultCards = bulkManifest.data.find(
  (entry) => entry.type === 'default_cards',
);
if (!defaultCards?.jsonl_download_uri)
  throw new Error('Scryfall did not provide a Default Cards bulk download.');

console.log('Downloading Scryfall Default Cards bulk data…');
const printingsByOracleId = new Map();
const bulkResponse = await fetch(defaultCards.jsonl_download_uri, {
  headers: requestHeaders,
});
if (!bulkResponse.ok || !bulkResponse.body)
  throw new Error(
    `Scryfall Default Cards bulk download failed with ${bulkResponse.status}.`,
  );
const lines = createInterface({
  input: Readable.fromWeb(bulkResponse.body).pipe(createGunzip()),
  crlfDelay: Number.POSITIVE_INFINITY,
});
for await (const line of lines) {
  if (!line.trim()) continue;
  const card = JSON.parse(line);
  if (card.lang !== 'en' || !card.games?.includes('paper') || !card.oracle_id)
    continue;
  const printings = printingsByOracleId.get(card.oracle_id) ?? [];
  printings.push(card);
  printingsByOracleId.set(card.oracle_id, printings);
}

const oracleCards = [...printingsByOracleId.values()].map((printings) => ({
  printings,
  representative: cheapestPrinting(printings),
  rank: Math.min(
    ...printings
      .map((card) => card.edhrec_rank)
      .filter((rank) => Number.isFinite(rank)),
    Number.POSITIVE_INFINITY,
  ),
}));
const ranked = oracleCards
  .filter((entry) => Number.isFinite(entry.rank))
  .sort((a, b) => a.rank - b.rank);
const popularCards = ranked.slice(0, cardLimit);
const popularCommanders = ranked
  .filter(({ representative }) =>
    /Legendary[^—]*Creature/.test(representative.type_line),
  )
  .slice(0, commanderLimit);
const basicLands = oracleCards.filter(({ representative }) =>
  representative.type_line.startsWith('Basic Land'),
);

let existing = [];
try {
  existing = JSON.parse(await readFile(catalogPath, 'utf8'));
} catch {
  existing = [];
}
let seedNames = [];
try {
  seedNames = (await readFile(seedPath, 'utf8')).split(/\r?\n/);
} catch {
  seedNames = [];
}
seedNames.push(...process.argv.slice(2));
const requestedNames = new Set(
  seedNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
);
const seededCards = oracleCards.filter(({ representative, printings }) => {
  const names = new Set([
    representative.name.toLowerCase(),
    ...printings.map((card) => card.name.toLowerCase()),
  ]);
  return [...requestedNames].some((name) => names.has(name));
});

const selectedByOracleId = new Map();
for (const entry of [
  ...popularCards,
  ...popularCommanders,
  ...basicLands,
  ...seededCards,
]) {
  selectedByOracleId.set(entry.representative.oracle_id, entry);
}

const catalog = new Map(
  existing.map((card) => [card.cacheKey ?? `cheap:${card.nameKey}`, card]),
);
for (const { representative } of selectedByOracleId.values()) {
  const normalized = normalizeCard(representative);
  catalog.set(normalized.cacheKey, normalized);
}

const cards = [...catalog.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
);
await writeFile(catalogPath, `${JSON.stringify(cards, null, 2)}\n`, 'utf8');
console.log(
  `Catalog contains ${cards.length} cards from one bulk download (${popularCards.length} popular cards, ${popularCommanders.length} commanders).`,
);
