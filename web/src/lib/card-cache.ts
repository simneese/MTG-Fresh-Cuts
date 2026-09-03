export type CachedCardData = {
  cacheKey: string;
  id: string;
  name: string;
  nameKey: string;
  type: string;
  typeLine?: string;
  rarity?: string;
  manaCost: string;
  manaValue: number;
  colors: string[];
  colorIdentity: string[];
  oracleText: string;
  keywords?: string[];
  imageUri?: string;
  backImageUri?: string;
  artist?: string;
  producedMana?: string[];
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  priceUsd?: string;
  priceUsdFoil?: string;
  priceUsdEtched?: string;
  edhrecRank?: number;
  scryfallUri: string;
  fetchedAt: number;
};

const DATABASE_NAME = 'mtg-fresh-cuts';
const STORE_NAME = 'cards';
const DATABASE_VERSION = 3;
export const CARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) database.deleteObjectStore(STORE_NAME);
      database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedCards(keys: string[]) {
  if (typeof indexedDB === 'undefined') return new Map<string, CachedCardData>();
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const entries = await Promise.all(
    keys.map(async (cacheKey) => {
      const card = await requestResult<CachedCardData | undefined>(store.get(cacheKey));
      return [cacheKey, card] as const;
    }),
  );
  database.close();
  return new Map(entries.filter((entry): entry is [string, CachedCardData] => Boolean(entry[1])));
}

export async function cacheCards(cards: CachedCardData[]) {
  if (typeof indexedDB === 'undefined' || cards.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  cards.forEach((card) => store.put(card));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}
