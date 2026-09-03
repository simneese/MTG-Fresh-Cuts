import type { CachedCardData } from './card-cache';

const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const SEARCH_URL = 'https://api.scryfall.com/cards/search';
const BATCH_SIZE = 75;
const REQUEST_DELAY_MS = 120;

export type CardLookup = {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  finish?: 'normal' | 'foil' | 'etched';
};
type ScryfallCard = {
  id: string;
  name: string;
  type_line: string;
  rarity: string;
  artist?: string;
  produced_mana?: string[];
  keywords?: string[];
  mana_cost?: string;
  cmc: number;
  colors?: string[];
  color_identity: string[];
  oracle_text?: string;
  image_uris?: { normal?: string };
  card_faces?: Array<{
    mana_cost?: string;
    oracle_text?: string;
    image_uris?: { normal?: string };
  }>;
  scryfall_uri: string;
  set: string;
  set_name: string;
  collector_number: string;
  edhrec_rank?: number | null;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  };
};

export function lookupKey(lookup: CardLookup) {
  return lookup.setCode && lookup.collectorNumber
    ? `print:${lookup.setCode.toLowerCase()}:${lookup.collectorNumber.toLowerCase()}:${lookup.finish ?? 'normal'}`
    : `cheap:${lookup.name.toLowerCase()}`;
}
export function primaryType(typeLine: string) {
  const type = typeLine.split('//')[0].split('—')[0];
  if (type.includes('Creature')) return 'Creature';
  if (type.includes('Land')) return 'Land';
  if (type.includes('Artifact')) return 'Artifact';
  if (type.includes('Instant')) return 'Instant';
  if (type.includes('Sorcery')) return 'Sorcery';
  if (type.includes('Enchantment')) return 'Enchantment';
  return 'Other';
}
function normalizeCard(card: ScryfallCard, cacheKey: string): CachedCardData {
  const faces = card.card_faces ?? [];
  return {
    cacheKey,
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
function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function lowestPrice(card: ScryfallCard) {
  return Number(card.prices?.usd ?? Number.POSITIVE_INFINITY);
}

export async function loadBundledCatalog() {
  const response = await fetch(new URL('card-catalog.json', document.baseURI));
  if (!response.ok) return new Map<string, CachedCardData>();
  const cards = (await response.json()) as CachedCardData[];
  const catalog = new Map<string, CachedCardData>();
  cards.forEach((card) => {
    if (!card.cacheKey) return;
    const normalized = {
      ...card,
      type: primaryType(card.typeLine ?? card.type),
    };
    catalog.set(normalized.cacheKey, normalized);
    catalog.set(`cheap:${normalized.nameKey}`, normalized);
    catalog.set(
      `cheap:${normalized.nameKey.split(/\s+\/\/\s+/)[0]}`,
      normalized,
    );
  });
  return catalog;
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (response.status === 429)
    throw new Error(
      'Scryfall is rate limiting requests. Importing has paused; please try again later.',
    );
  if (!response.ok)
    throw new Error('Scryfall card data is temporarily unavailable.');
  return response.json();
}
export async function fetchCardsFromScryfall(lookups: CardLookup[]) {
  const unique = [
    ...new Map(lookups.map((lookup) => [lookupKey(lookup), lookup])).values(),
  ];
  const exact = unique.filter(
    (lookup) => lookup.setCode && lookup.collectorNumber,
  );
  const cheapest = unique.filter(
    (lookup) => !lookup.setCode || !lookup.collectorNumber,
  );
  const cards: CachedCardData[] = [];
  const notFound: string[] = [];
  for (let index = 0; index < exact.length; index += BATCH_SIZE) {
    if (index > 0) await sleep(REQUEST_DELAY_MS);
    const batch = exact.slice(index, index + BATCH_SIZE);
    const result = (await requestJson(COLLECTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json;q=0.9,*/*;q=0.8',
      },
      body: JSON.stringify({
        identifiers: batch.map((lookup) => ({
          set: lookup.setCode?.toLowerCase(),
          collector_number: lookup.collectorNumber,
        })),
      }),
    })) as {
      data: ScryfallCard[];
      not_found?: Array<{ set?: string; collector_number?: string }>;
    };
    result.data.forEach((card) => {
      const match = batch.find(
        (lookup) =>
          lookup.setCode?.toLowerCase() === card.set &&
          lookup.collectorNumber?.toLowerCase() ===
            card.collector_number.toLowerCase(),
      );
      cards.push(
        normalizeCard(
          card,
          lookupKey(
            match ?? {
              name: card.name,
              setCode: card.set,
              collectorNumber: card.collector_number,
            },
          ),
        ),
      );
    });
    notFound.push(
      ...(result.not_found ?? []).map(
        (item) => `${item.set ?? '?'} ${item.collector_number ?? '?'}`,
      ),
    );
  }
  for (const lookup of cheapest) {
    if (cards.length || exact.length) await sleep(REQUEST_DELAY_MS);
    const frontName = lookup.name
      .split(/\s+\/\/\s+/)[0]
      .trim()
      .replace(/"/g, '\\"');
    const params = new URLSearchParams({
      q: `!"${frontName}" game:paper`,
      unique: 'prints',
      order: 'usd',
      dir: 'asc',
    });
    try {
      const result = (await requestJson(`${SEARCH_URL}?${params}`)) as {
        data: ScryfallCard[];
      };
      const priced = result.data
        .filter((card) => Number.isFinite(lowestPrice(card)))
        .sort((a, b) => lowestPrice(a) - lowestPrice(b));
      const selected = priced[0] ?? result.data[0];
      if (selected) cards.push(normalizeCard(selected, lookupKey(lookup)));
      else notFound.push(lookup.name);
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limiting'))
        throw error;
      notFound.push(lookup.name);
    }
  }
  return { cards, notFound };
}
