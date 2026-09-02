import { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, BarChart3, Check, Crown, DollarSign, Grid2X2, ImageIcon, Leaf, List, RefreshCw, Scissors, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { CachedCardData } from '@/lib/card-cache';
import CutWorkspace from '@/CutWorkspace';

export type WorkspaceCard = { key?: string; name: string; quantity: number; cardData?: CachedCardData };

type Props = {
  deckName: string;
  formatLabel: string;
  commander: string;
  cards: WorkspaceCard[];
  cardCount: number;
  target: number;
  onBack: () => void;
};

const COLORS = [
  { key: 'W', label: 'White', fill: '#f5e9c9' },
  { key: 'U', label: 'Blue', fill: '#6db9ef' },
  { key: 'B', label: 'Black', fill: '#8d8295' },
  { key: 'R', label: 'Red', fill: '#ef775f' },
  { key: 'G', label: 'Green', fill: '#69ba82' },
];
const RARITY_ORDER: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Mythic: 3 };
const CURVE_TARGET = [0.02, 0.1, 0.25, 0.28, 0.17, 0.1, 0.05, 0.03];
const KNOWN_KEYWORDS = ['flying', 'first strike', 'double strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'ward', 'flash', 'prowess', 'convoke', 'delve', 'cascade', 'landfall', 'cycling', 'kicker', 'equip', 'crew', 'toxic', 'infect', 'proliferate', 'scry', 'surveil', 'mill', 'treasure', 'investigate', 'discover'];

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
}
function cardPrice(card: WorkspaceCard) {
  const data = card.cardData;
  const finish = data?.cacheKey.split(':').at(-1);
  return finish === 'foil' ? data?.priceUsdFoil : finish === 'etched' ? data?.priceUsdEtched : data?.priceUsd ?? data?.priceUsdFoil ?? data?.priceUsdEtched;
}
function cardKeywords(card: WorkspaceCard) {
  if (card.cardData?.keywords?.length) return card.cardData.keywords.map((keyword) => keyword.toLowerCase());
  const text = card.cardData?.oracleText.toLowerCase() ?? '';
  return KNOWN_KEYWORDS.filter((keyword) => new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i').test(text));
}
function CardArtwork({ card }: { card: WorkspaceCard }) {
  const [showBack, setShowBack] = useState(false);
  const image = showBack ? card.cardData?.backImageUri : card.cardData?.imageUri;
  return <div className="relative h-full">{image ? <img className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" src={image} alt={`${card.name} ${showBack ? 'back' : 'front'} face`} loading="lazy" /> : <div className="grid h-full place-items-center px-4 text-center"><div><ImageIcon className="mx-auto size-7 text-zinc-700" /><p className="mt-3 text-xs text-zinc-500">Artwork unavailable</p></div></div>}{card.cardData?.backImageUri && <button type="button" onClick={() => setShowBack((value) => !value)} className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/85 px-2.5 py-1.5 text-[10px] font-medium text-white shadow-lg hover:bg-black focus:outline-none focus:ring-2 focus:ring-lime-300" aria-label={`Show ${showBack ? 'front' : 'back'} face of ${card.name}`}><RefreshCw className="size-3" /> {showBack ? 'Front' : 'Flip'}</button>}</div>;
}

function Distribution({ title, subtitle, values }: { title: string; subtitle: string; values: Record<string, number> }) {
  const total = COLORS.reduce((sum, color) => sum + (values[color.key] ?? 0), 0);
  return <article className="rounded-2xl border border-white/8 bg-[#101311] p-5">
    <h3 className="font-heading text-base font-semibold text-zinc-100">{title}</h3>
    <p className="mt-1 text-xs leading-5 text-zinc-600">{subtitle}</p>
    <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/5">
      {COLORS.map((color) => total > 0 && values[color.key] > 0 ? <span key={color.key} style={{ width: `${(values[color.key] / total) * 100}%`, background: color.fill }} /> : null)}
    </div>
    <div className="mt-4 grid grid-cols-5 gap-2">
      {COLORS.map((color) => <div key={color.key} className="text-center"><span className="mx-auto block size-2.5 rounded-full" style={{ background: color.fill }} /><p className="mt-1.5 font-mono text-sm text-zinc-200">{total ? Math.round((values[color.key] ?? 0) / total * 100) : 0}%</p><p className="text-[10px] text-zinc-600">{color.label}</p></div>)}
    </div>
  </article>;
}

export default function DeckWorkspace({ deckName, formatLabel, commander, cards, cardCount, target, onBack }: Props) {
  const [view, setView] = useState<'art' | 'text'>('art');
  const [groupBy, setGroupBy] = useState<'none' | 'type' | 'rarity'>('type');
  const [sortBy, setSortBy] = useState<'name' | 'mana' | 'price-high' | 'price-low'>('name');
  const [search, setSearch] = useState('');
  const [showCutNotice, setShowCutNotice] = useState(false);
  const [cutCriterion, setCutCriterion] = useState<'all' | 'curve' | 'synergy' | 'price'>('all');
  const [selectedCuts, setSelectedCuts] = useState<Set<string>>(new Set());

  const filteredCards = useMemo(() => cards.filter((card) => card.name.toLowerCase().includes(search.trim().toLowerCase())), [cards, search]);
  const groups = useMemo(() => {
    const map = new Map<string, WorkspaceCard[]>();
    filteredCards.forEach((card) => {
      const key = groupBy === 'type' ? (card.cardData?.type ?? 'Unknown') : groupBy === 'rarity' ? titleCase(card.cardData?.rarity ?? '') : 'All cards';
      map.set(key, [...(map.get(key) ?? []), card]);
    });
    return [...map.entries()].map(([label, entries]) => [label, entries.sort((a, b) => sortBy === 'mana' ? (a.cardData?.manaValue ?? 999) - (b.cardData?.manaValue ?? 999) || a.name.localeCompare(b.name) : sortBy === 'price-high' ? Number(cardPrice(b) ?? -1) - Number(cardPrice(a) ?? -1) : sortBy === 'price-low' ? Number(cardPrice(a) ?? Number.POSITIVE_INFINITY) - Number(cardPrice(b) ?? Number.POSITIVE_INFINITY) : a.name.localeCompare(b.name))] as const)
      .sort((a, b) => groupBy === 'none' ? 0 : groupBy === 'rarity' ? (RARITY_ORDER[a[0]] ?? 99) - (RARITY_ORDER[b[0]] ?? 99) || a[0].localeCompare(b[0]) : a[0].localeCompare(b[0]));
  }, [filteredCards, groupBy, sortBy]);

  const manaCurve = useMemo(() => {
    const buckets = Array.from({ length: 8 }, () => 0);
    cards.filter((card) => card.cardData?.type !== 'Land').forEach((card) => {
      const value = Math.min(7, Math.max(0, Math.floor(card.cardData?.manaValue ?? 0)));
      buckets[value] += card.quantity;
    });
    return buckets;
  }, [cards]);
  const maxCurve = Math.max(1, ...manaCurve);

  const spellColors = useMemo(() => {
    const result: Record<string, number> = {};
    cards.filter((card) => card.cardData?.type !== 'Land').forEach((card) => {
      const symbols = card.cardData?.manaCost.match(/\{([^}]+)\}/g) ?? [];
      symbols.forEach((symbol) => COLORS.forEach(({ key }) => { if (symbol.includes(key)) result[key] = (result[key] ?? 0) + card.quantity; }));
    });
    return result;
  }, [cards]);

  const sourceColors = useMemo(() => {
    const result: Record<string, number> = {};
    cards.forEach((card) => card.cardData?.producedMana?.forEach((color) => { if (COLORS.some(({ key }) => key === color)) result[color] = (result[color] ?? 0) + card.quantity; }));
    return result;
  }, [cards]);

  const difference = target - cardCount;
  const deckPrice = useMemo(() => cards.reduce((total, card) => total + Number(cardPrice(card) ?? 0) * card.quantity, 0), [cards]);
  const pricedCardCount = useMemo(() => cards.reduce((total, card) => total + (cardPrice(card) ? card.quantity : 0), 0), [cards]);
  const cutRecommendations = useMemo(() => {
    const eligible = cards.filter((card) => card.name !== commander && !card.cardData?.typeLine?.startsWith('Basic Land'));
    const maxPrice = Math.max(1, ...eligible.map((card) => Number(cardPrice(card) ?? 0)));
    const keywordFrequency = new Map<string, number>();
    eligible.forEach((card) => cardKeywords(card).forEach((keyword) => keywordFrequency.set(keyword, (keywordFrequency.get(keyword) ?? 0) + card.quantity)));
    const commanderKeywords = new Set(cardKeywords(cards.find((card) => card.name === commander) ?? { name: '', quantity: 0 }));
    const nonlandTotal = Math.max(1, manaCurve.reduce((sum, count) => sum + count, 0));
    return eligible.map((card) => {
      const bucket = Math.min(7, Math.max(0, Math.floor(card.cardData?.manaValue ?? 0)));
      const actualShare = manaCurve[bucket] / nonlandTotal;
      const curve = card.cardData?.type === 'Land' ? 0 : Math.min(1, Math.max(0, (actualShare - CURVE_TARGET[bucket]) / Math.max(0.08, CURVE_TARGET[bucket])));
      const keywords = cardKeywords(card);
      const deckSupport = keywords.length ? keywords.reduce((sum, keyword) => sum + Math.min(1, (keywordFrequency.get(keyword) ?? 0) / Math.max(4, cardCount * 0.12)), 0) / keywords.length : 0;
      const commanderOverlap = keywords.length ? keywords.filter((keyword) => commanderKeywords.has(keyword)).length / keywords.length : 0;
      const synergy = Math.min(1, deckSupport * 0.55 + commanderOverlap * 0.45);
      const lowSynergy = 1 - synergy;
      const price = Number(cardPrice(card) ?? 0) / maxPrice;
      const all = curve * 0.45 + lowSynergy * 0.35 + price * 0.2;
      const reasons = [curve > 0.2 ? `MV ${bucket} is above the target curve` : '', lowSynergy > 0.65 ? 'Few shared keywords' : '', price > 0.5 ? 'High-value printing' : ''].filter(Boolean);
      return { card, all, curve, synergy: lowSynergy, price, reasons: reasons.length ? reasons : ['Lower combined fit score'] };
    });
  }, [cards, commander, manaCurve, cardCount]);
  const visibleCutRecommendations = useMemo(() => [...cutRecommendations].sort((a, b) => b[cutCriterion] - a[cutCriterion]), [cutRecommendations, cutCriterion]);
  const selectedCutCount = [...selectedCuts].reduce((sum, key) => sum + (cards.find((card) => (card.key ?? card.name) === key)?.quantity ?? 0), 0);
  if (showCutNotice) return <CutWorkspace deckName={deckName} commander={commander} cards={cards} cardCount={cardCount} target={target} onBack={() => setShowCutNotice(false)} />;
  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[#0b0d0c]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Return to deck import"><ArrowLeft /></Button><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-lime-300/20 bg-lime-300/10 text-lime-300"><Leaf className="size-5" /></div><div className="min-w-0"><h1 className="truncate font-heading text-lg font-semibold text-white">{deckName}</h1><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{formatLabel} · {cardCount} cards</p></div></div>
        <Button className="bg-lime-300 text-[#11150d] hover:bg-lime-200" onClick={() => setShowCutNotice(true)}><Scissors data-icon="inline-start" /> Make cuts</Button>
      </div>
    </header>

    <div className="mx-auto max-w-[1540px] px-5 py-7 sm:px-8 lg:py-10">
      <section className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px_240px]">
        <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-white/10 text-zinc-400">{formatLabel}</Badge>{commander && <Badge variant="outline" className="border-lime-300/20 bg-lime-300/5 text-lime-200"><Crown data-icon="inline-start" /> {commander}</Badge>}</div><h2 className="mt-4 font-heading text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">See the shape of your deck.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">Review the curve, color balance, and every card before deciding what earns a slot.</p></div>
        <div className={`rounded-2xl border p-5 ${difference === 0 ? 'border-emerald-300/20 bg-emerald-300/5' : 'border-amber-300/20 bg-amber-300/5'}`}><p className="text-xs text-zinc-500">Deck target</p><p className="mt-1 font-mono text-3xl font-semibold text-white">{cardCount}<span className="text-base text-zinc-600"> / {target}</span></p><p className="mt-2 text-sm text-zinc-300">{difference === 0 ? 'Target met' : difference > 0 ? `Add ${difference} cards` : `Cut ${Math.abs(difference)} cards`}</p></div>
        <div className="rounded-2xl border border-white/8 bg-[#101311] p-5"><p className="flex items-center gap-1.5 text-xs text-zinc-500"><DollarSign className="size-3.5 text-lime-300" /> Total deck price</p><p className="mt-1 font-mono text-3xl font-semibold text-white">${deckPrice.toFixed(2)}</p><p className="mt-2 text-xs text-zinc-500">{pricedCardCount === cardCount ? 'All cards priced' : `${pricedCardCount} of ${cardCount} cards priced`}</p></div>
      </section>

      <section className="mb-8 grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-white/8 bg-[#101311] p-5"><div className="flex items-center gap-2"><BarChart3 className="size-4 text-lime-300" /><h3 className="font-heading text-base font-semibold text-zinc-100">Mana curve</h3></div><p className="mt-1 text-xs text-zinc-600">Nonland cards by mana value</p><div className="mt-6 flex h-36 items-end gap-2">{manaCurve.map((count, index) => <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-zinc-500">{count}</span><div className="w-full rounded-t-md bg-gradient-to-t from-lime-500/60 to-lime-200" style={{ height: `${Math.max(count ? 8 : 1, count / maxCurve * 100)}%` }} /><span className="font-mono text-[10px] text-zinc-600">{index === 7 ? '7+' : index}</span></div>)}</div></article>
        <Distribution title="Colors in spell costs" subtitle="Colored mana symbols across nonland casting costs." values={spellColors} />
        <Distribution title="Colors from mana sources" subtitle="Colors listed by Scryfall as producible; conditional sources are counted equally." values={sourceColors} />
      </section>

      {showCutNotice && <section className="mb-8 rounded-2xl border border-lime-300/20 bg-lime-300/[0.035] p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="flex items-center gap-2 text-sm font-medium text-lime-100"><Scissors className="size-4" /> Cut recommendations</p><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">An early, explainable score combining curve pressure, low keyword synergy, and printing price. The commander and basic lands are excluded.</p></div><div className="flex items-center gap-2"><span className="rounded-lg bg-black/30 px-3 py-2 text-xs text-zinc-400"><strong className="text-white">{selectedCutCount}</strong> selected{difference < 0 ? ` / ${Math.abs(difference)} needed` : ''}</span><Button variant="ghost" size="sm" onClick={() => setShowCutNotice(false)}>Close</Button></div></div><div className="mt-5 flex flex-wrap gap-2">{([['all', 'All recommendations'], ['curve', 'Mana curve'], ['synergy', 'Low synergy'], ['price', 'Price']] as const).map(([value, label]) => <Button key={value} variant={cutCriterion === value ? 'secondary' : 'outline'} size="sm" onClick={() => setCutCriterion(value)}>{label}</Button>)}{selectedCuts.size > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedCuts(new Set())}>Clear selections</Button>}</div><div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">{visibleCutRecommendations.map((recommendation, index) => { const card = recommendation.card; const key = card.key ?? card.name; const selected = selectedCuts.has(key); return <button type="button" key={key} onClick={() => setSelectedCuts((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className={`grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-lime-300/40 bg-lime-300/10' : 'border-white/8 bg-[#0b0d0c] hover:bg-white/[0.035]'}`}><span className={`grid size-7 place-items-center rounded-full font-mono text-xs ${selected ? 'bg-lime-300 text-[#11150d]' : 'bg-white/5 text-zinc-500'}`}>{selected ? <Check className="size-3.5" /> : index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-zinc-200">{card.name}</span><span className="mt-0.5 block truncate text-[10px] text-zinc-600">{recommendation.reasons.join(' · ')}</span></span><span className="text-right"><span className="block font-mono text-sm font-semibold text-zinc-100">{Math.round(recommendation[cutCriterion] * 100)}</span><span className="block text-[9px] uppercase tracking-wider text-zinc-600">cut score</span></span></button>; })}</div>{visibleCutRecommendations.length === 0 && <p className="mt-4 text-sm text-zinc-600">No eligible cards are available for recommendations.</p>}<p className="mt-4 text-[10px] text-zinc-600">Scores are guidance, not automatic cuts. Card-to-card comparison will be added after effect similarity can be measured reliably.</p></section>}

      <section>
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-300">Deck library</p><h2 className="mt-1 font-heading text-2xl font-semibold text-white">{filteredCards.length} unique cards</h2></div><div className="flex flex-wrap gap-2"><label className="relative min-w-[200px] flex-1 lg:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.025] pl-9 pr-3 text-sm outline-none placeholder:text-zinc-700 focus:border-lime-300/40" placeholder="Search cards" value={search} onChange={(event) => setSearch(event.target.value)} /></label><NativeSelect value={groupBy} onChange={(event) => setGroupBy(event.target.value as typeof groupBy)} aria-label="Group cards"><NativeSelectOption value="none">No grouping</NativeSelectOption><NativeSelectOption value="type">Group: Type</NativeSelectOption><NativeSelectOption value="rarity">Group: Rarity</NativeSelectOption></NativeSelect><NativeSelect value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} aria-label="Sort cards"><NativeSelectOption value="name">Sort: Name</NativeSelectOption><NativeSelectOption value="mana">Sort: Mana cost</NativeSelectOption><NativeSelectOption value="price-high">Price: High to low</NativeSelectOption><NativeSelectOption value="price-low">Price: Low to high</NativeSelectOption></NativeSelect><div className="flex rounded-lg border border-white/10 bg-white/[0.025] p-0.5"><Button variant={view === 'art' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('art')} aria-label="Card art view"><Grid2X2 /></Button><Button variant={view === 'text' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('text')} aria-label="Text view"><List /></Button></div></div></div>
        <div className="space-y-8">{groups.map(([label, entries]) => <section key={label}><div className="mb-3 flex items-center gap-3"><h3 className="font-heading text-lg font-semibold text-zinc-200">{label}</h3><span className="text-xs text-zinc-600">{entries.reduce((sum, card) => sum + card.quantity, 0)} cards</span><span className="h-px flex-1 bg-white/8" /></div>{view === 'art' ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">{entries.map((card) => <article key={card.key ?? card.name} className="group relative overflow-hidden rounded-xl border border-white/8 bg-[#101311] shadow-xl shadow-black/10"><div className="aspect-[63/88] overflow-hidden bg-white/[0.025]"><CardArtwork card={card} /></div><span className="absolute left-2 top-2 rounded-md bg-black/80 px-2 py-1 font-mono text-xs text-white">{card.quantity}×</span>{commander === card.name && <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-lime-300 text-[#10140c]"><Crown className="size-3.5" /></span>}<div className="p-3"><p className="truncate text-xs font-medium text-zinc-200">{card.name}</p><p className="mt-1 truncate text-[10px] text-zinc-600">{card.cardData?.setCode ? `${card.cardData.setCode} #${card.cardData.collectorNumber}` : card.cardData?.typeLine ?? 'Card data unavailable'}{cardPrice(card) ? ` · $${cardPrice(card)}` : ''}</p>{card.cardData?.artist && <p className="mt-1 truncate text-[9px] text-zinc-700">Art by {card.cardData.artist}</p>}</div></article>)}</div> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{entries.map((card) => <article key={card.key ?? card.name} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#101311] px-4 py-3"><span className="font-mono text-sm text-zinc-500">{card.quantity}×</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-200">{card.name}{commander === card.name && <Crown className="ml-2 inline size-3.5 text-lime-300" />}</p><p className="truncate text-[10px] text-zinc-600">{card.cardData?.setCode ? `${card.cardData.setCode} #${card.cardData.collectorNumber}` : card.cardData?.typeLine ?? 'Card data unavailable'} · {titleCase(card.cardData?.rarity ?? '')}</p></div><div className="text-right"><p className="font-mono text-xs text-zinc-400">{cardPrice(card) ? `$${cardPrice(card)}` : '—'}</p><p className="text-[10px] text-zinc-600">MV {card.cardData?.manaValue ?? '—'}</p></div></article>)}</div>}</section>)}</div>
        {filteredCards.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-600"><AlertCircle className="mx-auto mb-3 size-5" />No cards match this search.</div>}
        <p className="mt-8 text-center text-[10px] text-zinc-700">Card data and images provided by Scryfall. Artwork belongs to its respective artists and rights holders.</p>
      </section>
    </div>
  </main>;
}
