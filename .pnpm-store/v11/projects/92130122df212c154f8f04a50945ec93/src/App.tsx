'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, BookOpenText, Check, ChevronRight, ClipboardPaste, Crown, Database, Layers3, Leaf, LoaderCircle, RotateCcw, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { CARD_CACHE_TTL_MS, cacheCards, getCachedCards, type CachedCardData } from '@/lib/card-cache';
import { fetchCardsFromScryfall, loadBundledCatalog, lookupKey, primaryType, type CardLookup } from '@/lib/scryfall';
import DeckWorkspace from '@/DeckWorkspace';

type Format = 'commander' | 'standard' | 'modern' | 'custom';
type CardType = 'Creature' | 'Artifact' | 'Instant' | 'Sorcery' | 'Enchantment' | 'Land' | 'Other';
type ParsedCard = { key: string; name: string; quantity: number; original: string; lookup: CardLookup; cardData?: CachedCardData };

const SAMPLE_DECK = `1 Aesi, Tyrant of Gyre Strait
1 Sol Ring
1 Arcane Signet
1 Sakura-Tribe Elder
1 Coiling Oracle
1 Growth Spiral
1 Counterspell
1 Beast Within
1 Cultivate
1 Scute Swarm
1 Tireless Provisioner
1 Tatyova, Benthic Druid
1 Urban Evolution
12 Forest
12 Island`;

const FORMAT_RULES: Record<Format, { label: string; target: number }> = {
  commander: { label: 'Commander', target: 100 }, standard: { label: 'Standard', target: 60 },
  modern: { label: 'Modern', target: 60 }, custom: { label: 'Custom', target: 60 },
};

const TYPE_STYLES: Record<CardType, string> = {
  Creature: 'bg-emerald-300/10 text-emerald-200 border-emerald-300/20', Artifact: 'bg-slate-300/10 text-slate-200 border-slate-300/20',
  Instant: 'bg-sky-300/10 text-sky-200 border-sky-300/20', Sorcery: 'bg-rose-300/10 text-rose-200 border-rose-300/20',
  Enchantment: 'bg-violet-300/10 text-violet-200 border-violet-300/20', Land: 'bg-amber-300/10 text-amber-100 border-amber-300/20',
  Other: 'bg-zinc-300/10 text-zinc-300 border-zinc-300/20',
};

const SECTION_HEADERS = new Set(['deck', 'mainboard', 'main deck', 'commander', 'sideboard', 'maybeboard', 'creatures', 'artifacts', 'instants', 'sorceries', 'enchantments', 'lands']);

function normalizeName(name: string) {
  let normalized = name.trim();

  // Deck exporters sometimes write split, adventure, room, and transforming
  // cards with one slash. Scryfall's combined card names use a double slash.
  normalized = normalized.replace(/\s+\/\s+/g, ' // ');

  // Remove export annotations that describe a printing rather than the card name.
  // Examples: "Sol Ring (CMM) 396", "Sol Ring [CMM] 396", and
  // "Sol Ring [CMM:396]". Collector numbers may contain letters or hyphens.
  normalized = normalized.replace(/\s+\*(?:F|E|P)\*\s*$/i, '').trim();
  normalized = normalized.replace(/\s+\[(?:foil|etched|promo)\]\s*$/i, '').trim();
  normalized = normalized.replace(
    /\s+(?:\([^)]{2,40}\)|\[[^\]]{2,40}\])\s+[A-Za-z0-9★][A-Za-z0-9★._-]*\s*$/,
    '',
  );
  normalized = normalized.replace(
    /\s+[\[(][A-Za-z0-9]{2,12}\s*:\s*[A-Za-z0-9★][A-Za-z0-9★._-]*[\])]\s*$/i,
    '',
  );

  // Set-only suffixes are also common when a collector number is omitted.
  normalized = normalized.replace(/\s+\[[A-Za-z0-9]{2,12}\]\s*$/i, '');
  normalized = normalized.replace(/\s+\([A-Za-z0-9]{2,12}\)\s*$/i, '');
  return normalized.trim();
}

