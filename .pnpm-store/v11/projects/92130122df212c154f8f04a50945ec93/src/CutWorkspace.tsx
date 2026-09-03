import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Crown,
  Link2,
  RefreshCw,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkspaceCard } from '@/DeckWorkspace';
type Criterion = 'all' | 'curve' | 'synergy' | 'price' | 'popularity';
type Props = {
  deckName: string;
  commander: string;
  cards: WorkspaceCard[];
  cardCount: number;
  target: number;
  onBack: () => void;
};
const CURVE_TARGET = [0.02, 0.1, 0.25, 0.28, 0.17, 0.1, 0.05, 0.03];
const CURVE_BUCKET_WEIGHT = [0.7, 0.8, 0.9, 1, 1.2, 1.45, 1.75, 2.1];
const FALLBACK_KEYWORDS = [
  'flying',
  'first strike',
  'double strike',
  'deathtouch',
  'haste',
  'hexproof',
  'indestructible',
  'lifelink',
  'menace',
  'reach',
  'trample',
  'vigilance',
  'ward',
  'flash',
  'prowess',
  'convoke',
  'delve',
  'cascade',
  'landfall',
  'cycling',
  'kicker',
  'equip',
  'crew',
  'toxic',
  'infect',
  'proliferate',
  'scry',
  'surveil',
  'mill',
  'investigate',
  'discover',
];
function keyOf(card: WorkspaceCard) {
  return card.key ?? card.name;
}
function priceOf(card: WorkspaceCard) {
  const finish = card.cardData?.cacheKey.split(':').at(-1);
  return Number(
    finish === 'foil'
      ? card.cardData?.priceUsdFoil
      : finish === 'etched'
        ? card.cardData?.priceUsdEtched
        : (card.cardData?.priceUsd ??
          card.cardData?.priceUsdFoil ??
          card.cardData?.priceUsdEtched ??
          0),
  );
}
function popularityCutScore(card: WorkspaceCard) {
  const rank = card.cardData?.edhrecRank;
  if (!rank || rank < 1) return 0.5;
  return Math.min(1, Math.log10(rank + 1) / Math.log10(25000));
}
function creatureTypesOf(card?: WorkspaceCard) {
  const frontType = card?.cardData?.typeLine?.split('//')[0] ?? '';
  const [types, subtypes] = frontType.split('—').map((part) => part.trim());
  return types?.includes('Creature') && subtypes
    ? subtypes
        .split(/\s+/)
        .filter(Boolean)
        .map((type) => type.toLowerCase())
    : [];
}
function synergyTags(card?: WorkspaceCard, knownCreatureTypes: string[] = []) {
  if (!card) return [];
  const tags = new Set<string>();
  const text = card.cardData?.oracleText.toLowerCase() ?? '';
  (card.cardData?.keywords?.length
    ? card.cardData.keywords
    : FALLBACK_KEYWORDS.filter((keyword) =>
        new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i').test(text),
      )
  ).forEach((keyword) => tags.add(keyword));
  if (
    /\bdraws? (?:a|one|two|three|four|\d+) cards?\b|\bdraw cards equal\b|\bcard draw\b/.test(
      text,
    )
  )
    tags.add('card draw');
  if (/search your library for [^.]*\bland\b/.test(text))
    tags.add('land fetching');
  if (
    /\badd (?:\{|one mana|two mana|three mana)|\bland card[^.]*onto the battlefield|\bput [^.]*land[^.]*onto the battlefield/.test(
      text,
    )
  )
    tags.add('mana ramp');
  if (/\bcreates? [^.]*\btoken/.test(text)) tags.add('token creation');
  if (/\bcreates? [^.]*\btreasure|\btreasure tokens?\b/.test(text))
    tags.add('treasure production');
  const exilesFromTop =
    /\bexile [^.]*\btop\b [^.]*\bcards?\b [^.]*\blibrary\b/.test(text);
  const temporaryPermission =
    /(?:\buntil [^.]*\bturn\b|\bthis turn\b)[^.]*\byou may (?:play|cast)\b|\byou may (?:play|cast)\b[^.]*(?:\buntil [^.]*\bturn\b|\bthis turn\b)/.test(
      text,
    );
  if (exilesFromTop && temporaryPermission) tags.add('impulse draw');
  if (/\bput (?:a|one|two|three|\d+) \+1\/\+1 counters?/.test(text))
    tags.add('+1/+1 counters');
  if (
    /\breturn [^.]* from your graveyard|\bgraveyard to (?:your hand|the battlefield)/.test(
      text,
    )
  )
    tags.add('recursion');
  if (
    /\bdestroy target|\bexile target|deals? \d+ damage to any target/.test(text)
  )
    tags.add('removal');
  if (/\bdeals? (?:(?:\d+|x|that much) damage|damage equal to)\b/.test(text))
    tags.add('burn');
  if (/\bdiscards?\b|\bdiscard (?:a|one|two|three|\d+) cards?\b/.test(text))
    tags.add('discard');
  if (
    /\bsacrifices?\b|\bsacrificed\b|\bsacrifice (?:a|an|another|one|two|three|\d+)\b/.test(
      text,
    )
  )
    tags.add('sacrifice');
  const addTypeEvent = (type: string, event: string) =>
    tags.add(`type-event: ${type} ${event}`);
  const sacrificeSubjects = [
    ...text.matchAll(/\bsacrifice\s+([^:.,;\n]+)/g),
  ].map((match) => match[1].trim());
  const frontName = card.name.split('//')[0].trim().toLowerCase();
  const selfIsSacrificed = sacrificeSubjects.some(
    (subject) =>
      subject.includes(frontName) ||
      /^(?:it|this permanent|this card)$/.test(subject),
  );
  const frontTypes = (
    card.cardData?.typeLine?.split('//')[0].split('—')[0] ?? ''
  ).toLowerCase();
  const sacrificeReferences = (type: string) =>
    sacrificeSubjects.some((subject) =>
      new RegExp(`\\b${type}s?\\b`).test(subject),
    );
  if (
    /\bartifact spells?\b|\bcast [^.]*\bartifact\b|\bwhenever [^.]*\bcasts? [^.]*\bartifact\b/.test(
      text,
    )
  )
    addTypeEvent('artifact', 'cast');
  if (
    /\bartifact [^.]*\benters?\b|\bwhenever [^.]*\bartifact [^.]*\benters?\b/.test(
      text,
    )
  )
    addTypeEvent('artifact', 'enters');
  if (
    sacrificeReferences('artifact') ||
    (selfIsSacrificed && frontTypes.includes('artifact')) ||
    /\bartifacts? (?:is|are|was|were|you control is) sacrificed\b/.test(text)
  )
    addTypeEvent('artifact', 'sacrificed');
  if (/\bartifact [^.]*\bput into [^.]*\bgraveyard\b/.test(text))
    addTypeEvent('artifact', 'to graveyard');
  if (
    /\bcreature spells?\b|\bcast [^.]*\bcreature\b|\bwhenever [^.]*\bcasts? [^.]*\bcreature\b/.test(
      text,
    )
  )
    addTypeEvent('creature', 'cast');
  if (
    /\bcreature [^.]*\benters?\b|\bwhenever [^.]*\bcreature [^.]*\benters?\b/.test(
      text,
    )
  )
    addTypeEvent('creature', 'enters');
  if (
    /\bcreatures? (?:you control )?\bdies?\b|\bwhenever [^.]*\bcreature [^.]*\bdies?\b/.test(
      text,
    )
  )
    addTypeEvent('creature', 'dies');
  if (
    sacrificeReferences('creature') ||
    (selfIsSacrificed && frontTypes.includes('creature')) ||
    /\bcreatures? (?:is|are|was|were|you control is) sacrificed\b/.test(text)
  )
    addTypeEvent('creature', 'sacrificed');
  if (
    /\binstant spells?\b|\bcast [^.]*\binstant\b|\binstant or sorcery spells?\b/.test(
      text,
    )
  )
    addTypeEvent('instant', 'cast');
  if (
    /\bsorcery spells?\b|\bcast [^.]*\bsorcery\b|\binstant or sorcery spells?\b/.test(
      text,
    )
  )
    addTypeEvent('sorcery', 'cast');
  if (/\benchantment spells?\b|\bcast [^.]*\benchantment\b/.test(text))
    addTypeEvent('enchantment', 'cast');
  if (/\benchantment [^.]*\benters?\b/.test(text))
    addTypeEvent('enchantment', 'enters');
  if (
    /\bland [^.]*\benters?\b|\bwhenever [^.]*\bland [^.]*\benters?\b/.test(text)
  )
    addTypeEvent('land', 'enters');
  if (
    sacrificeReferences('land') ||
    (selfIsSacrificed && frontTypes.includes('land')) ||
    /\blands? (?:is|are|was|were|you control is) sacrificed\b/.test(text)
  )
    addTypeEvent('land', 'sacrificed');
  if (/\bcreates? [^.]*\btoken\b/.test(text)) addTypeEvent('token', 'created');
  if (/\btoken [^.]*\benters?\b/.test(text)) addTypeEvent('token', 'enters');
  if (/\btokens? [^.]*\bdies?\b/.test(text)) addTypeEvent('token', 'dies');
  if (
    sacrificeReferences('token') ||
    /\btokens? (?:is|are|was|were|you control is) sacrificed\b/.test(text)
  )
    addTypeEvent('token', 'sacrificed');
  creatureTypesOf(card).forEach((type) => tags.add(`creature: ${type}`));
  knownCreatureTypes.forEach((type) => {
    const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plurals = type.endsWith('f')
      ? `${type.slice(0, -1)}ves`
      : type.endsWith('y')
        ? `${type.slice(0, -1)}ies`
        : `${type}s`;
    if (new RegExp(`\\b(?:${escaped}|${plurals})\\b`, 'i').test(text))
      tags.add(`creature: ${type}`);
  });
  return [...tags];
}
function displayTag(tag: string) {
  if (tag.startsWith('creature: '))
    return `Creature type: ${tag.slice(10).replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  if (tag.startsWith('type-event: ')) {
    const [type, ...event] = tag.slice(12).split(' ');
    return `${type.replace(/\b\w/g, (letter) => letter.toUpperCase())} — ${event.join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  }
  return tag.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function HighlightedRulesText({
  text,
  tags,
}: {
  text: string;
  tags: string[];
}) {
  const aliases: Record<string, string[]> = {
    'card draw': ['draw'],
    'impulse draw': ['exile', 'top', 'play', 'cast', 'until'],
    'land fetching': ['search your library', 'land'],
    'mana ramp': ['add', 'mana'],
    'token creation': ['token'],
    'treasure production': ['treasure'],
    burn: ['damage'],
    removal: ['destroy', 'exile'],
    recursion: ['graveyard'],
  };
  const terms = [
    ...new Set(
      tags.flatMap((tag) =>
        tag.startsWith('creature: ')
          ? [tag.slice(10)]
          : tag.startsWith('type-event: ')
            ? tag.slice(12).split(' ')
            : (aliases[tag] ?? [tag]),
      ),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length)
    return (
      <p className="whitespace-pre-line text-xs leading-5 text-zinc-400">
        {text || 'No rules text.'}
      </p>
    );
  const escaped = terms.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const matcher = new RegExp(`(${escaped.join('|')})`, 'gi');
  return (
    <p className="whitespace-pre-line text-xs leading-5 text-zinc-400">
      {text.split(matcher).map((part, index) =>
        terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark
            key={index}
            className="rounded bg-lime-300/20 px-0.5 text-lime-100"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </p>
  );
}
function curveFor(cards: WorkspaceCard[]) {
  const curve = Array.from({ length: 8 }, () => 0);
  cards
    .filter((card) => card.cardData?.type !== 'Land')
    .forEach((card) => {
      curve[
        Math.min(7, Math.max(0, Math.floor(card.cardData?.manaValue ?? 0)))
      ] += card.quantity;
    });
  return curve;
}
function curvePenalty(curve: number[]) {
  const total = Math.max(
    1,
    curve.reduce((sum, value) => sum + value, 0),
  );
  const shares = curve.map((count) => count / total);
  const targetExcess = shares.reduce(
    (penalty, share, index) =>
      penalty +
      Math.max(0, share - CURVE_TARGET[index]) * CURVE_BUCKET_WEIGHT[index],
    0,
  );
  const crowdedTail = shares.slice(4).reduce((penalty, share, offset) => {
    const index = offset + 4;
    const targetDrop = CURVE_TARGET[index] / CURVE_TARGET[index - 1];
    const locallyExpected = shares[index - 1] * targetDrop;
    return (
      penalty +
      Math.max(0, share - locallyExpected) * CURVE_BUCKET_WEIGHT[index]
    );
  }, 0);
  return targetExcess + crowdedTail * 0.8;
}
function budgetToSliderPosition(budget: number | null) {
  if (budget === null) return 0;
  return budget <= 200
    ? budget / 2
    : budget <= 1000
      ? 100 + (budget - 200) / 8
      : 200 + (Math.min(10000, budget) - 1000) / 90;
}
function sliderPositionToBudget(position: number) {
  if (position <= 0) return null;
  return Math.round(
    position <= 100
      ? position * 2
      : position <= 200
        ? 200 + (position - 100) * 8
        : 1000 + (position - 200) * 90,
  );
}
export default function CutWorkspace({
  deckName,
  commander,
  cards,
  cardCount,
  target,
  onBack,
}: Props) {
  const [criterion, setCriterion] = useState<Criterion>('all');
  const [selectedCuts, setSelectedCuts] = useState<Set<string>>(new Set());
  const [keptCards, setKeptCards] = useState<Set<string>>(new Set());
  const [browserTab, setBrowserTab] = useState<'undecided' | 'keep' | 'cut'>(
    'undecided',
  );
  const [groupByMana, setGroupByMana] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const [selectedSynergy, setSelectedSynergy] = useState('');
  const [ignoredSynergies, setIgnoredSynergies] = useState<Set<string>>(
    new Set(),
  );
  const [focusedKey, setFocusedKey] = useState('');
  const [, setFlipRevision] = useState(0);
  const baseCurve = useMemo(() => curveFor(cards), [cards]);
  const workingCurve = useMemo(() => {
    const curve = [...baseCurve];
    selectedCuts.forEach((key) => {
      const card = cards.find((entry) => keyOf(entry) === key);
      if (card && card.cardData?.type !== 'Land') {
        const bucket = Math.min(
          7,
          Math.max(0, Math.floor(card.cardData?.manaValue ?? 0)),
        );
        curve[bucket] = Math.max(0, curve[bucket] - card.quantity);
      }
    });
    return curve;
  }, [baseCurve, cards, selectedCuts]);
  const totalDeckPrice = useMemo(
    () =>
      cards.reduce((total, card) => total + priceOf(card) * card.quantity, 0),
    [cards],
  );
  const workingDeckPrice = useMemo(
    () =>
      Math.max(
        0,
        totalDeckPrice -
          [...selectedCuts].reduce((total, key) => {
            const card = cards.find((entry) => keyOf(entry) === key);
            return total + (card ? priceOf(card) * card.quantity : 0);
          }, 0),
      ),
    [cards, selectedCuts, totalDeckPrice],
  );
  const knownCreatureTypes = useMemo(
    () => [...new Set(cards.flatMap((card) => creatureTypesOf(card)))],
    [cards],
  );
  const recommendations = useMemo(() => {
    const eligible = cards.filter(
      (card) =>
        card.name !== commander &&
        !card.cardData?.typeLine?.startsWith('Basic Land'),
    );
    const frequency = new Map<string, number>();
    eligible.forEach((card) =>
      synergyTags(card, knownCreatureTypes)
        .filter((tag) => !ignoredSynergies.has(tag))
        .forEach((tag) =>
          frequency.set(tag, (frequency.get(tag) ?? 0) + card.quantity),
        ),
    );
    const commanderTags = new Set(
      synergyTags(
        cards.find((card) => card.name === commander),
        knownCreatureTypes,
      ).filter((tag) => !ignoredSynergies.has(tag)),
    );
    return eligible.map((card) => {
      const bucket = Math.min(
        7,
        Math.max(0, Math.floor(card.cardData?.manaValue ?? 0)),
      );
      const beforeCurve = [...workingCurve];
      if (selectedCuts.has(keyOf(card)) && card.cardData?.type !== 'Land')
        beforeCurve[bucket] += card.quantity;
      const beforePenalty = curvePenalty(beforeCurve);
      const afterCurve = [...beforeCurve];
      if (card.cardData?.type !== 'Land')
        afterCurve[bucket] = Math.max(0, afterCurve[bucket] - card.quantity);
      const curve = Math.min(
        1,
        Math.max(
          0,
          ((beforePenalty - curvePenalty(afterCurve)) /
            Math.max(0.01, beforePenalty)) *
            5,
        ),
      );
      const allTags = synergyTags(card, knownCreatureTypes);
      const tags = allTags.filter((tag) => !ignoredSynergies.has(tag));
      const support = allTags.length
        ? tags.reduce(
            (sum, tag) =>
              sum +
              Math.min(
                1,
                (frequency.get(tag) ?? 0) / Math.max(4, cardCount * 0.12),
              ),
            0,
          ) / allTags.length
        : 0;
      const commanderOverlap = allTags.length
        ? tags.filter((tag) => commanderTags.has(tag)).length / allTags.length
        : 0;
      const allCreatureTags = allTags.filter((tag) =>
        tag.startsWith('creature: '),
      );
      const activeCreatureTags = tags.filter((tag) =>
        tag.startsWith('creature: '),
      );
      const commanderCreatureBoost = allCreatureTags.length
        ? activeCreatureTags.filter((tag) => commanderTags.has(tag)).length /
          allCreatureTags.length
        : 0;
      const synergy =
        1 -
        Math.min(
          1,
          support * 0.45 +
            commanderOverlap * 0.3 +
            commanderCreatureBoost * 0.25,
        );
      const cardValue = priceOf(card) * card.quantity;
      const priceIsActive = budget !== null;
      const price = priceIsActive
        ? Math.min(1, cardValue / Math.max(0.01, budget))
        : 0;
      const popularity = popularityCutScore(card);
      return {
        card,
        curve,
        synergy,
        price,
        popularity,
        all: priceIsActive
          ? curve * 0.4 + synergy * 0.3 + price * 0.2 + popularity * 0.1
          : curve * 0.5 + synergy * 0.375 + popularity * 0.125,
        tags: allTags,
        activeTags: tags,
        afterCurve,
        bucket,
      };
    });
  }, [
    cards,
    commander,
    cardCount,
    workingCurve,
    knownCreatureTypes,
    selectedCuts,
    ignoredSynergies,
    budget,
  ]);
  const allRanked = useMemo(
    () => [...recommendations].sort((a, b) => b[criterion] - a[criterion]),
    [recommendations, criterion],
  );
  const ranked = useMemo(
    () =>
      allRanked.filter((item) =>
        browserTab === 'cut'
          ? selectedCuts.has(keyOf(item.card))
          : browserTab === 'keep'
            ? keptCards.has(keyOf(item.card))
            : !selectedCuts.has(keyOf(item.card)) &&
              !keptCards.has(keyOf(item.card)),
      ),
    [allRanked, browserTab, selectedCuts, keptCards],
  );
  const rankedGroups = useMemo(() => {
    if (!groupByMana) return [['All cards', ranked] as const];
    const groups = new Map<number, typeof ranked>();
    ranked.forEach((item) => {
      const bucket = Math.min(
        7,
        Math.max(0, Math.floor(item.card.cardData?.manaValue ?? 0)),
      );
      groups.set(bucket, [...(groups.get(bucket) ?? []), item]);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(
        ([bucket, items]) =>
          [`Mana value ${bucket === 7 ? '7+' : bucket}`, items] as const,
      );
  }, [ranked, groupByMana]);
  const focused =
    recommendations.find((item) => keyOf(item.card) === focusedKey) ??
    ranked[0];
  const synergyMatches = useMemo(
    () =>
      focused
        ? cards
            .filter((card) => keyOf(card) !== keyOf(focused.card))
            .map((card) => ({
              card,
              shared: synergyTags(card, knownCreatureTypes).filter(
                (tag) =>
                  !ignoredSynergies.has(tag) &&
                  focused.activeTags.includes(tag),
              ),
            }))
            .filter((item) => item.shared.length)
            .sort((a, b) => b.shared.length - a.shared.length)
        : [],
    [cards, focused, knownCreatureTypes, ignoredSynergies],
  );
  const selectedCount = [...selectedCuts].reduce(
    (sum, key) =>
      sum + (cards.find((card) => keyOf(card) === key)?.quantity ?? 0),
    0,
  );
  const cutsNeeded = Math.max(0, cardCount - target);
  const maxCurve = Math.max(1, ...baseCurve, ...(focused?.afterCurve ?? []));
  function advanceAfterDecision(card: WorkspaceCard) {
    const index = ranked.findIndex((item) => keyOf(item.card) === keyOf(card));
    if (index < 0 || ranked.length <= 1) {
      setFocusedKey('');
      return;
    }
    setFocusedKey(keyOf(ranked[(index + 1) % ranked.length].card));
  }
  function markCut(card: WorkspaceCard) {
    advanceAfterDecision(card);
    const key = keyOf(card);
    setKeptCards((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setSelectedCuts((current) => new Set(current).add(key));
  }
  function markKeep(card: WorkspaceCard) {
    advanceAfterDecision(card);
    const key = keyOf(card);
    setSelectedCuts((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setKeptCards((current) => new Set(current).add(key));
  }
  function resetDecision(card: WorkspaceCard) {
    const key = keyOf(card);
    setSelectedCuts((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setKeptCards((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }
  function toggleCut(card: WorkspaceCard) {
    if (selectedCuts.has(keyOf(card))) resetDecision(card);
    else markCut(card);
  }
  function flipFocusedCard() {
    if (
      !focused?.card.cardData?.backImageUri ||
      !focused.card.cardData.imageUri
    )
      return;
    const front = focused.card.cardData.imageUri;
    focused.card.cardData.imageUri = focused.card.cardData.backImageUri;
    focused.card.cardData.backImageUri = front;
    setFlipRevision((revision) => revision + 1);
  }
  const adjustedCurve = workingCurve;
  const discoveredSynergies = useMemo(() => {
    const groups = new Map<string, WorkspaceCard[]>();
    cards.forEach((card) =>
      synergyTags(card, knownCreatureTypes).forEach((tag) =>
        groups.set(tag, [...(groups.get(tag) ?? []), card]),
      ),
    );
    return [...groups.entries()]
      .map(([tag, matchingCards]) => ({
        tag,
        cards: matchingCards,
        count: matchingCards.reduce((sum, card) => sum + card.quantity, 0),
        ignored: ignoredSynergies.has(tag),
      }))
      .sort(
        (a, b) =>
          Number(a.ignored) - Number(b.ignored) ||
          b.count - a.count ||
          displayTag(a.tag).localeCompare(displayTag(b.tag)),
      );
  }, [cards, knownCreatureTypes, ignoredSynergies]);
  const selectedSynergyGroup = discoveredSynergies.find(
    (group) => group.tag === selectedSynergy,
  );
  useEffect(() => {
    function openConnectionTag(event: MouseEvent) {
      const element = event.target as HTMLElement;
      const badge = element.closest('span');
      const panel = badge?.closest('article');
      if (
        !badge ||
        panel?.querySelector('h3')?.textContent !== 'Synergy connections'
      )
        return;
      const tag = focused?.tags.find(
        (candidate) => displayTag(candidate) === badge.textContent?.trim(),
      );
      if (tag) setSelectedSynergy(tag);
    }
    document.addEventListener('click', openConnectionTag);
    return () => document.removeEventListener('click', openConnectionTag);
  }, [focused]);
  useEffect(() => {
    document.querySelectorAll('article').forEach((panel) => {
      if (panel.querySelector('h3')?.textContent !== 'Synergy connections')
        return;
      panel.querySelectorAll('span').forEach((badge) => {
        const tag = focused?.tags.find(
          (candidate) => displayTag(candidate) === badge.textContent?.trim(),
        );
        badge.classList.toggle(
          'ignored-synergy-connection',
          Boolean(tag && ignoredSynergies.has(tag)),
        );
      });
    });
  }, [focused, ignoredSynergies]);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0b0d0c]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Return to deck workspace"
            >
              <ArrowLeft />
            </Button>
            <div>
              <p className="font-heading text-lg font-semibold text-white">
                Make cuts
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                {deckName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/10 text-zinc-400">
              {selectedCount}
              {cutsNeeded ? ` / ${cutsNeeded}` : ''} selected
            </Badge>
            {selectedCuts.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCuts(new Set())}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-white">
              Build a cut list with context.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Choose a card below to preview the impact of removing it.
            </p>
          </div>
          {focused?.card.cardData?.backImageUri && (
            <Button variant="outline" size="sm" onClick={flipFocusedCard}>
              <RefreshCw data-icon="inline-start" /> Flip card
            </Button>
          )}
        </div>
        <section className="mb-5 rounded-2xl border border-white/8 bg-[#101311] px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[180px_minmax(240px,1fr)_150px_220px] lg:items-center">
            <div>
              <p className="text-xs font-semibold text-zinc-200">Deck budget</p>
              <p className="mt-0.5 text-[10px] text-zinc-600">
                {budget === null
                  ? 'None · price scoring disabled'
                  : workingDeckPrice > budget
                    ? `$${(workingDeckPrice - budget).toFixed(2)} over budget`
                    : 'Within budget · price scoring active'}
              </p>
            </div>
            <div>
              <input
                type="range"
                min="0"
                max="300"
                step="0.5"
                value={budgetToSliderPosition(budget)}
                onChange={(event) => {
                  setBudget(sliderPositionToBudget(Number(event.target.value)));
                }}
                className="h-1.5 w-full cursor-pointer accent-lime-300"
                aria-label="Deck budget"
              />
              <div className="relative mt-1 h-3 text-[9px] font-medium text-zinc-600">
                <span className="absolute left-0">None</span>
                <span className="absolute left-1/3 -translate-x-1/2">$200</span>
                <span className="absolute left-2/3 -translate-x-1/2">
                  $1,000
                </span>
                <span className="absolute right-0">$10,000</span>
              </div>
            </div>
            <label className="flex items-center rounded-lg border border-white/10 bg-black/20 px-3 py-2 focus-within:border-lime-300/40">
              <span className="mr-1 text-xs text-zinc-500">$</span>
              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                value={budget ?? ''}
                placeholder="None"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setBudget(
                    event.target.value !== '' && value > 0
                      ? Math.min(10000, value)
                      : null,
                  );
                }}
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
                aria-label="Type a deck budget"
              />
            </label>
            <p className="text-right font-mono text-xs text-zinc-400 lg:text-left">
              Current deck{' '}
              <span className="text-zinc-100">
                ${workingDeckPrice.toFixed(2)}
              </span>
              {budget !== null && (
                <span className="text-zinc-600"> / ${budget.toFixed(2)}</span>
              )}
            </p>
          </div>
        </section>
        {focused && (
          <section className="mb-7 rounded-2xl border border-lime-300/15 bg-[#101311] p-5">
            <div className="grid gap-5 xl:grid-cols-[190px_minmax(300px,.8fr)_minmax(420px,1.2fr)]">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                {focused.card.cardData?.imageUri ? (
                  <img
                    src={focused.card.cardData.imageUri}
                    alt={`${focused.card.name} card art`}
                    className="aspect-[63/88] w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-[63/88] place-items-center text-xs text-zinc-600">
                    Artwork unavailable
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-300">
                  Interactive preview
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-heading text-2xl font-semibold text-white">
                    {focused.card.name}
                  </h2>
                  {priceOf(focused.card) > 0 && (
                    <span className="font-mono text-xs font-normal text-zinc-600">
                      ${priceOf(focused.card).toFixed(2)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  {focused.card.cardData?.typeLine}
                </p>
                <div className="mt-3 max-h-36 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/8 pb-2 text-[10px]">
                    <span className="font-medium uppercase tracking-wider text-zinc-600">
                      Mana cost
                    </span>
                    <span className="font-mono text-xs font-semibold text-zinc-300">
                      {focused.card.cardData?.manaCost || 'No mana cost'}
                    </span>
                  </div>
                  <HighlightedRulesText
                    text={focused.card.cardData?.oracleText ?? ''}
                    tags={focused.tags}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(
                    [
                      ['all', 'Overall'],
                      ['curve', 'Curve'],
                      ['synergy', 'Low synergy'],
                      ['price', 'Price'],
                      ['popularity', 'Low popularity'],
                    ] as const
                  ).map(([value, label]) => (
                    <div
                      key={value}
                      className="rounded-xl border border-white/8 bg-black/20 p-3"
                    >
                      <div className="flex items-end justify-between">
                        <p className="font-mono text-xl font-semibold text-white">
                          {value === 'popularity' &&
                          !focused.card.cardData?.edhrecRank
                            ? 'N/A'
                            : Math.round(focused[value] * 100)}
                        </p>
                        <p className="text-[9px] text-zinc-600">{label}</p>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full bg-lime-300"
                          style={{
                            width:
                              value === 'popularity' &&
                              !focused.card.cardData?.edhrecRank
                                ? '0%'
                                : `${focused[value] * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    className="col-span-2"
                    disabled={
                      !selectedCuts.has(keyOf(focused.card)) &&
                      !keptCards.has(keyOf(focused.card))
                    }
                    onClick={() => resetDecision(focused.card)}
                  >
                    Undecided
                  </Button>
                  <Button
                    variant={
                      keptCards.has(keyOf(focused.card))
                        ? 'secondary'
                        : 'outline'
                    }
                    onClick={() => markKeep(focused.card)}
                  >
                    {keptCards.has(keyOf(focused.card)) && (
                      <Check data-icon="inline-start" />
                    )}{' '}
                    Keep
                  </Button>
                  <Button
                    variant={
                      selectedCuts.has(keyOf(focused.card))
                        ? 'secondary'
                        : 'default'
                    }
                    onClick={() => toggleCut(focused.card)}
                  >
                    {selectedCuts.has(keyOf(focused.card)) ? (
                      <>
                        <Check data-icon="inline-start" /> Cut
                      </>
                    ) : (
                      <>
                        <Scissors data-icon="inline-start" /> Add to cuts
                      </>
                    )}
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  {focused.curve > 0
                    ? `Removing it improves the target curve by reducing the MV ${focused.bucket} bucket. `
                    : 'It does not materially improve the curve. '}
                  {focused.tags.length
                    ? `Its detected themes are ${focused.tags.map(displayTag).join(', ')}.`
                    : 'No supported synergy theme was detected.'}
                  {priceOf(focused.card)
                    ? ` This printing is approximately $${priceOf(focused.card).toFixed(2)}.`
                    : ''}
                  {focused.card.cardData?.edhrecRank
                    ? ` Its EDHREC rank is ${focused.card.cardData.edhrecRank.toLocaleString()}.`
                    : ' No EDHREC rank is currently available.'}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-lime-300" />
                    <h3 className="text-sm font-medium text-white">
                      Curve after this cut
                    </h3>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    Current in gray; after removal in green.
                  </p>
                  <div className="mt-5 flex h-36 items-end gap-2">
                    {baseCurve.map((before, index) => (
                      <div
                        key={index}
                        className="flex h-full flex-1 flex-col justify-end"
                      >
                        <div className="flex h-[105px] items-end justify-center gap-px">
                          <div
                            className="w-1/2 rounded-t bg-zinc-700"
                            style={{ height: `${(before / maxCurve) * 100}%` }}
                          />
                          <div
                            className="w-1/2 rounded-t bg-lime-300"
                            style={{
                              height: `${(focused.afterCurve[index] / maxCurve) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-center font-mono text-[9px] text-zinc-600">
                          {index === 7 ? '7+' : index}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 text-lime-300" />
                    <h3 className="text-sm font-medium text-white">
                      Synergy connections
                    </h3>
                  </div>
                  <div className="mt-3 flex max-h-16 flex-wrap gap-1 overflow-y-auto">
                    {focused.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="border-lime-300/20 text-[9px] text-lime-200"
                      >
                        {displayTag(tag)}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto">
                    {synergyMatches.map((match) => (
                      <button
                        type="button"
                        key={keyOf(match.card)}
                        onClick={() => setFocusedKey(keyOf(match.card))}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/8 px-2.5 py-2 text-left hover:bg-white/[0.035]"
                      >
                        <span className="truncate text-[11px] text-zinc-300">
                          {match.card.name}
                          {match.card.name === commander && (
                            <Crown className="ml-1 inline size-3 text-lime-300" />
                          )}
                        </span>
                        <span className="max-w-[48%] truncate text-[9px] text-zinc-600">
                          {match.shared.map(displayTag).join(', ')}
                        </span>
                      </button>
                    ))}
                    {synergyMatches.length === 0 && (
                      <div className="py-6 text-center">
                        <Sparkles className="mx-auto size-4 text-zinc-700" />
                        <p className="mt-2 text-[10px] text-zinc-600">
                          No connections detected.
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              </div>
            </div>
          </section>
        )}
        <section>
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold text-white">
                  Card browser
                </h2>
                <p className="text-xs text-zinc-600">
                  The selected tab controls which cards appear; sorting only
                  changes their order.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-white/10 text-zinc-500"
              >
                {ranked.length} cards
              </Badge>
            </div>
            <div className="flex flex-col justify-between gap-3 border-b border-white/8 sm:flex-row sm:items-end">
              <div className="flex gap-1">
                {(
                  [
                    [
                      'undecided',
                      `Undecided (${allRanked.length - selectedCuts.size - keptCards.size})`,
                    ],
                    ['keep', `Keep (${keptCards.size})`],
                    ['cut', `Cut (${selectedCuts.size})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setBrowserTab(value)}
                    className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${browserTab === value ? 'border-lime-300 text-lime-200' : 'border-transparent text-zinc-600 hover:text-zinc-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1 pb-2">
                <Button
                  variant={groupByMana ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setGroupByMana((value) => !value)}
                  aria-pressed={groupByMana}
                >
                  Group by mana value
                </Button>
                <span className="mx-1 h-5 w-px bg-white/10" />
                <span className="mr-1 text-[10px] uppercase tracking-wider text-zinc-600">
                  Sort by
                </span>
                {(
                  [
                    ['all', 'Overall score'],
                    ['curve', 'Mana curve'],
                    ['synergy', 'Synergy'],
                    ['price', 'Price'],
                    ['popularity', 'EDHREC popularity'],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={criterion === value ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setCriterion(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            {rankedGroups.map(([label, items]) => (
              <div key={label}>
                {groupByMana && (
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-200">
                      {label}
                    </h3>
                    <span className="text-[10px] text-zinc-600">
                      {items.length} {items.length === 1 ? 'card' : 'cards'}
                    </span>
                    <span className="h-px flex-1 bg-white/8" />
                  </div>
                )}
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item, index) => {
                    const key = keyOf(item.card);
                    const selected = selectedCuts.has(key);
                    const active = focused && keyOf(focused.card) === key;
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => setFocusedKey(key)}
                        className={`grid grid-cols-[30px_minmax(0,1fr)_44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? 'border-lime-300/35 bg-lime-300/[0.07]' : 'border-white/8 bg-[#101311] hover:bg-white/[0.03]'}`}
                      >
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCut(item.card);
                          }}
                          className={`grid size-6 place-items-center rounded-md border text-[10px] ${selected ? 'border-lime-300 bg-lime-300 text-[#11150d]' : 'border-white/10 text-zinc-600'}`}
                        >
                          {selected ? <Check className="size-3" /> : index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-zinc-200">
                            {item.card.name}
                          </span>
                          <span className="block truncate text-[9px] text-zinc-600">
                            MV {item.card.cardData?.manaValue ?? '—'} ·{' '}
                            {item.tags.slice(0, 3).map(displayTag).join(', ') ||
                              'no detected themes'}
                          </span>
                        </span>
                        <span className="text-right font-mono text-base font-semibold text-zinc-100">
                          {Math.round(item[criterion] * 100)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-5 rounded-2xl border border-white/8 bg-[#101311] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-white">
                Cut-list curve preview
              </h2>
              <p className="mt-1 text-xs text-zinc-600">
                Current deck in gray; deck after all selected cuts in green.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-lime-300/20 text-lime-200"
            >
              {selectedCount} cards removed
            </Badge>
          </div>
          <div className="mt-5 flex h-36 items-end gap-3">
            {baseCurve.map((before, index) => (
              <div
                key={index}
                className="flex h-full flex-1 flex-col justify-end"
              >
                <div className="flex h-[105px] items-end justify-center gap-1">
                  <div
                    className="w-1/3 rounded-t bg-zinc-700"
                    style={{ height: `${(before / maxCurve) * 100}%` }}
                  />
                  <div
                    className="w-1/3 rounded-t bg-lime-300"
                    style={{
                      height: `${(adjustedCurve[index] / maxCurve) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-zinc-600">
                  {index === 7 ? '7+' : index}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-5 rounded-2xl border border-white/8 bg-[#101311] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-white">
                Synergies browser
              </h2>
              <p className="mt-1 text-xs text-zinc-600">
                Every discovered keyword, ability, and creature-type connection.
              </p>
            </div>
            <Badge variant="outline" className="border-white/10 text-zinc-500">
              {discoveredSynergies.length} synergies
            </Badge>
          </div>
          <div className="mt-4 flex max-h-52 flex-wrap content-start gap-2 overflow-y-auto pr-1">
            {discoveredSynergies.map((group) => (
              <button
                type="button"
                key={group.tag}
                onClick={() => setSelectedSynergy(group.tag)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left ${group.ignored ? 'border-red-300/25 bg-red-300/10 hover:border-red-300/45 hover:bg-red-300/15' : 'border-white/8 bg-black/20 hover:border-lime-300/30 hover:bg-lime-300/[0.05]'}`}
              >
                <span
                  className={`text-xs ${group.ignored ? 'text-red-200' : 'text-zinc-300'}`}
                >
                  {displayTag(group.tag)}
                </span>
                <span
                  className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 font-mono text-[10px] ${group.ignored ? 'bg-red-300/15 text-red-200' : 'bg-lime-300/10 text-lime-300'}`}
                >
                  {group.count}
                </span>
              </button>
            ))}
          </div>
        </section>
        {ignoredSynergies.size > 0 && (
          <section className="mt-5 rounded-2xl border border-red-300/20 bg-red-300/[0.035] p-5">
            <h2 className="font-heading text-lg font-semibold text-red-100">
              Ignored synergy tags
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              These tags are excluded from every synergy and overall-score
              calculation.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {discoveredSynergies
                .filter((group) => group.ignored)
                .map((group) => (
                  <button
                    type="button"
                    key={group.tag}
                    onClick={() => setSelectedSynergy(group.tag)}
                    className="flex items-center gap-2 rounded-xl border border-red-300/25 bg-red-300/10 px-3 py-2 text-xs text-red-200"
                  >
                    <span>{displayTag(group.tag)}</span>
                    <span className="font-mono text-[10px]">{group.count}</span>
                  </button>
                ))}
            </div>
          </section>
        )}
      </div>
      {selectedSynergyGroup && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => setSelectedSynergy('')}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="synergy-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#101311] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-300">
                  Synergy preview
                </p>
                <h2
                  id="synergy-dialog-title"
                  className="mt-1 font-heading text-xl font-semibold text-white"
                >
                  {displayTag(selectedSynergyGroup.tag)}
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Shared by {selectedSynergyGroup.count} card
                  {selectedSynergyGroup.count === 1 ? '' : 's'} in this deck.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSynergy('')}
              >
                Close
              </Button>
            </div>
            <div className="grid max-h-[65vh] gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
              {selectedSynergyGroup.cards.map((card) => (
                <button
                  type="button"
                  key={keyOf(card)}
                  onClick={() => {
                    setFocusedKey(keyOf(card));
                    setSelectedSynergy('');
                  }}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-left hover:border-lime-300/30"
                >
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-white/5">
                    {card.cardData?.imageUri && (
                      <img
                        src={card.cardData.imageUri}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">
                      {card.name}
                      {card.name === commander && (
                        <Crown className="ml-1.5 inline size-3 text-lime-300" />
                      )}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-zinc-600">
                      {card.cardData?.typeLine}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-zinc-500">
                      {card.quantity}× · MV {card.cardData?.manaValue ?? '—'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {selectedSynergyGroup && (
        <Button
          className={`fixed right-6 top-24 z-[70] ${selectedSynergyGroup.ignored ? 'bg-red-400 text-red-950 hover:bg-red-300' : ''}`}
          variant={selectedSynergyGroup.ignored ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            setIgnoredSynergies((current) => {
              const next = new Set(current);
              if (next.has(selectedSynergyGroup.tag))
                next.delete(selectedSynergyGroup.tag);
              else next.add(selectedSynergyGroup.tag);
              return next;
            })
          }
        >
          {selectedSynergyGroup.ignored
            ? 'Restore synergy tag'
            : 'Ignore synergy tag'}
        </Button>
      )}
    </main>
  );
}