function parseCardLookup(rawName: string): CardLookup {
  const finish = /\*(F|E)\*\s*$/i.test(rawName) || /\[(foil|etched)\]\s*$/i.test(rawName)
    ? (/\*E\*|\[etched\]/i.test(rawName) ? 'etched' : 'foil') : 'normal';
  const pair = rawName.match(/\s+(?:\(([A-Za-z0-9]{2,12})\)|\[([A-Za-z0-9]{2,12})\])\s+([A-Za-z0-9★][A-Za-z0-9★._-]*)\s*(?:\*(?:F|E|P)\*|\[(?:foil|etched|promo)\])?\s*$/i);
  const compact = rawName.match(/\s+\[([A-Za-z0-9]{2,12})\s*:\s*([A-Za-z0-9★][A-Za-z0-9★._-]*)\]\s*(?:\*(?:F|E|P)\*|\[(?:foil|etched|promo)\])?\s*$/i);
  return { name: normalizeName(rawName), setCode: pair?.[1] ?? pair?.[2] ?? compact?.[1], collectorNumber: pair?.[3] ?? compact?.[2], finish };
}

function parseDeckList(input: string) {
  const cards = new Map<string, ParsedCard>();
  const errors: string[] = [];
  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return;
    if (SECTION_HEADERS.has(line.replace(/:$/, '').toLowerCase())) return;
    const match = line.match(/^(?:(\d+)\s*x?\s+)?(.+?)\s*$/i);
    if (!match) { errors.push(`Line ${index + 1}: ${line}`); return; }
    const quantity = Number(match[1] ?? 1);
    const lookup = parseCardLookup(match[2]);
    const name = lookup.name;
    if (!name || !Number.isInteger(quantity) || quantity < 1) { errors.push(`Line ${index + 1}: ${line}`); return; }
    const key = lookupKey(lookup);
    const existing = cards.get(key);
    cards.set(key, { key, name: existing?.name ?? name, quantity: (existing?.quantity ?? 0) + quantity, original: line, lookup });
  });
  return { cards: [...cards.values()], errors };
}

function ManaCost({ value }: { value: string }) {
  if (value === '—') return <span className="text-zinc-600">—</span>;
  const symbols = value.match(/\{[^}]+\}/g) ?? [value];
  return <span className="flex flex-wrap justify-end gap-1" aria-label={`Mana cost ${value}`}>
    {symbols.map((symbol, index) => {
      const text = symbol.replace(/[{}]/g, '');
      const color = text.includes('G') ? 'bg-emerald-200 text-emerald-950' : text.includes('U') ? 'bg-sky-200 text-sky-950' : text.includes('R') ? 'bg-red-200 text-red-950' : text.includes('B') ? 'bg-zinc-400 text-zinc-950' : text.includes('W') ? 'bg-amber-50 text-amber-950' : 'bg-zinc-200 text-zinc-900';
      return <span key={`${symbol}-${index}`} className={`grid size-5 place-items-center rounded-full text-[10px] font-bold shadow-inner ${color}`}>{text}</span>;
    })}
  </span>;
}

function cardDetails(card: ParsedCard) {
  return card.cardData;
}

export default function Home() {
  const [screen, setScreen] = useState<'import' | 'deck'>('import');
  const [deckName, setDeckName] = useState('');
  const [deckText, setDeckText] = useState(SAMPLE_DECK);
  const [format, setFormat] = useState<Format>('commander');
  const [customTarget, setCustomTarget] = useState(60);
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [commander, setCommander] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | CardType>('All');
  const [sort, setSort] = useState<'name' | 'quantity' | 'mana'>('name');
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [cardDataError, setCardDataError] = useState('');
  const [cacheHits, setCacheHits] = useState(0);
  const [bundledHits, setBundledHits] = useState(0);
  const [notFound, setNotFound] = useState<string[]>([]);
  const cardCount = cards.reduce((sum, card) => sum + card.quantity, 0);
  const target = format === 'custom' ? customTarget : FORMAT_RULES[format].target;
  const difference = target - cardCount;
  const resolvedCount = cards.filter((card) => cardDetails(card)).length;

  const visibleCards = useMemo(() => [...cards]
    .filter((card) => card.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((card) => typeFilter === 'All' || cardDetails(card)?.type === typeFilter)
    .sort((a, b) => sort === 'quantity' ? b.quantity - a.quantity : sort === 'mana' ? (cardDetails(a)?.manaValue ?? 999) - (cardDetails(b)?.manaValue ?? 999) : a.name.localeCompare(b.name)),
  [cards, search, sort, typeFilter]);

  const types = useMemo(() => {
    const totals = new Map<CardType, number>();
    cards.forEach((card) => { const type = (cardDetails(card)?.type ?? 'Other') as CardType; totals.set(type, (totals.get(type) ?? 0) + card.quantity); });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [cards]);

  async function importDeck() {
    const result = parseDeckList(deckText);
    setCards(result.cards); setErrors(result.errors); setSearch(''); setTypeFilter('All');
    setCardDataError(''); setNotFound([]); setCacheHits(0); setBundledHits(0);
    if (!result.cards.some((card) => card.name === commander)) setCommander('');
    if (result.cards.length === 0) return;

    setIsLoadingCards(true);
    try {
      const keys = result.cards.map((card) => card.key);
      const [bundled, cached] = await Promise.all([loadBundledCatalog(), getCachedCards(keys)]);
      const now = Date.now();
      const freshNames = new Set<string>();
      cached.forEach((card, nameKey) => {
        if (now - card.fetchedAt < CARD_CACHE_TTL_MS) freshNames.add(nameKey);
      });
      setCacheHits(freshNames.size);
      const bundledNameKeys = new Set(result.cards.map((card) => card.key).filter((key) => bundled.has(key)));
      setBundledHits(bundledNameKeys.size);

      const withCachedData = result.cards.map((card) => ({
        ...card,
        cardData: (() => { const data = cached.get(card.key) ?? bundled.get(card.key); return data ? { ...data, type: primaryType(data.typeLine ?? data.type) } : undefined; })(),
      }));
      setCards(withCachedData);

      const missingNames = result.cards
        .filter((card) => !freshNames.has(card.key) && !bundledNameKeys.has(card.key))
        .map((card) => card.lookup);
      if (missingNames.length === 0) return;

      const payload = await fetchCardsFromScryfall(missingNames);
      await cacheCards(payload.cards);
      const fetched = new Map<string, CachedCardData>();
      payload.cards.forEach((card) => {
        fetched.set(card.cacheKey, card);
      });
      setCards(withCachedData.map((card) => ({
        ...card,
        cardData: fetched.get(card.key) ?? card.cardData,
      })));
      setNotFound(payload.notFound ?? []);
    } catch (error) {
      setCardDataError(error instanceof Error ? error.message : 'Card data could not be loaded.');
    } finally {
      setIsLoadingCards(false);
    }
  }
  function resetDeck() { setCards([]); setErrors([]); setCommander(''); setSearch(''); setTypeFilter('All'); setCardDataError(''); setNotFound([]); setCacheHits(0); setBundledHits(0); setScreen('import'); }

  if (screen === 'deck') return <DeckWorkspace deckName={deckName.trim()} formatLabel={FORMAT_RULES[format].label} commander={commander} cards={cards} cardCount={cardCount} target={target} onBack={() => setScreen('import')} />;

  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-white/8 bg-[#0b0d0c]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-lime-300/20 bg-lime-300/10 text-lime-300 shadow-[0_0_28px_rgba(190,242,100,.08)]"><Leaf className="size-5" /></div>
          <div><p className="font-heading text-base font-semibold tracking-[-0.02em]">MTG Fresh Cuts</p><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Deck workshop</p></div>
        </div>
        <Badge variant="outline" className="border-lime-300/20 bg-lime-300/5 text-lime-200"><Sparkles data-icon="inline-start" /> Preview build</Badge>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1480px] gap-0 lg:grid-cols-[400px_minmax(0,1fr)]">
      <section className="border-b border-white/8 bg-[#101311] px-5 py-7 lg:min-h-[calc(100vh-73px)] lg:border-b-0 lg:border-r lg:px-7">
        <div className="mb-7">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-lime-300"><ClipboardPaste className="size-3.5" /> Import</p>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.045em] text-white">Bring your deck<br />to the workbench.</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">Paste a deck list, choose the format, and we’ll organize it into a clean working view.</p>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-xs font-medium text-zinc-400">Format
              <NativeSelect className="w-full" value={format} onChange={(event) => setFormat(event.target.value as Format)}>
                {Object.entries(FORMAT_RULES).map(([value, rule]) => <NativeSelectOption key={value} value={value}>{rule.label}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            {format === 'custom' ? <label className="space-y-2 text-xs font-medium text-zinc-400">Target size
              <input className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50" type="number" min={1} value={customTarget} onChange={(event) => setCustomTarget(Math.max(1, Number(event.target.value)))} />
            </label> : <div className="space-y-2 text-xs font-medium text-zinc-400">Deck size<div className="flex h-8 items-center rounded-lg border border-white/8 bg-white/[0.025] px-2.5 text-sm text-zinc-300">{target} cards</div></div>}
          </div>
          <label className="block space-y-2 text-xs font-medium text-zinc-400">Deck list
            <Textarea value={deckText} onChange={(event) => setDeckText(event.target.value)} spellCheck={false} className="min-h-[330px] resize-y border-white/10 bg-[#090b0a] px-4 py-3 font-mono text-[13px] leading-6 text-zinc-300 placeholder:text-zinc-700" placeholder={'1 Sol Ring\n1 Arcane Signet\n12 Forest'} />
          </label>
          <div className="flex gap-2">
            <Button size="lg" onClick={importDeck} disabled={!deckText.trim() || isLoadingCards} className="h-11 flex-1 bg-lime-300 text-[#11150d] hover:bg-lime-200">{isLoadingCards ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Loading cards…</> : <>Import deck <ChevronRight data-icon="inline-end" /></>}</Button>
            <Button size="icon-lg" variant="outline" className="h-11 w-11 border-white/10 bg-transparent text-zinc-400" onClick={resetDeck} aria-label="Clear imported deck"><RotateCcw /></Button>
          </div>
          <p className="flex gap-2 text-xs leading-5 text-zinc-600"><BookOpenText className="mt-0.5 size-3.5 shrink-0" />Built-in card data loads first. Missing cards are requested in batches and cached on this device for at least 24 hours.</p>
        </div>
      </section>

      <section className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        {cards.length === 0 ? <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 text-center">
          <div className="max-w-sm"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.035] text-zinc-500"><Layers3 className="size-6" /></div><h2 className="font-heading text-xl font-semibold text-zinc-200">Your deck view is ready</h2><p className="mt-2 text-sm leading-6 text-zinc-600">Import the sample list or replace it with your own. Every parsed card will appear here, even before card data is resolved.</p></div>
        </div> : <div>
          <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">Current deck</p><div className="flex flex-wrap items-center gap-3"><h2 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-white">Untitled deck</h2><Badge variant="outline" className="border-white/10 text-zinc-400">{FORMAT_RULES[format].label}</Badge></div></div>
            <div className={`min-w-[240px] rounded-2xl border px-4 py-3 ${difference === 0 ? 'border-emerald-300/20 bg-emerald-300/5' : 'border-amber-300/20 bg-amber-300/5'}`}>
              <div className="flex items-center justify-between gap-5"><div><p className="text-xs text-zinc-500">Deck count</p><p className="mt-0.5 text-sm font-medium text-zinc-200">{difference === 0 ? 'Target met' : difference > 0 ? `Add ${difference} cards` : `Cut ${Math.abs(difference)} cards`}</p></div><div className="text-right"><span className="font-mono text-2xl font-semibold text-white">{cardCount}</span><span className="font-mono text-sm text-zinc-600"> / {target}</span></div></div>
            </div>
          </div>
          {cardDataError && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-300/20 bg-red-300/5 px-4 py-3 text-sm text-red-200"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{cardDataError} Parsed cards remain available below.</span></div>}
          {format === 'commander' && <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-lime-300/15 bg-lime-300/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-lime-300/10 text-lime-300"><Crown className="size-4" /></div><div><p className="text-sm font-medium text-zinc-200">Choose your commander</p><p className="text-xs text-zinc-600">Used later for color identity and synergy.</p></div></div>
            <NativeSelect className="w-full sm:w-[260px]" value={commander} onChange={(event) => setCommander(event.target.value)} aria-label="Commander"><NativeSelectOption value="">Select a card…</NativeSelectOption>{cards.map((card) => <NativeSelectOption key={card.key} value={card.name}>{card.name}</NativeSelectOption>)}</NativeSelect>
          </div>}
          <div className="mb-6 grid gap-3 rounded-2xl border border-white/8 bg-[#101311] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-2 text-xs font-medium text-zinc-400">Deck name
              <input className="h-10 w-full rounded-lg border border-white/10 bg-[#090b0a] px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-lime-300/40 focus:ring-3 focus:ring-lime-300/10" value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder="Name this deck" />
            </label>
            <Button className="h-10 bg-lime-300 text-[#11150d] hover:bg-lime-200" disabled={!deckName.trim() || isLoadingCards || (format === 'commander' && !commander)} onClick={() => setScreen('deck')}>Open deck view <ChevronRight data-icon="inline-end" /></Button>
            {format === 'commander' && !commander && <p className="text-[10px] text-zinc-600 sm:col-span-2">Choose a commander before opening the deck view.</p>}
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.025] pl-9 pr-3 text-sm outline-none placeholder:text-zinc-700 focus:border-lime-300/40 focus:ring-3 focus:ring-lime-300/10" placeholder="Search this deck" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <NativeSelect className="w-full sm:w-[150px]" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'All' | CardType)} aria-label="Filter by type"><NativeSelectOption value="All">All types</NativeSelectOption>{types.map(([type, count]) => <NativeSelectOption key={type} value={type}>{type} ({count})</NativeSelectOption>)}</NativeSelect>
            <NativeSelect className="w-full sm:w-[150px]" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort cards"><NativeSelectOption value="name">Name A–Z</NativeSelectOption><NativeSelectOption value="quantity">Quantity</NativeSelectOption><NativeSelectOption value="mana">Mana value</NativeSelectOption></NativeSelect>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#101311]">
            <div className="grid grid-cols-[54px_minmax(0,1fr)_110px_70px] border-b border-white/8 bg-white/[0.02] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600 sm:grid-cols-[62px_minmax(0,1fr)_130px_100px] sm:px-5"><span>Qty</span><span>Card</span><span>Type</span><span className="text-right">Cost</span></div>
            <div className="divide-y divide-white/[0.055]">{visibleCards.map((card) => { const details = cardDetails(card); const type = (details?.type ?? 'Other') as CardType; return <div key={card.key} className="group grid grid-cols-[54px_minmax(0,1fr)_110px_70px] items-center px-4 py-3 transition-colors hover:bg-white/[0.025] sm:grid-cols-[62px_minmax(0,1fr)_130px_100px] sm:px-5">
              <span className="font-mono text-sm text-zinc-500">{card.quantity}×</span><div className="min-w-0 pr-3"><p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{card.name}{commander === card.name && <Crown className="ml-2 inline size-3.5 text-lime-300" aria-label="Commander" />}</p>{!details && <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-300/60"><AlertCircle className="size-3" /> Card not found</p>}</div><Badge variant="outline" className={`max-w-fit ${TYPE_STYLES[type]}`}>{details?.type ?? 'Unknown'}</Badge><ManaCost value={details?.manaCost ?? '—'} />
            </div>})}</div>
            {visibleCards.length === 0 && <div className="px-6 py-12 text-center text-sm text-zinc-600">No cards match these filters.</div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600"><p>Showing {visibleCards.length} of {cards.length} unique cards · {resolvedCount} resolved{bundledHits > 0 ? ` · ${bundledHits} built in` : ''}{cacheHits > 0 ? ` · ${cacheHits} cached` : ''}</p>{errors.length > 0 || notFound.length > 0 ? <p className="flex items-center gap-1.5 text-amber-300/70"><AlertCircle className="size-3.5" /> {errors.length + notFound.length} item{errors.length + notFound.length === 1 ? '' : 's'} need attention</p> : <p className="flex items-center gap-1.5 text-emerald-300/70"><Database className="size-3.5" /> Card data ready</p>}</div>
        </div>}
      </section>
    </div>
  </main>;
}
