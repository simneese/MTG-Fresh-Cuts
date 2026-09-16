import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Crown,
  Link2,
  Minus,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import FoilIndicator from '@/components/FoilIndicator';
import type { WorkspaceCard } from '@/DeckWorkspace';
import { extractCardEffects } from '@/synergy-engine';
import type { CardEffect, EngineSignals } from '@/synergy-engine';
type Criterion =
  | 'all'
  | 'curve'
  | 'synergy'
  | 'price'
  | 'popularity';
type Props = {
  deckName: string;
  commander: string;
  cards: WorkspaceCard[];
  cardCount: number;
  target: number;
  contextualPopularity?: Map<string, ContextualPopularity>;
  onCardQuantityChange: (key: string, quantity: number) => void;
  onBack: () => void;
};
export type ContextualPopularity = {
  rank: number;
  poolSize: number;
  percentile: number;
  colorIdentity: string;
};

function OverflowConnectionTags({
  tags,
  renderTag,
  onSelect,
  moreClassName,
}: {
  tags: string[];
  renderTag: (tag: string) => ReactNode;
  onSelect: (tag: string) => void;
  moreClassName: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const calculate = () => {
      const widths = [...measure.children].map(
        (child) => (child as HTMLElement).getBoundingClientRect().width,
      );
      const gap = 4;
      const fullWidth = widths.reduce(
        (sum, width, index) => sum + width + (index ? gap : 0),
        0,
      );
      if (fullWidth <= row.clientWidth) {
        setVisibleCount(tags.length);
        return;
      }
      const moreControlWidth = 68;
      const available = Math.max(0, row.clientWidth - moreControlWidth - gap);
      let used = 0;
      let count = 0;
      for (const width of widths) {
        const next = used + (count ? gap : 0) + width;
        if (next > available) break;
        used = next;
        count += 1;
      }
      setVisibleCount(Math.max(0, count));
    };
    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(row);
    return () => observer.disconnect();
  });

  if (!tags.length)
    return <span className="text-[9px] text-zinc-700">None detected</span>;
  const hiddenTags = tags.slice(visibleCount);
  return (
    <div ref={rowRef} className="relative flex min-w-0 items-center gap-1">
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none fixed -left-[10000px] top-0 flex gap-1 opacity-0"
      >
        {tags.map((tag) => (
          <span key={tag} className="shrink-0">
            {renderTag(tag)}
          </span>
        ))}
      </div>
      {tags.slice(0, visibleCount).map((tag) => (
        <span key={tag} className="shrink-0">
          {renderTag(tag)}
        </span>
      ))}
      {hiddenTags.length > 0 && (
        <div className="group relative shrink-0">
          <button
            type="button"
            style={{ fontSize: '8px', lineHeight: '12px' }}
            className={`rounded px-0.5 font-normal hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current ${moreClassName}`}
            aria-haspopup="menu"
          >
            +{hiddenTags.length} more…
          </button>
          <div className="invisible absolute right-0 top-full z-[100] w-max max-w-64 translate-y-1 pt-2 opacity-0 transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <div className="rounded-lg border border-white/10 bg-zinc-950 p-2 shadow-2xl">
              <div className="flex max-w-60 flex-wrap gap-1" role="menu">
                {hiddenTags.map((tag) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={tag}
                    onClick={() => onSelect(tag)}
                    className="rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-300"
                  >
                    {renderTag(tag)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const CURVE_TARGET = [0.02, 0.1, 0.25, 0.28, 0.17, 0.1, 0.05];
const CURVE_BUCKET_WEIGHT = [0.7, 0.8, 0.9, 1, 1.2, 1.45, 1.75];
function curveTargetFor(manaValue: number) {
  if (manaValue < CURVE_TARGET.length) return CURVE_TARGET[manaValue];
  // The former 3% 7+ allowance is distributed across exact high-MV buckets.
  return 0.025 * 0.2 ** (manaValue - 7);
}
function curveWeightFor(manaValue: number) {
  return (
    CURVE_BUCKET_WEIGHT[manaValue] ??
    CURVE_BUCKET_WEIGHT.at(-1)! + (manaValue - 6) * 0.35
  );
}
function curveMinimumFor(manaValue: number) {
  return manaValue >= 4 ? 1 : 0;
}
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
const NAMED_TOKEN_TYPES = [
  'clue',
  'food',
  'treasure',
  'blood',
  'map',
  'gold',
  'powerstone',
  'incubator',
] as const;
const ROLE_TARGETS = [
  { name: 'Tutor', minimum: 1, maximum: 3 },
  { name: 'Board wipe', minimum: 2, maximum: 4 },
  { name: 'Removal', minimum: 6, maximum: 10 },
  { name: 'Card draw', minimum: 8, maximum: 12 },
  { name: 'Mana ramp', minimum: 8, maximum: 12 },
  { name: 'Protection', minimum: 3, maximum: 6 },
  { name: 'Recursion', minimum: 2, maximum: 5 },
  { name: 'Land', minimum: 34, maximum: 40 },
] as const;
type RoleName = (typeof ROLE_TARGETS)[number]['name'];
// These describe jobs a deck needs, not themes that become stronger merely
// because more cards share the same job. They remain visible as card tags and
// feed role coverage, but are excluded from theme/commander/tag-frequency fit.
const FUNCTIONAL_ROLE_TAGS = new Set([
  'tutor',
  'board wipe',
  'removal',
  'card draw',
  'mana ramp',
  'protection',
  'recursion',
  'counterspell',
  'color fixing',
  'cost reduction',
  'land',
]);
const INCIDENTAL_THEME_TAGS = new Set([
  'flying',
  'first strike',
  'double strike',
  'deathtouch',
  'haste',
  'hexproof',
  'indestructible',
  'menace',
  'reach',
  'trample',
  'vigilance',
  'ward',
  'flash',
]);
function isFunctionalRoleTag(tag: string) {
  return FUNCTIONAL_ROLE_TAGS.has(tag.trim().toLowerCase());
}
function isStrategicThemeTag(tag: string) {
  const normalizedTag = tag.trim().toLowerCase();
  return (
    !isFunctionalRoleTag(normalizedTag) &&
    !INCIDENTAL_THEME_TAGS.has(normalizedTag)
  );
}
function engineFamilyForTag(tag: string) {
  if (
    tag === 'sacrifice' ||
    tag === 'type-event: creature dies' ||
    /^type-event: (?:artifact|creature|land|token|clue|food|treasure|blood|map|gold|powerstone|incubator) sacrificed$/.test(
      tag,
    )
  )
    return 'engine: sacrifice';
  if (['token count', 'creature count'].includes(tag)) return `engine: ${tag}`;
  if (
    ['artifact count', 'treasure count', 'clue count', 'food count'].includes(
      tag,
    )
  )
    return `engine: ${tag}`;
  if (['life gain', 'burn', 'drain'].includes(tag))
    return tag === 'drain' ? 'engine: drain' : `engine: ${tag}`;
  return tag;
}
function conciseVisibleTags(tags: string[]) {
  const visible = new Set(tags);
  if ([...visible].some((tag) => /^type-event: .+ sacrificed$/.test(tag)))
    visible.delete('sacrifice');
  const namedCountTags = ['treasure count', 'clue count', 'food count'].filter(
    (tag) => visible.has(tag),
  );
  if (namedCountTags.length) {
    visible.delete('artifact count');
    visible.delete('token count');
  }
  const namedSacrificeTags = [
    'clue',
    'food',
    'treasure',
    'blood',
    'map',
    'gold',
    'powerstone',
    'incubator',
  ].filter((type) => visible.has(`type-event: ${type} sacrificed`));
  if (namedSacrificeTags.length) {
    visible.delete('type-event: artifact sacrificed');
    visible.delete('type-event: token sacrificed');
  }
  return [...visible];
}
function engineSignalsFor(
  card: WorkspaceCard,
  effects: CardEffect[] = extractCardEffects(card),
): EngineSignals {
  const text = oracleTextForTagging(card);
  const emits = new Set<string>();
  const listens = new Set<string>();
  const sacrifice = sacrificeAmounts(card);
  if ((sacrifice.amounts.get('creature') ?? 0) > 0) {
    emits.add('creature-sacrificed');
    emits.add('creature-dies');
    emits.add('creature-ltb');
  }
  if ((sacrifice.amounts.get('token') ?? 0) > 0) {
    emits.add('token-sacrificed');
    emits.add('token-ltb');
  }
  if (/\bdestroy\b[^.\n]*\bcreatures?\b/.test(text)) {
    emits.add('creature-dies');
    emits.add('creature-ltb');
  }
  if (/\b(?:exile|return)\b[^.\n]*\bcreatures?\b/.test(text))
    emits.add('creature-ltb');
  if (
    /\b(?:when|whenever|if)\b[^.\n]*\bcreatures?\b[^.\n]*\bdies?\b|\bcreature (?:card )?is put into [^.\n]*graveyard from the battlefield\b/.test(
      text,
    )
  )
    listens.add('creature-dies');
  if (
    /\b(?:when|whenever|if)\b[^.\n]*\b(?:player|you|opponent)\b[^.\n]*\bsacrifices?\b[^.\n]*\bcreatures?\b|\bwhenever you sacrifice\b[^.\n]*\bcreatures?\b/.test(
      text,
    )
  )
    listens.add('creature-sacrificed');
  if (
    /\b(?:when|whenever|if)\b[^.\n]*\btokens?\b[^.\n]*\bleaves? the battlefield\b/.test(
      text,
    )
  )
    listens.add('token-ltb');
  if (
    /\b(?:when|whenever|if)\b[^.\n]*\bcreatures?\b[^.\n]*\bleaves? the battlefield\b/.test(
      text,
    )
  )
    listens.add('creature-ltb');
  effects.forEach((effect) => {
    const signal =
      effect.event === 'sacrificed'
        ? `${effect.subject.kind}-sacrificed`
        : effect.event === 'dies'
          ? `${effect.subject.kind}-dies`
          : effect.event === 'leaves-battlefield'
            ? `${effect.subject.kind}-ltb`
            : null;
    if (!signal) return;
    if (effect.direction === 'listens') listens.add(signal);
    else if (['emits', 'creates', 'transforms'].includes(effect.direction))
      emits.add(signal);
  });
  return { emits, listens };
}
function signalsConnect(first: EngineSignals, second: EngineSignals) {
  return (
    [...first.emits].some((signal) => second.listens.has(signal)) ||
    [...first.listens].some((signal) => second.emits.has(signal))
  );
}
function keyOf(card: WorkspaceCard) {
  return card.key ?? card.name;
}
function isBasicLand(card: WorkspaceCard) {
  return (
    /\bbasic\b.*\bland\b/i.test(card.cardData?.typeLine ?? '') ||
    /^(?:plains|island|swamp|mountain|forest|wastes|snow-covered (?:plains|island|swamp|mountain|forest))$/i.test(
      card.name,
    )
  );
}
function isSelfRecurringCreature(card: WorkspaceCard) {
  const frontType = card.cardData?.typeLine?.split('//')[0] ?? '';
  if (!/\bcreature\b/i.test(frontType)) return false;
  const text = oracleTextForTagging(card);
  const frontName = card.name.split('//')[0].trim().toLowerCase();
  const escapedName = frontName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const returnsSelf = new RegExp(
    `\\breturn (?:${escapedName}|this card|this creature|it)\\b[^.]*\\b(?:from (?:your|the) graveyard|to (?:your|its owner'?s) hand|to the battlefield)\\b`,
  ).test(text);
  const castsSelf = new RegExp(
    `\\b(?:you may )?cast (?:${escapedName}|this card|this creature)\\b[^.]*\\bfrom (?:your|a) graveyard\\b`,
  ).test(text);
  return (
    returnsSelf ||
    castsSelf ||
    /\b(?:escape|persist|undying)\b/.test(text) ||
    Boolean(
      card.cardData?.keywords?.some((keyword) =>
        ['escape', 'persist', 'undying'].includes(keyword.toLowerCase()),
      ),
    )
  );
}
function previewImage(uri?: string) {
  return uri?.replace('/normal/', '/large/');
}
function cardFillsRole(card: WorkspaceCard, role: RoleName, tags: string[]) {
  const text = oracleTextForTagging(card);
  if (role === 'Tutor') return tags.includes('tutor');
  if (role === 'Board wipe')
    return /\b(?:destroy|exile) all\b|\ball (?:creatures|artifacts|enchantments|permanents)\b[^.]*\b(?:destroyed|exiled)\b/.test(
      text,
    );
  if (role === 'Removal') return tags.includes('removal');
  if (role === 'Card draw') return tags.includes('card draw');
  if (role === 'Mana ramp')
    return tags.includes('mana ramp') || tags.includes('cost reduction');
  if (role === 'Protection')
    return (
      tags.includes('protection') ||
      tags.includes('counterspell') ||
      /\b(?:target|another|creatures? you control|permanents? you control)\b[^.]*(?:indestructible|hexproof|protection from)/.test(
        text,
      )
    );
  if (role === 'Land') return tags.includes('land');
  return tags.includes('recursion');
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
function popularityCutScore(
  card: WorkspaceCard,
  contextualPopularity?: ContextualPopularity,
) {
  const rank = card.cardData?.edhrecRank;
  if (!rank || rank < 1) return 0.5;
  const percentile = contextualPopularity
    ? contextualPopularity.percentile
    : Math.min(1, Math.max(0, (rank - 1) / 24999));
  return Math.sqrt(percentile);
}
function subtypesOf(card?: WorkspaceCard) {
  const frontType = card?.cardData?.typeLine?.split('//')[0] ?? '';
  const [, subtypes] = frontType.split('—').map((part) => part.trim());
  return subtypes
    ? subtypes
        .split(/\s+/)
        .filter(Boolean)
        .map((type) => type.toLowerCase())
    : [];
}
function oracleTextForTagging(card?: WorkspaceCard) {
  const text = card?.cardData?.oracleText.toLowerCase() ?? '';
  // Parenthetical reminder text explains rules rather than adding effects to
  // the card. Ignoring it prevents phrases such as protection's "can't be
  // blocked" or Food's "sacrifice this artifact" from creating false tags.
  return text.replace(/\([^)]*\)/g, '');
}
function cardHasOverload(card?: WorkspaceCard) {
  const text = oracleTextForTagging(card);
  return (
    /\boverload\b/.test(text) ||
    Boolean(
      card?.cardData?.keywords?.some(
        (keyword) => keyword.toLowerCase() === 'overload',
      ),
    )
  );
}
function overloadAffects(card: WorkspaceCard, resource: string) {
  if (!cardHasOverload(card)) return false;
  const text = oracleTextForTagging(card);
  return new RegExp(`\\btarget [^.]*\\b${resource}\\b`).test(text);
}
const synergyTagCache = new WeakMap<
  WorkspaceCard,
  { knownTypesKey: string; tags: string[] }
>();
function synergyTags(card?: WorkspaceCard, knownTypes: string[] = []) {
  if (!card) return [];
  const knownTypesKey = knownTypes.join('\u0000');
  const cached = synergyTagCache.get(card);
  if (cached?.knownTypesKey === knownTypesKey) return cached.tags;
  const tags = new Set<string>();
  const text = oracleTextForTagging(card);
  const typeFaces = (card.cardData?.typeLine ?? '').split(/\s+\/\/\s+/);
  const textFaces = text.split(/\n\/\/\n/);
  const hasLandFace = typeFaces.some((typeLine) => /\bland\b/i.test(typeLine));
  if (hasLandFace) tags.add('land');
  (card.cardData?.keywords?.length
    ? card.cardData.keywords.filter(
        (keyword) =>
          !['double', 'protection'].includes(keyword.toLowerCase()),
      )
    : FALLBACK_KEYWORDS.filter((keyword) =>
        new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'i').test(text),
      )
  ).forEach((keyword) => tags.add(keyword.trim().toLowerCase()));
  if (
    /\bdraws? (?:a|one|two|three|four|\d+) cards?\b|\bdraw cards equal\b|\bcard draw\b/.test(
      text,
    )
  )
    tags.add('card draw');
  if (/search your library for [^.]*\bland\b/.test(text))
    tags.add('land fetching');
  if (/\bsearch (?:your|their|that player'?s) library for\b/.test(text))
    tags.add('tutor');
  const rampText = hasLandFace
    ? textFaces
        .filter((_, index) => !/\bland\b/i.test(typeFaces[index] ?? ''))
        .join('\n')
    : text;
  if (
    /\badd (?:\{|one mana|two mana|three mana)|\bland card[^.]*onto the battlefield|\bput [^.]*land[^.]*onto the battlefield|\buntap (?:all|each|up to [^.]+) lands?\b|\blands? you control [^.]*untap|\bproduces? (?:twice|three times) as much mana\b|\badditional mana\b/.test(
      rampText,
    )
  )
    tags.add('mana ramp');
  if (
    /\bcosts? [^.]* less to cast\b|\bspells? [^.]* cost [^.]* less\b|\breduce [^.]* cost\b|\brather than pay [^.]* mana cost\b|\bwithout paying (?:its|their|the) mana cost\b|\b(?:affinity|convoke|delve|improvise)\b/.test(
      text,
    ) ||
    card.cardData?.keywords?.some((keyword) =>
      ['affinity', 'convoke', 'delve', 'improvise'].some((mechanic) =>
        keyword.toLowerCase().startsWith(mechanic),
      ),
    )
  )
    tags.add('cost reduction');
  const producedColors = new Set(
    (card.cardData?.producedMana ?? []).filter((mana) =>
      ['W', 'U', 'B', 'R', 'G'].includes(mana),
    ),
  );
  const explicitlyFixesColors =
    /\badd (?:one|two|three|\{[^}]+\}) mana of any color\b|\badd one mana of any (?:color|type)\b|\badd mana in any combination of colors\b/.test(
      text,
    );
  if (producedColors.size >= 2 || explicitlyFixesColors)
    tags.add('color fixing');
  const investigates =
    /\binvestigate\b/.test(text) ||
    card.cardData?.keywords?.some(
      (keyword) => keyword.toLowerCase() === 'investigate',
    );
  const producesClue =
    /\bcreates? [^.]*\bclues?\b|\bclue tokens?\b/.test(text) || investigates;
  const producesToken =
    /\bcreates? [^.]*\btoken/.test(text) || producesClue;
  const producesCreatureToken =
    /\bcreates? [^.]*\bcreatures? tokens?\b/.test(text);
  const producesTreasure =
    /\bcreates? [^.]*\btreasure|\btreasure tokens?\b/.test(text);
  const producesFood = /\bcreates? [^.]*\bfood|\bfood tokens?\b/.test(text);
  if (/\bgain control of [^.]*\bcreatures?\b/.test(text))
    tags.add('creature theft');
  const improvesCombatDamage =
    /\bcombat damage\b|\b(?:double|triple) (?:that|the|all)?\s*damage\b|\bdeals? (?:twice|three times) that much damage\b|\bdouble strike\b|\btrample\b|\bcan'?t be blocked\b|\bunblockable\b/.test(
      text,
    ) ||
    card.cardData?.keywords?.some((keyword) =>
      ['double strike', 'trample'].includes(keyword.toLowerCase()),
    );
  if (improvesCombatDamage) tags.add('combat damage');
  const overloadsArtifactEffect = overloadAffects(card, 'artifacts?');
  const overloadsTreasureEffect = overloadAffects(card, 'treasures?');
  const overloadsClueEffect = overloadAffects(card, 'clues?');
  const overloadsFoodEffect = overloadAffects(card, 'food');
  const overloadsTokenEffect = overloadAffects(card, 'tokens?');
  const overloadsCreatureEffect = overloadAffects(card, 'creatures?');
  const countsArtifacts =
    /\b(?:number of|for each) artifacts?\b|\bartifacts you control\b|\b(?:you )?control (?:one|two|three|four|five|\d+) or more artifacts?\b|\baffinity for artifacts\b|\bmetalcraft\b/.test(
      text,
    ) ||
    /\bimprovise\b/.test(text) ||
    overloadsArtifactEffect ||
    card.cardData?.keywords?.some(
      (keyword) => keyword.toLowerCase() === 'improvise',
    );
  if (countsArtifacts || producesTreasure || producesClue || producesFood)
    tags.add('artifact count');
  const countsTreasures =
    /\b(?:number of|for each) treasures?\b|\btreasures you control\b|\b(?:you )?control (?:one|two|three|four|five|\d+) or more treasures?\b/.test(
      text,
    );
  if (countsTreasures || producesTreasure || overloadsTreasureEffect)
    tags.add('treasure count');
  const countsClues =
    /\b(?:number of|for each) clues?\b|\bclues you control\b|\b(?:you )?control (?:one|two|three|four|five|\d+) or more clues?\b/.test(
      text,
    );
  if (countsClues || producesClue || overloadsClueEffect)
    tags.add('clue count');
  const countsFood =
    /\b(?:number of|for each) food\b|\bfood you control\b|\b(?:you )?control (?:one|two|three|four|five|\d+) or more food\b/.test(
      text,
    );
  if (countsFood || producesFood || overloadsFoodEffect)
    tags.add('food count');
  const countsTokens =
    /\b(?:number of|for each) tokens?\b|\btokens you control\b|\b(?:you )?control (?:one|two|three|four|five|\d+) or more tokens?\b/.test(
      text,
    );
  if (countsTokens || producesToken || overloadsTokenEffect)
    tags.add('token count');
  const countsCreatures =
    /\b(?:number of|for each) creatures?\b|\bcreatures you control\b|\b(?:you )?control (?:one|two|three|four|five|\d+) or more creatures?\b/.test(
      text,
    );
  if (countsCreatures || producesCreatureToken || overloadsCreatureEffect)
    tags.add('creature count');
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
    /\b(?:return|put) [^.]*\b(?:from|in) (?:your|a|any|an opponent'?s|target player'?s) graveyard\b[^.]*(?:\bto|\bon|\bonto) (?:(?:your hand|the battlefield)|(?:the )?top of (?:your|its owner'?s|that player'?s|their) library)|\bgraveyard to (?:your hand|the battlefield|the top of your library)|\b(?:put|placed) into (?:your|a) graveyard from the battlefield\b[^.]*\breturn (?:this card|this creature|it|[^.]+?)\b[^.]*(?:\bto|\bonto) (?:your hand|the battlefield|the top of your library)|\b(?:you may )?cast [^.]*\bfrom (?:your|a|any) graveyard\b|\bthis (?:card|creature|spell) may be cast from (?:your|a|any) graveyard\b/.test(
      text,
    )
  )
    tags.add('recursion');
  const grantsDeathReturn =
    /\b(?:target |another |enchanted |equipped )?creatures?(?: you control)?\b[^.\n]*(?:gains?|has|have)\b[^.\n]*\bwhen(?:ever)? (?:this|that) creature dies\b[^.\n]*\breturn (?:it|that card)\b[^.\n]*\b(?:to|onto) the battlefield\b/.test(
      text,
    );
  if (grantsDeathReturn) {
    tags.add('recursion');
    tags.add('protection');
  }
  const forcesOtherPlayerSacrifice =
    /\b(?:each player|each opponent|target (?:player|opponent)|an opponent|that player|its controller)\b[^.\n]*\bsacrifices?\b[^.\n]*\b(?:artifact|creature|enchantment|land|permanent|planeswalker|battle|token)s?\b/.test(
      text,
    );
  if (
    /\b(?:destroy|exile) (?:target|all|each)\b|\beach player (?:destroys|exiles)\b|deals? \d+ damage to any target/.test(
      text,
    ) || forcesOtherPlayerSacrifice
  )
    tags.add('removal');
  const isCounterspell =
    /\bcounter (?:target|all|each|that) [^.]*\b(?:spells?|abilit(?:y|ies))\b|\bwhenever you counter\b|\bspells? (?:is|are|was|were) countered\b/.test(
      text,
    );
  if (isCounterspell) tags.add('counterspell');
  const grantsProtection =
    /\b(?:target|another|creatures? you control|permanents? you control)\b[^.]*(?:indestructible|hexproof|protection from)|\bregenerate target\b/.test(
      text,
    );
  if (isCounterspell || grantsProtection) tags.add('protection');
  const gainsLife =
    /\b(?:you|its controller|that player) gains? (?:that much|x|\d+|one|two|three|four|five|a) life\b|\bgain life equal to\b/.test(
      text,
    ) || tags.has('lifelink');
  const caresAboutLifeGain =
    /\b(?:when|whenever|if) (?:you|a player) gain(?:s)? life\b|\bif you would gain life\b/.test(
      text,
    );
  const opponentLosesLife =
    /\b(?:(?:target|each|an) opponent|your opponents?) loses? (?:that much|x|\d+|one|two|three|four|five|a) life\b/.test(
      text,
    );
  const caresAboutOpponentLifeLoss =
    /\b(?:when|whenever|if) (?:an |each |target |your )?opponents? loses? life\b/.test(
      text,
    );
  if (gainsLife || caresAboutLifeGain) tags.add('life gain');
  if (
    opponentLosesLife ||
    caresAboutOpponentLifeLoss ||
    /\bdeals? (?:(?:\d+|x|that much) damage|damage equal to)\b/.test(text)
  )
    tags.add('burn');
  const isDrain = text.split(/\n+/).some(
    (segment) =>
      /\b(?:opponent|opponents|target player)\b[^.]*\b(?:lose|loses|lost)\b[^.]*\blife\b/.test(
        segment,
      ) && /\b(?:gain|gains|gained)\b[^.]*\blife\b/.test(segment),
  );
  if (isDrain) tags.add('drain');
  if (/\bdiscards?\b|\bdiscard (?:a|one|two|three|\d+) cards?\b/.test(text))
    tags.add('discard');
  if (
    /\bsacrifices?\b|\bsacrificed\b|\bsacrifice (?:a|an|another|one|two|three|\d+)\b/.test(
      text,
    )
  )
    tags.add('sacrifice');
  // A token-LTB trigger is a broad payoff for token sacrifice: sacrificing a
  // token necessarily makes it leave the battlefield, even though exile and
  // bounce can satisfy the same trigger too. Give it the matching themes but
  // no sacrifice amount, so it is classified as a payoff rather than an
  // enabler (for example, Nadier's Nightblade).
  const watchesTokensLeaveBattlefield =
    /\b(?:when|whenever|if)\b[^.\n]*\b(?:one or more |a |another )?tokens?(?: you control)?\b[^.\n]*\bleaves? the battlefield\b/.test(
      text,
    );
  if (watchesTokensLeaveBattlefield) {
    tags.add('sacrifice');
    tags.add('type-event: token sacrificed');
  }
  const addTypeEvent = (type: string, event: string) =>
    tags.add(`type-event: ${type} ${event}`);
  const sacrificeSubjects = [
    ...text.matchAll(/\bsacrific(?:e|es)\s+([^:.,;\n]+)/g),
  ].map((match) => match[1].trim());
  const frontName = card.name.split('//')[0].trim().toLowerCase();
  const selfIsSacrificed = sacrificeSubjects.some(
    (subject) =>
      subject.includes(frontName) ||
      /^(?:it|this permanent|this card|this creature|this artifact|this land|this token)$/.test(
        subject,
      ),
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
    /\bcreatures? (?:you control )?\bdies?\b|\bwhenever [^.]*\bcreature [^.]*\bdies?\b|\b(?:another |a |target )?creature (?:card )?is put into [^.]*\bgraveyard from the battlefield\b/.test(
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
  if (sacrificeReferences('creature')) addTypeEvent('creature', 'dies');
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
  if (/\btoken [^.]*\benters?\b/.test(text)) addTypeEvent('token', 'enters');
  if (/\btokens? [^.]*\bdies?\b/.test(text)) addTypeEvent('token', 'dies');
  if (
    sacrificeReferences('token') ||
    /\btokens? (?:is|are|was|were|you control is) sacrificed\b/.test(text)
  )
    addTypeEvent('token', 'sacrificed');
  NAMED_TOKEN_TYPES.forEach((type) => {
    if (
      sacrificeReferences(type) ||
      (selfIsSacrificed && subtypesOf(card).includes(type)) ||
      new RegExp(
        `\\b${type}s? (?:is|are|was|were|you control is) sacrificed\\b`,
      ).test(text)
    )
      addTypeEvent(type, 'sacrificed');
  });
  subtypesOf(card).forEach((type) => tags.add(`type: ${type}`));
  knownTypes.forEach((type) => {
    const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plurals = type.endsWith('f')
      ? `${type.slice(0, -1)}ves`
      : type.endsWith('y')
        ? `${type.slice(0, -1)}ies`
        : `${type}s`;
    if (new RegExp(`\\b(?:${escaped}|${plurals})\\b`, 'i').test(text))
      tags.add(`type: ${type}`);
  });
  const result = [...tags];
  synergyTagCache.set(card, { knownTypesKey, tags: result });
  return result;
}
function isModalDoubleFacedCard(card: WorkspaceCard) {
  const typeFaces = (card.cardData?.typeLine ?? '').split(/\s+\/\/\s+/);
  const text = card.cardData?.oracleText.toLowerCase() ?? '';
  return (
    Boolean(card.cardData?.backImageUri) &&
    typeFaces.length > 1 &&
    !/\b(?:transform|transformed|meld)\b/.test(text)
  );
}
function roleFaceOptions(card: WorkspaceCard, knownTypes: string[]) {
  const combinedTags = synergyTags(card, knownTypes);
  if (!isModalDoubleFacedCard(card)) {
    return [
      new Set(
        ROLE_TARGETS.filter((role) =>
          cardFillsRole(card, role.name, combinedTags),
        ).map((role) => role.name),
      ),
    ];
  }
  const typeFaces = (card.cardData?.typeLine ?? '').split(/\s+\/\/\s+/);
  const textFaces = (card.cardData?.oracleText ?? '').split(/\n\/\/\n/);
  if (typeFaces.length !== textFaces.length) {
    return [
      new Set(
        ROLE_TARGETS.filter((role) =>
          cardFillsRole(card, role.name, combinedTags),
        ).map((role) => role.name),
      ),
    ];
  }
  return typeFaces.map((typeLine, index) => {
    const faceCard: WorkspaceCard = {
      ...card,
      cardData: card.cardData
        ? {
            ...card.cardData,
            type: typeLine.split('—')[0].trim(),
            typeLine,
            oracleText: textFaces[index] ?? '',
            keywords: [],
            producedMana: /\bland\b/i.test(typeLine)
              ? card.cardData.producedMana
              : [],
          }
        : undefined,
    };
    const faceTags = synergyTags(faceCard, knownTypes);
    return new Set(
      ROLE_TARGETS.filter((role) =>
        cardFillsRole(faceCard, role.name, faceTags),
      ).map((role) => role.name),
    );
  });
}
function createdTokenAmount(card: WorkspaceCard, resource?: string) {
  const text = card.cardData?.oracleText.toLowerCase() ?? '';
  const numberWords: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  let highest = 0;
  for (const match of text.matchAll(
    /\bcreates?\s+(a|an|one|two|three|four|five|six|\d+|x|that many)\s+([^.;]+)/g,
  )) {
    const created = match[2];
    if (!/\btokens?\b/.test(created)) continue;
    if (resource && !new RegExp(`\\b${resource}\\b`).test(created)) continue;
    const amount =
      numberWords[match[1]] ??
      (/^\d+$/.test(match[1]) ? Number(match[1]) : 3);
    highest = Math.max(highest, amount);
  }
  return highest;
}
function clueProductionAmount(card: WorkspaceCard) {
  const text = card.cardData?.oracleText.toLowerCase() ?? '';
  let investigateAmount = 0;
  if (/\binvestigate\b/.test(text)) {
    investigateAmount = /\binvestigate (?:twice|two times)\b/.test(text)
      ? 2
      : /\binvestigate (?:three times|thrice)\b/.test(text)
        ? 3
        : 1;
  } else if (
    card.cardData?.keywords?.some(
      (keyword) => keyword.toLowerCase() === 'investigate',
    )
  ) {
    investigateAmount = 1;
  }
  return Math.max(createdTokenAmount(card, 'clues?'), investigateAmount);
}
function countSynergyProductionAmount(card: WorkspaceCard, tag: string) {
  return (
    tag === 'artifact count' || tag === 'treasure count'
      ? tag === 'artifact count'
        ? createdTokenAmount(card, 'treasures?') +
          clueProductionAmount(card) +
          createdTokenAmount(card, 'food')
        : createdTokenAmount(card, 'treasures?')
      : tag === 'clue count'
        ? clueProductionAmount(card)
      : tag === 'food count'
        ? createdTokenAmount(card, 'food')
      : tag === 'creature count'
        ? createdTokenAmount(card, 'creatures?')
        : tag === 'token count'
          ? Math.max(createdTokenAmount(card), clueProductionAmount(card))
          : 0
  );
}
function manaRampOutputAmount(card: WorkspaceCard) {
  const text = oracleTextForTagging(card);
  if (/\buntap (?:all|each) lands? you control\b/.test(text)) return 4;
  if (/\bproduces? three times as much mana\b/.test(text)) return 6;
  if (/\bproduces? twice as much mana\b/.test(text)) return 4;
  if (/\badditional mana\b/.test(text)) return 2;
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  const amounts: number[] = [];
  text.split(/\n+/).forEach((segment) => {
    if (!/\badd\b[^.]*\bmana\b|\badd\s+\{/.test(segment)) return;
    const wordAmount = segment.match(
      /\badd (one|two|three|four|five|six|\d+) mana\b/,
    );
    const symbolAmount = [...segment.matchAll(/\badd\s+((?:\{[^}]+\})+)/g)]
      .map((match) => match[1].match(/\{[^}]+\}/g)?.length ?? 0)
      .reduce((maximum, count) => Math.max(maximum, count), 0);
    const grossOutput = Math.max(
      wordAmount
        ? (numberWords[wordAmount[1]] ?? Number(wordAmount[1]))
        : 0,
      symbolAmount,
      /\badd (?:a|one) mana of any (?:color|type)\b/.test(segment) ? 1 : 0,
    );
    const activationCostText = segment.includes(':')
      ? segment.slice(0, segment.indexOf(':'))
      : '';
    const manaCost = [...activationCostText.matchAll(/\{([^}]+)\}/g)].reduce(
      (total, match) => {
        const symbol = match[1].toUpperCase();
        if (symbol === 'T' || symbol === 'Q' || symbol === 'X') return total;
        if (/^\d+$/.test(symbol)) return total + Number(symbol);
        return total + 1;
      },
      0,
    );
    if (grossOutput > 0) amounts.push(Math.max(0, grossOutput - manaCost));
  });
  const landAmount = text.match(
    /\bput (?:up to )?(a|one|two|three|four|\d+) [^.]*lands?[^.]*onto the battlefield\b/,
  );
  if (landAmount)
    amounts.push(
      landAmount[1] === 'a'
        ? 1
        : (numberWords[landAmount[1]] ?? Number(landAmount[1])),
    );
  return Math.max(0, ...amounts);
}
function sacrificeAmounts(card: WorkspaceCard) {
  const text = oracleTextForTagging(card);
  const amounts = new Map<string, number>();
  let total = 0;
  const frontName = card.name.split('//')[0].trim().toLowerCase();
  const frontTypes = (
    card.cardData?.typeLine?.split('//')[0].split('—')[0] ?? ''
  ).toLowerCase();
  const numberWords: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  for (const match of text.matchAll(/\bsacrific(?:e|es)\s+([^:.;\n]+)/g)) {
    const sentenceStart = text.lastIndexOf('.', match.index ?? 0) + 1;
    const prefix = text.slice(sentenceStart, match.index).trim();
    const triggerStart = prefix.search(/\b(?:when|whenever|if)\b/);
    // A sacrifice before the trigger's separating comma is something the
    // card watches for (a payoff). A sacrifice after that comma is the effect
    // the triggered ability causes (an enabler), as on Accursed Marauder.
    if (triggerStart >= 0 && !prefix.slice(triggerStart).includes(','))
      continue;
    const subject = match[1];
    let types = [
      'artifact',
      'creature',
      'land',
      'token',
      ...NAMED_TOKEN_TYPES,
    ].filter((type) => new RegExp(`\\b${type}s?\\b`).test(subject));
    if (
      subject.includes(frontName) ||
      /^(?:it|this permanent|this card|this creature|this artifact|this land|this token)$/.test(
        subject,
      )
    ) {
      types = [
        ...new Set([
          ...types,
          ...['artifact', 'creature', 'land'].filter((type) =>
            frontTypes.includes(type),
          ),
          ...NAMED_TOKEN_TYPES.filter((type) =>
            subtypesOf(card).includes(type),
          ),
        ]),
      ];
    }
    const quantityMatch = subject.match(
      /\b(a|an|one|two|three|four|five|six|\d+)\b/,
    );
    const quantity = /\b(?:any number of|one or more)\b/.test(subject)
      ? 3
      : /\ball\b/.test(subject)
        ? 4
        : quantityMatch
          ? (numberWords[quantityMatch[1]] ?? Number(quantityMatch[1]))
          : 1;
    const playerMultiplier = /\beach player\b/.test(prefix)
      ? 4
      : /\beach opponent\b/.test(prefix)
        ? 3
        : 1;
    const amount = quantity * playerMultiplier;
    if (types.length) {
      types.forEach((type) =>
        amounts.set(type, Math.max(amounts.get(type) ?? 0, amount)),
      );
      total = Math.max(total, amount * types.length);
    } else if (/\bpermanents?\b/.test(subject)) {
      total = Math.max(total, amount);
    }
  }
  return { amounts, total };
}
function sacrificeSynergyAmount(card: WorkspaceCard, tag: string) {
  const { amounts, total } = sacrificeAmounts(card);
  if (tag === 'sacrifice') return total;
  const match = tag.match(
    /^type-event: (artifact|creature|land|token|clue|food|treasure|blood|map|gold|powerstone|incubator) sacrificed$/,
  );
  return match ? (amounts.get(match[1]) ?? 0) : 0;
}
function repeatabilityForSynergy(card: WorkspaceCard, tag: string) {
  const isCountTag = [
    'artifact count',
    'treasure count',
    'clue count',
    'food count',
    'token count',
    'creature count',
  ].includes(tag);
  const isSacrificeTag =
    tag === 'sacrifice' ||
    /^type-event: (?:artifact|creature|land|token|clue|food|treasure|blood|map|gold|powerstone|incubator) sacrificed$/.test(
      tag,
    );
  const text = oracleTextForTagging(card);
  const specificSacrificeType = tag.match(
    /^type-event: (artifact|creature|land|token|clue|food|treasure|blood|map|gold|powerstone|incubator) sacrificed$/,
  )?.[1];
  const countResource =
    tag === 'artifact count'
      ? '(?:artifacts?|treasures?|clues?|food)'
      : tag === 'treasure count'
        ? 'treasures?'
      : tag === 'clue count'
          ? '(?:clues?|investigate)'
        : tag === 'food count'
          ? 'food'
      : tag === 'creature count'
        ? 'creatures?'
        : tag === 'token count'
          ? 'tokens?'
          : '';
  const abilitySegments = text
    // Oracle text uses newline-delimited paragraphs for distinct abilities.
    // Keep every sentence in that paragraph together so timing restrictions
    // apply to the correct effect and cannot leak into another ability.
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const relevantSegments = abilitySegments
    .filter((segment) => {
      if (isSacrificeTag) {
        if (!/\bsacrific(?:e|es)\b/.test(segment)) return false;
        return specificSacrificeType
          ? new RegExp(`\\b${specificSacrificeType}s?\\b`).test(segment)
          : true;
      }
      const createsRelevantResource =
        /\bcreates?\b/.test(segment) &&
        new RegExp(`\\b${countResource}\\b`).test(segment);
      const countsRelevantResource =
        new RegExp(
          `\\b(?:number of|for each) ${countResource}\\b|\\b${countResource} you control\\b|\\bcontrol (?:one|two|three|four|five|\\d+) or more ${countResource}\\b`,
        ).test(segment);
      const namedMechanic =
        (tag === 'artifact count' &&
          /\b(?:improvise|metalcraft|affinity for artifacts)\b/.test(segment)) ||
        (['artifact count', 'clue count', 'token count'].includes(tag) &&
          /\binvestigate\b/.test(segment));
      if (isCountTag)
        return createsRelevantResource || countsRelevantResource || namedMechanic;
      const tagPatterns: Record<string, RegExp> = {
        'card draw': /\bdraws?\b|\bcard draw\b/,
        'land fetching': /\bsearch your library\b[^.]*\bland\b/,
        tutor: /\bsearch (?:your|their|that player'?s) library for\b/,
        'mana ramp': /\badd\b[^.]*\bmana\b|\bland\b[^.]*\bonto the battlefield\b|\buntap\b[^.]*\blands?\b|\bproduces?\b[^.]*\bmana\b|\badditional mana\b/,
        'cost reduction': /\bcosts?\b[^.]*\bless\b|\breduce\b[^.]*\bcost\b|\bwithout paying\b[^.]*\bmana cost\b|\brather than pay\b[^.]*\bmana cost\b|\b(?:affinity|convoke|delve|improvise)\b/,
        'creature theft': /\bgain control of\b[^.]*\bcreature\b/,
        'combat damage': /\bcombat damage\b|\bdouble strike\b|\btrample\b|\bcan'?t be blocked\b|\bunblockable\b|\b(?:double|triple)\b[^.]*\bdamage\b/,
        'impulse draw': /\bexile\b[^.]*\btop\b|\byou may (?:play|cast)\b/,
        '+1/+1 counters': /\b\+1\/\+1 counters?\b/,
        recursion:
          /\bgraveyard\b[^.]*\b(?:hand|battlefield|top of [^.]*library)\b|\b(?:return|put)\b[^.]*\bgraveyard\b|\bcast\b[^.]*\bfrom (?:your|a|any) graveyard\b/,
        removal:
          /\b(?:destroy|exile) (?:target|all|each)\b|\beach player (?:destroys|exiles)\b|\bdamage to any target\b|\b(?:each player|each opponent|target (?:player|opponent)|an opponent|that player|its controller)\b[^.\n]*\bsacrifices?\b[^.\n]*\b(?:artifact|creature|enchantment|land|permanent|planeswalker|battle|token)s?\b/,
        counterspell:
          /\bcounter (?:target|all|each|that) [^.]*\b(?:spells?|abilit(?:y|ies))\b|\bwhenever you counter\b|\bspells? (?:is|are|was|were) countered\b/,
        'life gain': /\b(?:gain|gains|gained)\b[^.]*\blife\b|\blifelink\b/,
        burn:
          /\bdeals?\b[^.]*\bdamage\b|\b(?:opponent|opponents)\b[^.]*\b(?:lose|loses|lost)\b[^.]*\blife\b/,
        drain:
          /\b(?:opponent|opponents|target player)\b[^.]*\b(?:lose|loses|lost)\b[^.]*\blife\b[^.]*(?:gain|gains|gained)\b[^.]*\blife\b|\b(?:gain|gains|gained)\b[^.]*\blife\b[^.]*\b(?:opponent|opponents|target player)\b[^.]*\b(?:lose|loses|lost)\b[^.]*\blife\b/,
        discard: /\bdiscards?\b/,
      };
      if (tagPatterns[tag]?.test(segment)) return true;
      const typeEvent = tag.match(/^type-event: (\w+) (.+)$/);
      if (typeEvent) {
        if (
          typeEvent[1] === 'creature' &&
          typeEvent[2] === 'dies' &&
          /\bcreature (?:card )?is put into [^.]*\bgraveyard from the battlefield\b/.test(
            segment,
          )
        )
          return true;
        return (
          new RegExp(`\\b${typeEvent[1]}s?\\b`).test(segment) &&
          new RegExp(`\\b${typeEvent[2].replace('to graveyard', 'graveyard')}\\b`).test(
            segment,
          )
        );
      }
      if (tag.startsWith('type: ')) return false;
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escapedTag}\\b`).test(segment);
    });
  if (!relevantSegments.length)
    return { repeatable: false, multiUsePerTurn: false, instantSpeed: false };
  const frontName = card.name.split('//')[0].trim().toLowerCase();
  const escapedName = frontName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isPermanent = !/\b(?:instant|sorcery)\b/.test(
    card.cardData?.typeLine?.split('//')[0] ?? '',
  );
  const segmentDetails = relevantSegments.map((segment) => {
    const recurringTrigger =
      /\b(?:at the beginning of|whenever|each (?:turn|upkeep|end step|combat)|once each turn)\b/.test(
        segment,
      ) && !/\bat the beginning of the next\b/.test(segment);
    const reusableGraveyardCast =
      tag === 'recursion' &&
      /\b(?:you may )?cast\b[^.]*\bfrom (?:your|a) graveyard\b/.test(segment) &&
      !/\bonly once (?:each|per) turn\b/.test(segment);
    const sacrificesSelf = new RegExp(
      `\\bsacrifice (?:this (?:permanent|card|creature|artifact|land|token)|${escapedName})\\b`,
    ).test(segment);
    const discardsSelf = new RegExp(
      `\\bdiscard (?:this card|${escapedName})\\b`,
    ).test(segment);
    const exilesSelf = new RegExp(
      `\\bexile (?:this (?:permanent|card|creature|artifact|land|token)|${escapedName})\\b`,
    ).test(segment);
    const reusableActivation =
      segment.includes(':') &&
      !sacrificesSelf &&
      !discardsSelf &&
      !exilesSelf &&
      !/\bactivate only once\b/.test(segment);
    const activatedAbility = segment.includes(':');
    const oncePerTurnLimit =
      /\b(?:activate|triggers?) only once (?:each|per) turn\b|\bonly once (?:each|per) turn\b/.test(
        segment,
      );
    const hasTapCost =
      /\{t\}\s*(?:,|:)|\btap (?:this|an?|another|target|untapped) [^:]*:/.test(
        segment,
      );
    const unrestrictedTrigger =
      /\b(?:whenever|each time)\b/.test(segment) && !oncePerTurnLimit;
    const multiUsePerTurn =
      unrestrictedTrigger ||
      (reusableActivation && !hasTapCost && !oncePerTurnLimit);
    const instantSpeed =
      (activatedAbility && !/\bactivate only as a sorcery\b/.test(segment)) ||
      (unrestrictedTrigger &&
        !/\b(?:only|during) (?:your|an opponent'?s) turn\b|\bonly during your (?:main phase|turn)\b/.test(
          segment,
        ));
    const continuousCountEffect =
      isCountTag &&
      isPermanent &&
      /\b(?:gets?|have|has|costs?) [^.]*\bfor each\b|\b(?:power|toughness|power and toughness) [^.]*\bnumber of\b/.test(
        segment,
      );
    const continuousGeneralEffect =
      !isCountTag &&
      !isSacrificeTag &&
      isPermanent &&
      !/\buntil end of turn\b/.test(segment) &&
      /\b(?:you control|your opponents? control|spells? you cast)\b[^.]*(?:\bhave\b|\bhas\b|\bgets?\b|\bcosts?\b)/.test(
        segment,
      );
    return {
      repeatable:
      recurringTrigger ||
      reusableGraveyardCast ||
      reusableActivation ||
      continuousCountEffect ||
      continuousGeneralEffect,
      multiUsePerTurn,
      instantSpeed,
    };
  });
  return {
    repeatable: segmentDetails.some((detail) => detail.repeatable),
    multiUsePerTurn: segmentDetails.some((detail) => detail.multiUsePerTurn),
    instantSpeed: segmentDetails.some((detail) => detail.instantSpeed),
  };
}
function overloadMultiEffectAmount(card: WorkspaceCard, tag: string) {
  if (!cardHasOverload(card)) return 0;
  const text = oracleTextForTagging(card);
  const affectedEffect: Record<string, RegExp> = {
    removal: /\b(?:destroy|exile) target\b/,
    burn: /\bdeals? [^.]* damage to target\b/,
    counterspell: /\bcounter target\b/,
    'creature theft': /\bgain control of target\b/,
    '+1/+1 counters': /\bput [^.]*\+1\/\+1 counters? on target\b/,
  };
  // "Each" has an unbounded board-dependent size; three represents a useful
  // multi-object baseline without allowing it to dominate the modifier scale.
  return affectedEffect[tag]?.test(text) ? 3 : 0;
}
function modalMultiEffectAmount(card: WorkspaceCard, tag: string) {
  const text = oracleTextForTagging(card);
  const choice = text.match(/\bchoose (one|two|three|four|\d+)\b/);
  if (!choice) return 0;
  const choiceValues: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
  };
  const chosen = choiceValues[choice[1]] ?? Number(choice[1]);
  if (
    tag === 'removal' &&
    (text.match(/\b(?:destroy|exile) (?:target|all|each)\b/g)?.length ?? 0) >=
      2
  )
    return chosen;
  return 0;
}
function lifeScalingBonus(card: WorkspaceCard, tag: string) {
  if (!['life gain', 'burn', 'drain'].includes(tag)) return 0;
  const text = oracleTextForTagging(card);
  const scalesLifeGain =
    /\b(?:you|its controller|that player) gains? (?:twice )?that much life\b/.test(
      text,
    );
  const scalesLifeLoss =
    /\b(?:they|that player|that opponent|target opponent|each opponent|an opponent) loses? (?:twice )?that much life\b/.test(
      text,
    );
  if (tag === 'life gain') return scalesLifeGain ? 0.5 : 0;
  if (tag === 'burn') return scalesLifeLoss ? 0.5 : 0;
  return scalesLifeGain || scalesLifeLoss ? 0.5 : 0;
}
function recursionDestinationBonus(card: WorkspaceCard, tag: string) {
  if (tag !== 'recursion') return 0;
  const text = oracleTextForTagging(card);
  const movesFromGraveyardToBattlefield = text.split(/\n+/).some(
    (ability) =>
      /\b(?:return|put)\b[^.]*\b(?:from|in) (?:your|a|any|target player'?s|an opponent'?s) graveyard\b[^.]*(?:\bto|\bonto) the battlefield\b/.test(
        ability,
      ) ||
      /\b(?:return|put)\b[^.]*\bgraveyard\b[^.]*(?:\bto|\bonto) the battlefield\b/.test(
        ability,
      ),
  );
  return movesFromGraveyardToBattlefield ? 0.5 : 0;
}
function tagModifier(card: WorkspaceCard, tag: string) {
  const countAmount = countSynergyProductionAmount(card, tag);
  const rampAmount = tag === 'mana ramp' ? manaRampOutputAmount(card) : 0;
  const sacrificeAmount = sacrificeSynergyAmount(card, tag);
  const overloadAmount = overloadMultiEffectAmount(card, tag);
  const modalAmount = modalMultiEffectAmount(card, tag);
  const amount = Math.max(
    countAmount,
    rampAmount,
    sacrificeAmount,
    overloadAmount,
    modalAmount,
  );
  const timing = repeatabilityForSynergy(card, tag);
  const repeatable = timing.repeatable;
  const quantityBonus =
    amount > 1 ? Math.min(1, (amount - 1) * 0.25) : 0;
  const repeatabilityBonus =
    amount > 0
      ? repeatable
        ? quantityBonus > 0
          ? quantityBonus * 2
          : 0.25
        : quantityBonus
      : repeatable
        ? 0.25
        : 0;
  const multiUseBonus = timing.multiUsePerTurn ? 0.25 : 0;
  const instantSpeedBonus = timing.instantSpeed ? 0.25 : 0;
  const scalingBonus = lifeScalingBonus(card, tag);
  const destinationBonus = recursionDestinationBonus(card, tag);
  const modifierBonus =
    repeatabilityBonus +
    multiUseBonus +
    instantSpeedBonus +
    scalingBonus +
    destinationBonus;
  const baseLabel =
    sacrificeAmount > 0
      ? 'enabler'
      : countAmount > 0 || rampAmount > 0
        ? 'producer'
        : overloadAmount > 0
          ? 'multi-target effect'
          : modalAmount > 0
            ? 'multi-mode effect'
        : scalingBonus > 0
          ? 'scaling effect'
          : 'effect';
  return {
    amount,
    amountLabel:
      tag === 'mana ramp' ? 'estimated net mana-equivalent' : 'relevant item',
    applied: amount > 0 || repeatable || scalingBonus > 0 || destinationBonus > 0,
    quantityBonus,
    repeatabilityBonus,
    multiUseBonus,
    instantSpeedBonus,
    scalingBonus,
    destinationBonus,
    modifierBonus,
    label: repeatable ? `repeatable ${baseLabel}` : baseLabel,
    repeatable,
    multiUsePerTurn: timing.multiUsePerTurn,
    instantSpeed: timing.instantSpeed,
    value: Math.min(3, 1 + modifierBonus),
  };
}

function roleQualityModifier(card: WorkspaceCard, role: RoleName) {
  const roleTags: Record<RoleName, string[]> = {
    Tutor: ['tutor'],
    'Board wipe': ['removal'],
    Removal: ['removal'],
    'Card draw': ['card draw'],
    'Mana ramp': ['mana ramp', 'cost reduction'],
    Protection: ['protection', 'counterspell'],
    Recursion: ['recursion'],
    Land: ['land'],
  };
  return Math.max(
    1,
    ...roleTags[role].map((tag) => tagModifier(card, tag).value),
  );
}
type SynergyRole = 'producer' | 'enabler' | 'payoff' | 'neutral';
function creatureTypeSynergyRoles(card: WorkspaceCard, tag: string) {
  const type = tag.startsWith('type: ') ? tag.slice(6) : '';
  if (!type) return { enabler: false, payoff: false };
  const text = oracleTextForTagging(card);
  const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plural = type.endsWith('f')
    ? `${type.slice(0, -1)}ves`
    : type.endsWith('y')
      ? `${type.slice(0, -1)}ies`
      : `${type}s`;
  const typePattern = `(?:${escaped}|${plural})`;
  const isMember =
    subtypesOf(card).includes(type) ||
    /\bchangeling\b|\bis every creature type\b/.test(text);
  const createsType = new RegExp(
    `\\bcreat(?:e|es)\\b[^.]*\\b${typePattern}\\b[^.]*\\bcreature tokens?\\b|\\bcreat(?:e|es)\\b[^.]*\\bcreature tokens?\\b[^.]*\\b${typePattern}\\b`,
  ).test(text);
  const grantsType = new RegExp(
    `\\b(?:becomes?|are)\\b[^.]*\\b${typePattern}\\b|\\b${typePattern}\\b in addition to (?:its|their) other types`,
  ).test(text);
  const payoff = [
    `\\b(?:other |each |target )?${typePattern}\\b[^.]*(?:get|get|gets|have|has|gain|gains|cost|costs|can'?t|may)`,
    `\\b(?:when|whenever|if)\\b[^.]*\\b${typePattern}\\b`,
    `\\b(?:for each|number of)\\b[^.]*\\b${typePattern}\\b`,
    `\\b${typePattern}\\b[^.]*(?:you control|enters?|dies?|attacks?|deals? combat damage)`,
    `\\b(?:sacrifice|reveal|search [^.]* for)\\b[^.]*\\b${typePattern}\\b`,
    `\\b(?:regenerate|protect)\\b[^.]*\\b${typePattern}\\b`,
  ].some((pattern) => new RegExp(pattern).test(text));
  return {
    // A creature supplies its tribe, while cards that create or grant the type
    // are also tribal enablers. Scoring later scales this by the tribe's actual
    // prevalence so a small package cannot rival the deck's dominant engine.
    enabler: isMember || createsType || grantsType,
    payoff,
  };
}
function drainRoles(card: WorkspaceCard) {
  const text = oracleTextForTagging(card);
  const gainTrigger =
    /\b(?:when|whenever|if) (?:you|a player) gain(?:s)? life\b/.test(text);
  const lossTrigger =
    /\b(?:when|whenever|if) (?:an |each |target |your )?opponents? loses? life\b/.test(
      text,
    );
  const gainEffect =
    /\b(?:you|its controller|that player) gains? (?:that much|x|\d+|one|two|three|four|five|a) life\b|\bgain life equal to\b/.test(
      text,
    );
  const lossEffect =
    /\b(?:(?:target|each|an) opponent|your opponents?|target player) loses? (?:that much|x|\d+|one|two|three|four|five|a) life\b/.test(
      text,
    );
  const converter =
    (gainTrigger && lossEffect) || (lossTrigger && gainEffect);
  const directDrain = gainEffect && lossEffect;
  return {
    enabler: directDrain,
    payoff: converter,
  };
}
function synergyRole(card: WorkspaceCard, tag: string): SynergyRole {
  const text = oracleTextForTagging(card);
  if (tag.startsWith('type: ')) {
    const roles = creatureTypeSynergyRoles(card, tag);
    return roles.payoff ? 'payoff' : roles.enabler ? 'enabler' : 'neutral';
  }
  if (
    [
      'artifact count',
      'treasure count',
      'clue count',
      'food count',
      'token count',
      'creature count',
    ].includes(tag)
  )
    return countSynergyProductionAmount(card, tag) > 0
      ? 'producer'
      : 'payoff';
  if (
    tag === 'sacrifice' ||
    /^type-event: (?:artifact|creature|land|token|clue|food|treasure|blood|map|gold|powerstone|incubator) sacrificed$/.test(
      tag,
    )
  )
    return sacrificeSynergyAmount(card, tag) > 0 ? 'enabler' : 'payoff';
  if (tag === 'type-event: creature dies')
    return sacrificeSynergyAmount(
      card,
      'type-event: creature sacrificed',
    ) > 0
      ? 'enabler'
      : 'payoff';
  if (tag === 'life gain') {
    const payoff = /\b(?:when|whenever|if) (?:you|a player) gain(?:s)? life\b/.test(
      text,
    );
    const producer =
      /\b(?:you|its controller|that player) gains? (?:that much|x|\d+|one|two|three|four|five|a) life\b|\bgain life equal to\b|\blifelink\b/.test(
        text,
      );
    return payoff && !producer ? 'payoff' : producer ? 'producer' : 'neutral';
  }
  if (tag === 'burn') {
    const payoff =
      /\b(?:when|whenever|if) (?:an |each |target |your )?opponents? loses? life\b/.test(
        text,
      );
    const producer =
      /\b(?:(?:target|each|an) opponent|your opponents?) loses? (?:that much|x|\d+|one|two|three|four|five|a) life\b|\bdeals?\b[^.]*\bdamage\b/.test(
        text,
      );
    return payoff && !producer ? 'payoff' : producer ? 'producer' : 'neutral';
  }
  if (tag === 'drain') {
    const roles = drainRoles(card);
    return roles.payoff ? 'payoff' : roles.enabler ? 'producer' : 'neutral';
  }
  return 'neutral';
}
function synergyPreviewRoles(card: WorkspaceCard, tag: string) {
  const text = oracleTextForTagging(card);
  if (tag.startsWith('type: ')) return creatureTypeSynergyRoles(card, tag);
  const producer = countSynergyProductionAmount(card, tag) > 0;
  const enabler = sacrificeSynergyAmount(card, tag) > 0;
  const countPayoffPatterns: Record<string, RegExp> = {
    'artifact count': /\b(?:number of|for each) artifacts?\b|\bartifacts you control\b|\b(?:improvise|metalcraft|affinity for artifacts)\b/,
    'treasure count': /\b(?:number of|for each) treasures?\b|\btreasures you control\b/,
    'clue count': /\b(?:number of|for each) clues?\b|\bclues you control\b/,
    'food count': /\b(?:number of|for each) food\b|\bfood you control\b/,
    'token count': /\b(?:number of|for each) tokens?\b|\btokens you control\b/,
    'creature count': /\b(?:number of|for each) creatures?\b|\bcreatures you control\b/,
  };
  const sacrificeTag =
    tag === 'sacrifice' ||
    /^type-event: .+ sacrificed$/.test(tag);
  const creatureDeathTag = tag === 'type-event: creature dies';
  const drain = tag === 'drain' ? drainRoles(card) : null;
  const lifePayoff =
    tag === 'life gain'
      ? /\b(?:when|whenever|if) (?:you|a player) gain(?:s)? life\b/.test(text)
      : tag === 'burn'
        ? /\b(?:when|whenever|if) (?:an |each |target |your )?opponents? loses? life\b/.test(
            text,
          )
        : false;
  const lifeEnabler =
    tag === 'life gain'
      ? /\b(?:you|its controller|that player) gains? (?:that much|x|\d+|one|two|three|four|five|a) life\b|\bgain life equal to\b|\blifelink\b/.test(
          text,
        )
      : tag === 'burn'
        ? /\b(?:(?:target|each|an) opponent|your opponents?) loses? (?:that much|x|\d+|one|two|three|four|five|a) life\b|\bdeals?\b[^.]*\bdamage\b/.test(
            text,
          )
        : false;
  const payoff = sacrificeTag
    ? /\b(?:when|whenever|if)\b[^.]*\bsacrific(?:e|es|ed)\b|\bwhenever you sacrifice\b/.test(
        text,
      )
    : lifePayoff || Boolean(countPayoffPatterns[tag]?.test(text));
  return {
    enabler:
      producer ||
      enabler ||
      lifeEnabler ||
      Boolean(drain?.enabler) ||
      (creatureDeathTag &&
        sacrificeSynergyAmount(
          card,
          'type-event: creature sacrificed',
        ) > 0),
    payoff:
      payoff ||
      Boolean(drain?.payoff) ||
      (creatureDeathTag &&
        /\b(?:when|whenever|if)\b[^.]*\b(?:creature [^.]*dies?|creature (?:card )?is put into [^.]*graveyard from the battlefield)\b/.test(
          text,
        )),
  };
}
function rolesComplement(first: SynergyRole, second: SynergyRole) {
  return (
    (first === 'producer' && second === 'payoff') ||
    (first === 'payoff' && second === 'producer') ||
    (first === 'enabler' && second === 'payoff') ||
    (first === 'payoff' && second === 'enabler')
  );
}
function SynergyPreviewCard({
  card,
  tag,
  commander,
  onSelect,
}: {
  card: WorkspaceCard;
  tag: string;
  commander: string;
  onSelect: () => void;
}) {
  const modifier = tagModifier(card, tag);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-left hover:border-lime-300/30"
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
          <FoilIndicator cacheKey={card.cardData?.cacheKey} />
          {card.name === commander && (
            <Crown className="ml-1.5 inline size-3 text-lime-300" />
          )}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-zinc-600">
          {card.cardData?.typeLine}
        </p>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">
          {card.quantity}× · MV {card.cardData?.manaValue ?? '—'}
          {modifier.applied && (
            <span className="ml-1.5 text-zinc-600">
              · ×{modifier.value.toFixed(2)}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}
function displayTag(tag: string) {
  if (tag.startsWith('engine: '))
    return `${tag.slice(8).replace(/\b\w/g, (letter) => letter.toUpperCase())} Engine`;
  if (tag.startsWith('type: '))
    return `Type: ${tag.slice(6).replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  if (tag.startsWith('type-event: ')) {
    const [type, ...event] = tag.slice(12).split(' ');
    return `${type.replace(/\b\w/g, (letter) => letter.toUpperCase())} — ${event.join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  }
  return tag.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function SynergyTagLabel({
  card,
  tag,
  onExplain,
}: {
  card: WorkspaceCard;
  tag: string;
  onExplain?: () => void;
}) {
  const modifier = tagModifier(card, tag);
  return (
    <>
      <span>{displayTag(tag)}</span>
      {modifier.applied && (
        <button
          type="button"
          className="ml-1 font-mono text-[8px] font-normal text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
          onClick={(event) => {
            event.stopPropagation();
            onExplain?.();
          }}
          aria-label={`Explain ${displayTag(tag)} modifier`}
        >
          ×{modifier.value.toFixed(2)}
        </button>
      )}
    </>
  );
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
    tutor: ['search', 'library'],
    'mana ramp': ['add', 'mana'],
    'cost reduction': [
      'cost',
      'less',
      'affinity',
      'convoke',
      'delve',
      'improvise',
    ],
    'artifact count': ['artifact', 'treasure', 'metalcraft', 'improvise'],
    'treasure count': ['treasure'],
    'clue count': ['clue', 'investigate'],
    'food count': ['food'],
    'token count': ['token'],
    'creature count': ['creature'],
    'creature theft': ['gain control', 'creature', 'until end of turn'],
    'combat damage': [
      'combat damage',
      'double damage',
      'triple damage',
      'double strike',
      'trample',
      "can't be blocked",
      'unblockable',
    ],
    burn: ['damage'],
    removal: ['destroy', 'exile'],
    recursion: ['graveyard'],
  };
  const terms = [
    ...new Set(
      tags.flatMap((tag) =>
        tag.startsWith('type: ')
          ? [tag.slice(6)]
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
  const highestManaValue = Math.max(
    0,
    ...cards
      .filter((card) => card.cardData?.type !== 'Land')
      .map((card) => Math.max(0, Math.floor(card.cardData?.manaValue ?? 0))),
  );
  const curve = Array.from({ length: highestManaValue + 1 }, () => 0);
  cards
    .filter((card) => card.cardData?.type !== 'Land')
    .forEach((card) => {
      curve[Math.max(0, Math.floor(card.cardData?.manaValue ?? 0))] +=
        card.quantity;
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
      Math.max(
        0,
        share -
          Math.max(curveTargetFor(index), curveMinimumFor(index) / total),
      ) *
        curveWeightFor(index),
    0,
  );
  const crowdedTail = shares.slice(4).reduce((penalty, share, offset) => {
    const index = offset + 4;
    // From MV 4 upward, the curve should not grow from one bucket to the
    // next. The minimum allowance prevents an empty preceding bucket from
    // demanding that every later bucket also be empty.
    const locallyExpected = Math.max(
      curveMinimumFor(index) / total,
      shares[index - 1],
    );
    return (
      penalty +
      Math.max(0, share - locallyExpected) * curveWeightFor(index)
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
  contextualPopularity,
  onCardQuantityChange,
  onBack,
}: Props) {
  const [criterion, setCriterion] = useState<Criterion>('all');
  const [selectedCuts, setSelectedCuts] = useState<Set<string>>(new Set());
  const [keptCards, setKeptCards] = useState<Set<string>>(
    () =>
      new Set(
        cards
          .filter((card) => card.name === commander)
          .map((card) => keyOf(card)),
      ),
  );
  const [browserTab, setBrowserTab] = useState<'undecided' | 'keep' | 'cut'>(
    'undecided',
  );
  const [groupByMana, setGroupByMana] = useState(false);
  const [groupByType, setGroupByType] = useState(false);
  const [originalBasicLandCounts] = useState(
    () =>
      new Map(
        cards
          .filter(isBasicLand)
          .map((card) => [keyOf(card), card.quantity]),
      ),
  );
  const [budget, setBudget] = useState<number | null>(null);
  const [selectedSynergy, setSelectedSynergy] = useState('');
  const [modifierExplanation, setModifierExplanation] = useState<{
    card: WorkspaceCard;
    tag: string;
  } | null>(null);
  const [ignoredSynergies, setIgnoredSynergies] = useState<Set<string>>(
    new Set(),
  );
  const [boostedSynergies, setBoostedSynergies] = useState<Set<string>>(
    new Set(),
  );
  const [focusedKey, setFocusedKey] = useState('');
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const baseCurve = useMemo(() => curveFor(cards), [cards]);
  const workingCurve = useMemo(() => {
    const curve = [...baseCurve];
    selectedCuts.forEach((key) => {
      const card = cards.find((entry) => keyOf(entry) === key);
      if (card && card.cardData?.type !== 'Land') {
        const bucket = Math.max(
          0,
          Math.floor(card.cardData?.manaValue ?? 0),
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
  const knownTypes = useMemo(
    () => [...new Set(cards.flatMap((card) => subtypesOf(card)))],
    [cards],
  );
  const commanderSynergyTags = useMemo(
    () =>
      new Set(
        synergyTags(
          cards.find((card) => card.name === commander),
          knownTypes,
        ).filter((tag) => !ignoredSynergies.has(tag)),
      ),
    [cards, commander, knownTypes, ignoredSynergies],
  );
  const deckTopSynergyRanks = useMemo(() => {
    const counts = new Map<string, number>();
    cards
      .filter(
        (card) =>
          card.name !== commander &&
          !card.cardData?.typeLine?.startsWith('Basic Land'),
      )
      .forEach((card) =>
        conciseVisibleTags(synergyTags(card, knownTypes))
          .filter(
            (tag) =>
              !ignoredSynergies.has(tag) &&
              !isFunctionalRoleTag(tag) &&
              (!tag.startsWith('type: ') ||
                cards.some(
                  (candidate) =>
                    synergyTags(candidate, knownTypes).includes(tag) &&
                    synergyPreviewRoles(candidate, tag).payoff,
                )),
          )
          .forEach((tag) =>
            counts.set(tag, (counts.get(tag) ?? 0) + card.quantity),
          ),
      );
    return new Map(
      [...counts.entries()]
        .sort(
          ([firstTag, firstCount], [secondTag, secondCount]) =>
            secondCount - firstCount ||
            displayTag(firstTag).localeCompare(displayTag(secondTag)),
        )
        .slice(0, 3)
        .map(([tag], index) => [tag, index + 1]),
    );
  }, [cards, commander, knownTypes, ignoredSynergies]);
  const recommendations = useMemo(() => {
    const eligible = cards.filter((card) => !isBasicLand(card));
    const frequency = new Map<string, number>();
    eligible.forEach((card) =>
      conciseVisibleTags(synergyTags(card, knownTypes))
        .filter((tag) => !ignoredSynergies.has(tag))
        .forEach((tag) =>
          frequency.set(tag, (frequency.get(tag) ?? 0) + card.quantity),
        ),
    );
    const engineFamilyFrequency = new Map<string, number>();
    eligible.forEach((card) => {
      const families = new Set(
        synergyTags(card, knownTypes)
          .filter(
            (tag) =>
              !ignoredSynergies.has(tag) && isStrategicThemeTag(tag),
          )
          .map(engineFamilyForTag),
      );
      families.forEach((family) =>
        engineFamilyFrequency.set(
          family,
          (engineFamilyFrequency.get(family) ?? 0) + card.quantity,
        ),
      );
    });
    const strongestEngineFamilyFrequency = Math.max(
      1,
      ...engineFamilyFrequency.values(),
    );
    const strongestThemeFrequency = Math.max(
      1,
      ...[...frequency.entries()]
        .filter(([tag]) => isStrategicThemeTag(tag))
        .map(([, count]) => count),
    );
    const rolesByTag = new Map<string, Set<SynergyRole>>();
    eligible.forEach((card) =>
      synergyTags(card, knownTypes)
        .filter((tag) => !ignoredSynergies.has(tag))
        .forEach((tag) => {
          const roles = rolesByTag.get(tag) ?? new Set<SynergyRole>();
          const previewRoles = synergyPreviewRoles(card, tag);
          if (previewRoles.enabler) roles.add('enabler');
          if (previewRoles.payoff) roles.add('payoff');
          if (!previewRoles.enabler && !previewRoles.payoff)
            roles.add(synergyRole(card, tag));
          rolesByTag.set(tag, roles);
        }),
    );
    const contextCards = eligible.filter((card) => card.name !== commander);
    const structuredEffectsByCard = new Map(
      eligible.map((card) => [keyOf(card), extractCardEffects(card)] as const),
    );
    const engineSignalsByCard = new Map(
      eligible.map(
        (card) =>
          [
            keyOf(card),
            engineSignalsFor(card, structuredEffectsByCard.get(keyOf(card))),
          ] as const,
      ),
    );
    const activeTagsFor = (card: WorkspaceCard) =>
      synergyTags(card, knownTypes).filter(
        (tag) => !ignoredSynergies.has(tag),
      );
    const countCardsMatching = (
      predicate: (card: WorkspaceCard, tags: string[]) => boolean,
    ) =>
      contextCards
        .filter((card) => predicate(card, activeTagsFor(card)))
        .reduce((sum, card) => sum + card.quantity, 0);
    const surveilCount = countCardsMatching((_, tags) =>
      tags.includes('surveil'),
    );
    const sacrificeThemeCount = countCardsMatching((_, tags) =>
      tags.some(
        (tag) =>
          tag === 'sacrifice' ||
          /^type-event: .+ sacrificed$/.test(tag),
      ),
    );
    const xSpellCount = countCardsMatching((card) =>
      /\{x\}/i.test(card.cardData?.manaCost ?? ''),
    );
    const xPayoffCount = countCardsMatching(
      (card) =>
        /\{x\}/i.test(card.cardData?.manaCost ?? '') &&
        /\b(?:x damage|draw x|create x|x [^.]*(?:tokens?|counters?)|loses? x life|mill x|power and toughness [^.]*x|\+x\/\+x)\b/i.test(
          card.cardData?.oracleText ?? '',
        ),
    );
    const curveCards = contextCards.filter(
      (card) => !/\bland\b/i.test(card.cardData?.typeLine?.split('//')[0] ?? ''),
    );
    const curveQuantity = curveCards.reduce(
      (sum, card) => sum + card.quantity,
      0,
    );
    const averageManaValue = curveQuantity
      ? curveCards.reduce(
          (sum, card) =>
            sum + (card.cardData?.manaValue ?? 0) * card.quantity,
          0,
        ) / curveQuantity
      : 0;
    const recursionAdjustment = Math.min(
      5,
      Math.round(surveilCount / 6 + sacrificeThemeCount / 5),
    );
    const curveRampAdjustment =
      averageManaValue >= 4
        ? 2
        : averageManaValue >= 3.3
          ? 1
          : averageManaValue > 0 && averageManaValue < 2.4
            ? -2
            : averageManaValue > 0 && averageManaValue < 2.8
              ? -1
              : 0;
    const rampAdjustment = Math.max(
      -2,
      Math.min(
        5,
        Math.round(xSpellCount * 0.4 + xPayoffCount * 0.6) +
          curveRampAdjustment,
      ),
    );
    const roleTargets = ROLE_TARGETS.map((role) => {
      const adjustment =
        role.name === 'Recursion'
          ? recursionAdjustment
          : role.name === 'Mana ramp'
            ? rampAdjustment
            : 0;
      const reasons =
        role.name === 'Recursion'
          ? [
              `${surveilCount} Surveil card${surveilCount === 1 ? '' : 's'}`,
              `${sacrificeThemeCount} sacrifice-theme card${sacrificeThemeCount === 1 ? '' : 's'}`,
            ]
          : role.name === 'Mana ramp'
            ? [
                `${xSpellCount} X-cost spell${xSpellCount === 1 ? '' : 's'}`,
                `${xPayoffCount} major X payoff${xPayoffCount === 1 ? '' : 's'}`,
                `average spell MV ${averageManaValue.toFixed(2)}`,
              ]
            : [];
      return {
        ...role,
        baseMinimum: role.minimum,
        baseMaximum: role.maximum,
        minimum: Math.max(0, role.minimum + adjustment),
        maximum: Math.max(1, role.maximum + adjustment),
        adjustment,
        reasons,
      };
    });
    const roleCounts = new Map<RoleName, number>();
    roleTargets.forEach((role) => {
      const rolePool = role.name === 'Land' ? cards : eligible;
      roleCounts.set(
        role.name,
        rolePool
          .filter((card) => card.name !== commander)
          .reduce((sum, card) => {
            if (ignoredSynergies.has(role.name.toLowerCase())) return sum;
            const faceOptions = roleFaceOptions(card, knownTypes);
            const matchingFaces = faceOptions.filter((roles) =>
              roles.has(role.name),
            ).length;
            return (
              sum + card.quantity * (matchingFaces / faceOptions.length)
            );
          }, 0),
      );
    });
    const commanderCard = cards.find((card) => card.name === commander);
    const commanderTags = commanderSynergyTags;
    const commanderSupportsSacrifice = [
      'sacrifice',
      'type-event: creature sacrificed',
      'type-event: creature dies',
    ].some((tag) => commanderTags.has(tag));
    return eligible.map((card) => {
      const bucket = Math.max(
        0,
        Math.floor(card.cardData?.manaValue ?? 0),
      );
      const beforeCurve = [...workingCurve];
      if (selectedCuts.has(keyOf(card)) && card.cardData?.type !== 'Land')
        beforeCurve[bucket] += card.quantity;
      const beforePenalty = curvePenalty(beforeCurve);
      const beforeCurveTotal = beforeCurve.reduce(
        (sum, count) => sum + count,
        0,
      );
      const curveBucketCount = beforeCurve[bucket];
      const targetShare = curveTargetFor(bucket);
      const maximumCutsAboveMinimum = Math.max(
        0,
        curveBucketCount - curveMinimumFor(bucket),
      );
      const cutsForTargetShare = Math.min(
        maximumCutsAboveMinimum,
        Math.max(
          0,
          Math.ceil(
            (curveBucketCount - targetShare * beforeCurveTotal) /
              (1 - targetShare),
          ),
        ),
      );
      const cutsForTailShape =
        bucket >= 4
          ? Math.min(
              maximumCutsAboveMinimum,
              Math.max(
                0,
                Math.ceil(
                  curveBucketCount -
                    Math.max(
                      curveMinimumFor(bucket),
                      beforeCurve[bucket - 1],
                    ),
                ),
              ),
            )
          : 0;
      const cutsToCurveTarget = Math.min(
        curveBucketCount,
        Math.max(cutsForTargetShare, cutsForTailShape),
      );
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
      const allTags = synergyTags(card, knownTypes);
      const tags = allTags.filter((tag) => !ignoredSynergies.has(tag));
      const thematicTags = tags.filter((tag) => !isFunctionalRoleTag(tag));
      const strategicThemeTags = thematicTags.filter(isStrategicThemeTag);
      const manaInvestment = Math.max(1, card.cardData?.manaValue ?? 0);
      const efficiencyComparisons =
        card.cardData?.type === 'Land'
          ? []
          : tags
              .filter(
                (tag) =>
                  tag !== 'land' &&
                  !tag.startsWith('type: ') &&
                  (isFunctionalRoleTag(tag) || isStrategicThemeTag(tag)),
              )
              .flatMap((tag) => {
                const peers = eligible.filter((other) => {
                  if (keyOf(other) === keyOf(card)) return false;
                  if (other.cardData?.type === 'Land') return false;
                  return synergyTags(other, knownTypes)
                    .filter((otherTag) => !ignoredSynergies.has(otherTag))
                    .includes(tag);
                });
                if (!peers.length) return [];
                const efficiencyRate =
                  tagModifier(card, tag).value / manaInvestment;
                const peerRate =
                  peers.reduce(
                    (sum, peer) =>
                      sum +
                      tagModifier(peer, tag).value /
                        Math.max(1, peer.cardData?.manaValue ?? 0),
                    0,
                  ) / peers.length;
                const protection = Math.min(
                  1,
                  Math.max(0, efficiencyRate / Math.max(0.01, peerRate) - 1),
                );
                return [
                  {
                    tag,
                    protection,
                    efficiencyRate,
                    peerRate,
                    peerCount: peers.length,
                    manaInvestment,
                    quality: tagModifier(card, tag).value,
                  },
                ];
              });
      const bestEfficiency = efficiencyComparisons.sort(
        (first, second) => second.protection - first.protection,
      )[0];
      const efficiencyProtection = bestEfficiency?.protection ?? 0;
      const supportByTag = new Map(
        strategicThemeTags.map((tag) => {
          if (tag.startsWith('type: ')) {
            const cardTypeRoles = synergyPreviewRoles(card, tag);
            const hasComplement = eligible.some((other) => {
              if (keyOf(other) === keyOf(card)) return false;
              if (!synergyTags(other, knownTypes).includes(tag)) return false;
              const otherRoles = synergyPreviewRoles(other, tag);
              return (
                (cardTypeRoles.enabler && otherRoles.payoff) ||
                (cardTypeRoles.payoff && otherRoles.enabler)
              );
            });
            if (!hasComplement) return [tag, 0] as const;
          }
          return [
            tag,
            Math.min(
              1,
              (Math.max(0, (frequency.get(tag) ?? 0) - card.quantity) /
                Math.max(4, cardCount * 0.12)) *
                tagModifier(card, tag).value,
            ),
          ] as const;
        }),
      );
      const strongestSupportTags = [...supportByTag.entries()].sort(
        ([firstTag, first], [secondTag, second]) =>
          second - first ||
          (frequency.get(secondTag) ?? 0) - (frequency.get(firstTag) ?? 0) ||
          displayTag(firstTag).localeCompare(displayTag(secondTag)),
      );
      const strongestSupport = strongestSupportTags.map(([, score]) => score);
      // A card's best deck connections should define its fit. Extra keywords such
      // as ward, haste, reach, or trample are therefore neutral when unsupported.
      const support = Math.min(
        1,
        (strongestSupport[0] ?? 0) +
          (strongestSupport[1] ?? 0) * 0.2 +
          (strongestSupport[2] ?? 0) * 0.1,
      );
      const complementarySupport = Math.max(
        0,
        ...strategicThemeTags.map((tag) => {
          const cardRole = synergyRole(card, tag);
          const complementaryRoleExists = [...(rolesByTag.get(tag) ?? [])].some(
            (otherRole) => rolesComplement(cardRole, otherRole),
          );
          return complementaryRoleExists ? (supportByTag.get(tag) ?? 0) : 0;
        }),
      );
      const payoffSupport = Math.max(
        0,
        ...strategicThemeTags.map((tag) => {
          if (!synergyPreviewRoles(card, tag).payoff) return 0;
          const producerCount = eligible
            .filter((other) => keyOf(other) !== keyOf(card))
            .filter((other) =>
              synergyTags(other, knownTypes).includes(tag),
            )
            .filter((other) => synergyPreviewRoles(other, tag).enabler)
            .reduce((sum, other) => sum + other.quantity, 0);
          return Math.min(1, producerCount / Math.max(4, cardCount * 0.08));
        }),
      );
      const selfRecurringSacrificeFodder = isSelfRecurringCreature(card);
      const sacrificeRecursionSupport = selfRecurringSacrificeFodder
        ? Math.min(
            1,
            sacrificeThemeCount / Math.max(4, cardCount * 0.08),
          )
        : 0;
      const cardRoleOptions = roleFaceOptions(card, knownTypes);
      const cardRoles = new Set(cardRoleOptions.flatMap((roles) => [...roles]));
      const matchingRoles = roleTargets.filter((role) =>
        cardRoles.has(role.name),
      ).map((role) => {
        const count = roleCounts.get(role.name) ?? 0;
        const score =
          count < role.minimum
            ? 1
            : count <= role.maximum
              ? 1
              : Math.max(0.3, (role.maximum / count) * 0.75);
        const availableFaces = cardRoleOptions.filter((roles) =>
          roles.has(role.name),
        ).length;
        return {
          ...role,
          count,
          score,
          quality: roleQualityModifier(card, role.name),
          modalShare: availableFaces / cardRoleOptions.length,
        };
      });
      const strongestRole = matchingRoles.sort(
        (first, second) =>
          second.score - first.score || second.quality - first.quality,
      )[0];
      const roleScoreByName = new Map(
        matchingRoles.map((role) => [role.name, role.score]),
      );
      // An MDFC offers a choice of faces, not all face roles at once. Average
      // the best role available on each face instead of granting the strongest
      // role from the whole card as though every face were simultaneously cast.
      const roleCoverage = isModalDoubleFacedCard(card)
        ? cardRoleOptions.reduce(
            (sum, faceRoles) =>
              sum +
              Math.max(
                0,
                ...[...faceRoles].map(
                  (role) => roleScoreByName.get(role) ?? 0,
                ),
              ),
            0,
          ) / cardRoleOptions.length
        : (strongestRole?.score ?? 0);
      const sharedCommanderTags = strategicThemeTags.filter((tag) => {
        if (!commanderTags.has(tag) || isFunctionalRoleTag(tag)) return false;
        if (!tag.startsWith('type: ') || !commanderCard) return true;
        const cardTypeRoles = synergyPreviewRoles(card, tag);
        const commanderTypeRoles = synergyPreviewRoles(commanderCard, tag);
        return (
          (cardTypeRoles.enabler && commanderTypeRoles.payoff) ||
          (cardTypeRoles.payoff && commanderTypeRoles.enabler)
        );
      });
      const commanderHasComplement = commanderCard
        ? sharedCommanderTags.some((tag) => {
            const cardRoles = synergyPreviewRoles(card, tag);
            const commanderRoles = synergyPreviewRoles(commanderCard, tag);
            return (
              (cardRoles.enabler && commanderRoles.payoff) ||
              (cardRoles.payoff && commanderRoles.enabler) ||
              rolesComplement(
                synergyRole(card, tag),
                synergyRole(commanderCard, tag),
              )
            );
          })
        : false;
      const sharedTagCommanderConnection = sharedCommanderTags.length
        ? Math.min(
            1,
            (0.65 +
              Math.min(0.3, (sharedCommanderTags.length - 1) * 0.15) +
              (commanderHasComplement ? 0.2 : 0)) *
              Math.max(
                ...sharedCommanderTags.map(
                  (tag) =>
                    (frequency.get(tag) ?? 0) / strongestThemeFrequency,
                ),
              ),
          )
        : 0;
      const sacrificeCommanderConnection =
        selfRecurringSacrificeFodder && commanderSupportsSacrifice ? 0.9 : 0;
      const commanderConnection = Math.max(
        sharedTagCommanderConnection,
        sacrificeCommanderConnection,
      );
      const boostedTagCount = strategicThemeTags.filter((tag) =>
        boostedSynergies.has(tag),
      ).length;
      const boostedTagBonus = Math.min(0.4, boostedTagCount * 0.2);
      const themeSupport = Math.min(1, support + boostedTagBonus);
      const themeMismatch = strategicThemeTags.length
        ? 1 - themeSupport
        : 0;
      const rawRoleSurplus = matchingRoles.length ? 1 - roleCoverage : 1;
      // Modifiers represent how much work a role card can perform, not extra
      // copies toward the role target. Quality therefore softens only the cut
      // pressure once that role is overfilled; it never changes the role count.
      const roleQualityModifierValue = strongestRole?.quality ?? 1;
      const roleSurplus = rawRoleSurplus / roleQualityModifierValue;
      const cardEngineSignals = engineSignalsByCard.get(keyOf(card))!;
      const directEnginePartnerCount = eligible
        .filter((candidate) => keyOf(candidate) !== keyOf(card))
        .filter((candidate) =>
          signalsConnect(
            cardEngineSignals,
            engineSignalsByCard.get(keyOf(candidate))!,
          ),
        )
        .reduce((sum, candidate) => sum + candidate.quantity, 0);
      const graphEngineSupport = Math.min(
        1,
        directEnginePartnerCount / Math.max(4, cardCount * 0.08),
      );
      const engineApplicable =
        graphEngineSupport > 0 || strategicThemeTags.some((tag) => {
        const roles = synergyPreviewRoles(card, tag);
        return roles.enabler || roles.payoff;
      });
      const engineSupport = Math.min(
        1,
        Math.max(
          complementarySupport,
          payoffSupport,
          sacrificeRecursionSupport,
          graphEngineSupport,
        ),
      );
      const engineFamilies = [
        ...new Set(strategicThemeTags.map(engineFamilyForTag)),
      ];
      const familyTagsFor = (candidate: WorkspaceCard, family: string) =>
        synergyTags(candidate, knownTypes).filter(
          (tag) =>
            !ignoredSynergies.has(tag) &&
            isStrategicThemeTag(tag) &&
            engineFamilyForTag(tag) === family,
        );
      const familyRolesFor = (candidate: WorkspaceCard, family: string) => {
        const roles = familyTagsFor(candidate, family).map((tag) =>
          synergyPreviewRoles(candidate, tag),
        );
        return {
          enabler: roles.some((role) => role.enabler),
          payoff: roles.some((role) => role.payoff),
        };
      };
      const enginePrevalence = Math.min(
        1,
        Math.max(
          0,
          ...engineFamilies.map(
            (family) =>
              (engineFamilyFrequency.get(family) ?? 0) /
              strongestEngineFamilyFrequency,
          ),
        ),
      );
      const engineBalanceByTag = engineFamilies.map((tag) => {
        const cardEngineRoles = familyRolesFor(card, tag);
        if (!cardEngineRoles.enabler && !cardEngineRoles.payoff)
          return { tag, balance: 0, enablers: 0, payoffs: 0, efficiency: 0 };
        const matchingEngineCards = eligible.filter((candidate) =>
          familyTagsFor(candidate, tag).length,
        );
        const enablers = matchingEngineCards.reduce(
          (sum, candidate) =>
            sum +
            (familyRolesFor(candidate, tag).enabler
              ? candidate.quantity
              : 0),
          0,
        );
        const payoffs = matchingEngineCards.reduce(
          (sum, candidate) =>
            sum +
            (familyRolesFor(candidate, tag).payoff
              ? candidate.quantity
              : 0),
          0,
        );
        // Two enablers per payoff is a healthy default engine shape. Once one
        // side exceeds what the other can use, cards on the surplus side lose
        // protection instead of being sheltered merely for sharing the tag.
        const supplyBalance =
          cardEngineRoles.enabler && cardEngineRoles.payoff
            ? 1
            : cardEngineRoles.enabler
              ? Math.min(1, (payoffs * 2) / Math.max(1, enablers))
              : Math.min(1, enablers / Math.max(1, payoffs * 2));
        const comparableCards = matchingEngineCards.filter((candidate) => {
          const roles = familyRolesFor(candidate, tag);
          return (
            (cardEngineRoles.enabler && roles.enabler) ||
            (cardEngineRoles.payoff && roles.payoff)
          );
        });
        const averageQuality = comparableCards.length
          ? comparableCards.reduce(
              (sum, candidate) =>
                sum +
                Math.max(
                  1,
                  ...familyTagsFor(candidate, tag).map(
                    (memberTag) => tagModifier(candidate, memberTag).value,
                  ),
                ) *
                  candidate.quantity,
              0,
            ) /
            comparableCards.reduce(
              (sum, candidate) => sum + candidate.quantity,
              0,
            )
          : 1;
        const efficiency = Math.min(
          1,
          Math.max(
            0.25,
            Math.max(
              1,
              ...familyTagsFor(card, tag).map(
                (memberTag) => tagModifier(card, memberTag).value,
              ),
            ) / Math.max(0.01, averageQuality),
          ),
        );
        return {
          tag,
          balance: supplyBalance * efficiency,
          enablers,
          payoffs,
          efficiency,
        };
      });
      const contributingEngineBalances = engineBalanceByTag
        .filter((entry) => entry.balance > 0)
        .sort((first, second) => second.balance - first.balance)
        .slice(0, 3);
      const strongestEngineBalance = contributingEngineBalances[0];
      const engineBalance = Math.min(
        1,
        (contributingEngineBalances[0]?.balance ?? 0) +
          (contributingEngineBalances[1]?.balance ?? 0) * 0.25 +
          (contributingEngineBalances[2]?.balance ?? 0) * 0.1,
      );
      const effectiveEngineBalance = engineBalance || (graphEngineSupport > 0 ? 1 : 0);
      const effectiveEnginePrevalence = engineFamilies.length
        ? enginePrevalence
        : graphEngineSupport;
      const engineProtection = engineApplicable
        ? engineSupport * effectiveEnginePrevalence * effectiveEngineBalance
        : 0;
      const cardValue = priceOf(card) * card.quantity;
      const priceIsActive = budget !== null;
      const price = priceIsActive
        ? Math.min(1, cardValue / Math.max(0.01, budget))
        : 0;
      const popularityContext =
        contextualPopularity?.get(keyOf(card)) ??
        contextualPopularity?.get(card.cardData?.nameKey ?? card.name.toLowerCase());
      const popularity = popularityCutScore(card, popularityContext);
      const synergyBeforeProtections = themeMismatch * 0.3 + roleSurplus * 0.7;
      const engineProtectionRate = engineProtection * 0.25;
      const efficiencyProtectionRate = efficiencyProtection * 0.15;
      const commanderProtectionRate = commanderConnection * 0.3;
      const uncappedCombinedProtection =
        1 -
        (1 - engineProtectionRate) *
          (1 - efficiencyProtectionRate) *
          (1 - commanderProtectionRate);
      const combinedProtectionRate = Math.min(
        0.5,
        uncappedCombinedProtection,
      );
      const synergy = synergyBeforeProtections * (1 - combinedProtectionRate);
      const rawEngineSynergyReduction =
        synergyBeforeProtections * engineProtectionRate;
      const rawEfficiencySynergyReduction =
        synergyBeforeProtections *
        (1 - engineProtectionRate) *
        efficiencyProtectionRate;
      const rawCommanderSynergyReduction =
        synergyBeforeProtections *
        (1 - engineProtectionRate) *
        (1 - efficiencyProtectionRate) *
        commanderProtectionRate;
      const protectionDisplayScale = uncappedCombinedProtection
        ? combinedProtectionRate / uncappedCombinedProtection
        : 0;
      const engineSynergyReduction =
        rawEngineSynergyReduction * protectionDisplayScale;
      const efficiencySynergyReduction =
        rawEfficiencySynergyReduction * protectionDisplayScale;
      const commanderSynergyReduction =
        rawCommanderSynergyReduction * protectionDisplayScale;
      const all = priceIsActive
        ? curve * 0.4 +
          synergy * 0.3 +
          price * 0.2 +
          popularity * 0.1
        : curve * 0.5 + synergy * 0.375 + popularity * 0.125;
      return {
        card,
        curve,
        synergy,
        themeMismatch,
        roleSurplus,
        engineProtection,
        efficiencyProtection,
        commanderProtection: commanderConnection,
        price,
        popularity,
        all,
        tags: allTags,
        activeTags: tags,
        scoreBreakdown: {
          beforeCurvePenalty: beforePenalty,
          afterCurvePenalty: curvePenalty(afterCurve),
          beforeCurveTotal,
          curveBucketCount,
          targetShare,
          rawRoleSurplus,
          roleQualityModifier: roleQualityModifierValue,
          cutsToCurveTarget,
          targetBucketCount: curveBucketCount - cutsToCurveTarget,
          previousCurveBucketCount:
            bucket >= 4 ? beforeCurve[bucket - 1] : null,
          isLand: card.cardData?.type === 'Land',
          support,
          strongestSupportTags: strongestSupportTags
            .slice(0, 3)
            .map(([tag, score]) => ({ tag, score })),
          complementarySupport,
          payoffSupport,
          sacrificeRecursionSupport,
          selfRecurringSacrificeFodder,
          roleCoverage,
          strongestRole,
          themeSupport,
          engineSupport,
          enginePrevalence,
          graphEngineSupport,
          directEnginePartnerCount,
          engineBalance,
          strongestEngineBalance,
          contributingEngineBalances,
          engineApplicable,
          commanderConnection,
          synergyBeforeProtections,
          engineSynergyReduction,
          efficiencySynergyReduction,
          bestEfficiency,
          commanderSynergyReduction,
          engineProtectionRate,
          efficiencyProtectionRate,
          commanderProtectionRate,
          combinedProtectionRate,
          boostedTagCount,
          boostedTagBonus,
          sharedCommanderTags: sharedCommanderTags.length,
          cardValue,
          edhrecRank: card.cardData?.edhrecRank,
          popularityContext,
        },
        afterCurve,
        bucket,
      };
    });
  }, [
    cards,
    commander,
    cardCount,
    workingCurve,
    knownTypes,
    selectedCuts,
    ignoredSynergies,
    commanderSynergyTags,
    boostedSynergies,
    budget,
    contextualPopularity,
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
    if (groupByMana) {
      const groups = new Map<number, typeof ranked>();
      ranked.forEach((item) => {
        const bucket = item.bucket;
        groups.set(bucket, [...(groups.get(bucket) ?? []), item]);
      });
      return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(
          ([bucket, items]) =>
            [`Mana value ${bucket}`, items] as const,
        );
    }
    if (groupByType) {
      const groups = new Map<string, typeof ranked>();
      ranked.forEach((item) => {
        const type = item.card.cardData?.type || 'Other';
        groups.set(type, [...(groups.get(type) ?? []), item]);
      });
      const typeOrder = [
        'Creature',
        'Artifact',
        'Enchantment',
        'Planeswalker',
        'Instant',
        'Sorcery',
        'Battle',
        'Land',
        'Other',
      ];
      return [...groups.entries()]
        .sort(
          ([first], [second]) =>
            (typeOrder.indexOf(first) < 0
              ? typeOrder.length
              : typeOrder.indexOf(first)) -
              (typeOrder.indexOf(second) < 0
                ? typeOrder.length
                : typeOrder.indexOf(second)) || first.localeCompare(second),
        )
        .map(([type, items]) => [`${type} cards`, items] as const);
    }
    return [['All cards', ranked] as const];
  }, [ranked, groupByMana, groupByType]);
  const basicLandCards = useMemo(() => {
    const order = [
      'Plains',
      'Island',
      'Swamp',
      'Mountain',
      'Forest',
      'Wastes',
    ];
    return cards.filter(isBasicLand).sort((first, second) => {
      const firstBase = first.name.replace(/^Snow-Covered /i, '');
      const secondBase = second.name.replace(/^Snow-Covered /i, '');
      const firstIndex = order.indexOf(firstBase);
      const secondIndex = order.indexOf(secondBase);
      return (
        (firstIndex < 0 ? order.length : firstIndex) -
          (secondIndex < 0 ? order.length : secondIndex) ||
        first.name.localeCompare(second.name)
      );
    });
  }, [cards]);
  const focused =
    recommendations.find((item) => keyOf(item.card) === focusedKey) ??
    ranked[0];
  const focusedIsCommander = focused?.card.name === commander;
  const focusedScoreCards = focused
    ? ([
        {
          value: 'curve',
          label: 'Curve',
          rows: focused.scoreBreakdown.isLand
            ? [
                { label: 'Card type', value: 'Land' },
                { label: 'Curve effect', value: 'None' },
              ]
            : [
                {
                  label: 'Card mana value',
                  value: `${focused.bucket}`,
                },
                {
                  label: `Cards at MV ${focused.bucket}`,
                  value: `${focused.scoreBreakdown.curveBucketCount}`,
                },
                ...(focused.bucket >= 4
                  ? [
                      {
                        label: `Cards at MV ${focused.bucket - 1}`,
                        value: `${focused.scoreBreakdown.previousCurveBucketCount}`,
                      },
                    ]
                  : []),
                {
                  label: 'Ideal share of spells',
                  value: `${Math.round(focused.scoreBreakdown.targetShare * 100)}%`,
                },
                {
                  label: 'Estimated target count',
                  value: `${focused.scoreBreakdown.targetBucketCount}`,
                },
                {
                  label: 'Estimated cuts needed',
                  value: `${focused.scoreBreakdown.cutsToCurveTarget}`,
                },
                {
                  label: 'This cut improves curve',
                  value: `${Math.round(focused.curve * 100)} / 100`,
                },
              ],
          summary: focused.scoreBreakdown.isLand
            ? 'Lands are not included in the mana-curve calculation.'
            : `Removing this card reduces the MV ${focused.bucket} slot by ${focused.card.quantity}. From MV 4 upward, a bucket is also discouraged from exceeding the bucket immediately before it, while minimum allowances prevent the curve from being forced to zero.`,
        },
        {
          value: 'synergy',
          label: 'Low synergy',
          rows: [
            {
              label: 'Theme penalty · 30%',
              value: `+${(focused.themeMismatch * 30).toFixed(1)}`,
            },
            {
              label: 'Role-fit penalty · 70%',
              value: `+${(focused.roleSurplus * 70).toFixed(1)}`,
            },
            ...(focused.scoreBreakdown.strongestRole
              ? [
                  {
                    label: `${focused.scoreBreakdown.strongestRole.name} role`,
                    value: `${Number.isInteger(focused.scoreBreakdown.strongestRole.count) ? focused.scoreBreakdown.strongestRole.count : focused.scoreBreakdown.strongestRole.count.toFixed(1)} / ${focused.scoreBreakdown.strongestRole.minimum}–${focused.scoreBreakdown.strongestRole.maximum} · ×${focused.scoreBreakdown.roleQualityModifier.toFixed(2)}`,
                  },
                ]
              : []),
            {
              label: 'Base cut pressure',
              value: `${Math.round(focused.scoreBreakdown.synergyBeforeProtections * 100)}`,
            },
            ...(focused.scoreBreakdown.directEnginePartnerCount > 0
              ? [
                  {
                    label: 'Direct effect connections',
                    value: `${focused.scoreBreakdown.directEnginePartnerCount} card${focused.scoreBreakdown.directEnginePartnerCount === 1 ? '' : 's'}`,
                  },
                ]
              : []),
            ...(focused.scoreBreakdown.strongestEngineBalance
              ? [
                  {
                    label: `Engine balance · ${focused.scoreBreakdown.contributingEngineBalances.map((entry) => displayTag(entry.tag)).join(', ')}`,
                    value: `${Math.round(focused.scoreBreakdown.engineBalance * 100)}% combined`,
                  },
                ]
              : []),
            ...(focused.scoreBreakdown.engineSynergyReduction > 0
              ? [
                  {
                    label: 'Engine protection',
                    value: `${Math.round(focused.scoreBreakdown.engineProtectionRate * 100)}% · −${(focused.scoreBreakdown.engineSynergyReduction * 100).toFixed(1)}`,
                  },
                ]
              : []),
            ...(focused.scoreBreakdown.efficiencySynergyReduction > 0
              ? [
                  {
                    label: `Efficiency boost${focused.scoreBreakdown.bestEfficiency ? ` · ${displayTag(focused.scoreBreakdown.bestEfficiency.tag)}` : ''}`,
                    value: `${Math.round(focused.scoreBreakdown.efficiencyProtectionRate * 100)}% · −${(focused.scoreBreakdown.efficiencySynergyReduction * 100).toFixed(1)}`,
                  },
                ]
              : []),
            ...(focused.scoreBreakdown.commanderSynergyReduction > 0
              ? [
                  {
                    label: 'Commander protection',
                    value: `${Math.round(focused.scoreBreakdown.commanderProtectionRate * 100)}% · −${(focused.scoreBreakdown.commanderSynergyReduction * 100).toFixed(1)}`,
                  },
                ]
              : []),
            {
              label: 'Final low-synergy score',
              value: `${Math.round(focused.synergy * 100)}`,
            },
          ],
          summary:
            'Theme and excess role coverage create the base pressure. Protections reduce that pressure by percentages rather than subtracting flat points, and their combined reduction is capped at 50%. Engine balance uses 100% of the strongest engine, 25% of the second, and 10% of the third; each contribution falls when its enablers and payoffs are imbalanced or this card is inefficient for its side.',
        },
        {
          value: 'price',
          label: 'Price',
          rows: [
            {
              label: 'Card value',
              value: `$${focused.scoreBreakdown.cardValue.toFixed(2)}`,
            },
            {
              label: 'Deck budget',
              value: budget === null ? 'Not set' : `$${budget.toFixed(2)}`,
            },
            {
              label: 'Price cut score',
              value: budget === null ? 'Excluded' : `${Math.round(focused.price * 100)}`,
            },
          ],
          summary:
            budget === null
              ? 'Set a deck budget to include price in the overall score.'
              : 'Card value is divided by the deck budget and capped at 100.',
        },
        {
          value: 'popularity',
          label: 'Low popularity',
          rows: [
            {
              label: 'EDHREC rank',
              value:
                focused.scoreBreakdown.edhrecRank?.toLocaleString() ?? 'N/A',
            },
            ...(focused.scoreBreakdown.popularityContext
              ? [
                  {
                    label: `Rank among ${focused.scoreBreakdown.popularityContext.colorIdentity} cards`,
                    value: `${focused.scoreBreakdown.popularityContext.rank.toLocaleString()} / ${focused.scoreBreakdown.popularityContext.poolSize.toLocaleString()}`,
                  },
                  {
                    label: 'Commander-legal percentile',
                    value: `Top ${(focused.scoreBreakdown.popularityContext.percentile * 100).toFixed(2)}%`,
                  },
                ]
              : []),
            {
              label: 'Low-popularity cut score',
              value: focused.scoreBreakdown.edhrecRank
                ? `${Math.round(focused.popularity * 100)}`
                : 'N/A',
            },
          ],
          summary: focused.scoreBreakdown.edhrecRank
            ? 'Popularity is ranked against cards legal for the commander’s color identity, then converted with a gentle square-root curve. Staple cards receive very little cut pressure.'
            : 'No EDHREC rank is available, so popularity is displayed as N/A.',
        },
        {
          value: 'all',
          label: 'Overall',
          rows: budget === null
            ? [
                {
                  label: 'Curve · 50%',
                  value: `${Math.round(focused.curve * 100)} → ${(focused.curve * 50).toFixed(1)}`,
                },
                {
                  label: 'Low synergy · 37.5%',
                  value: `${Math.round(focused.synergy * 100)} → ${(focused.synergy * 37.5).toFixed(1)}`,
                },
                {
                  label: 'Low popularity · 12.5%',
                  value: `${Math.round(focused.popularity * 100)} → ${(focused.popularity * 12.5).toFixed(1)}`,
                },
                {
                  label: 'Overall cut score',
                  value: `${Math.round(focused.all * 100)}`,
                },
              ]
            : [
                {
                  label: 'Curve · 40%',
                  value: `${Math.round(focused.curve * 100)} → ${(focused.curve * 40).toFixed(1)}`,
                },
                {
                  label: 'Low synergy · 30%',
                  value: `${Math.round(focused.synergy * 100)} → ${(focused.synergy * 30).toFixed(1)}`,
                },
                {
                  label: 'Price · 20%',
                  value: `${Math.round(focused.price * 100)} → ${(focused.price * 20).toFixed(1)}`,
                },
                {
                  label: 'Low popularity · 10%',
                  value: `${Math.round(focused.popularity * 100)} → ${(focused.popularity * 10).toFixed(1)}`,
                },
                {
                  label: 'Overall cut score',
                  value: `${Math.round(focused.all * 100)}`,
                },
              ],
          summary:
            'Curve, low synergy, price when enabled, and popularity are weighted and added. Commander protection is already contained within the reworked synergy score.',
        },
      ] as const)
    : [];
  const focusedConnectionTags = focused
    ? conciseVisibleTags(focused.tags).sort(
        (first, second) =>
          (deckTopSynergyRanks.get(first) ?? Number.POSITIVE_INFINITY) -
            (deckTopSynergyRanks.get(second) ?? Number.POSITIVE_INFINITY) ||
          focused.tags.indexOf(first) - focused.tags.indexOf(second),
      )
    : [];
  const focusedThemeTags = focusedConnectionTags.filter(
    (tag) => !isFunctionalRoleTag(tag),
  );
  const focusedRoleTags = focusedConnectionTags.filter(isFunctionalRoleTag);
  const synergyMatches = useMemo(
    () =>
      focused
        ? cards
            .filter((card) => keyOf(card) !== keyOf(focused.card))
            .map((card) => ({
              card,
              shared: synergyTags(card, knownTypes).filter(
                (tag) =>
                  !ignoredSynergies.has(tag) &&
                  focused.activeTags.includes(tag),
              ),
            }))
            .filter((item) => item.shared.length)
            .sort((a, b) => b.shared.length - a.shared.length)
        : [],
    [cards, focused, knownTypes, ignoredSynergies],
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
    if (card.name === commander) return;
    advanceAfterDecision(card);
    const key = keyOf(card);
    startTransition(() => {
      setKeptCards((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setSelectedCuts((current) => new Set(current).add(key));
    });
  }
  function markKeep(card: WorkspaceCard) {
    if (card.name !== commander) advanceAfterDecision(card);
    const key = keyOf(card);
    startTransition(() => {
      setSelectedCuts((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setKeptCards((current) => new Set(current).add(key));
    });
  }
  function resetDecision(card: WorkspaceCard) {
    if (card.name === commander) return;
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
    if (card.name === commander) return;
    if (selectedCuts.has(keyOf(card))) resetDecision(card);
    else markCut(card);
  }
  function flipFocusedCard() {
    if (!focused?.card.cardData?.backImageUri) return;
    const key = keyOf(focused.card);
    setFlippedCards((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const adjustedCurve = workingCurve;
  const discoveredSynergies = useMemo(() => {
    const groups = new Map<string, WorkspaceCard[]>();
    cards.forEach((card) =>
      conciseVisibleTags(synergyTags(card, knownTypes)).forEach((tag) =>
        groups.set(tag, [...(groups.get(tag) ?? []), card]),
      ),
    );
    return [...groups.entries()]
      .map(([tag, matchingCards]) => ({
        tag,
        cards: matchingCards,
        count: matchingCards.reduce((sum, card) => sum + card.quantity, 0),
        calculationCount: matchingCards
          .filter(
            (card) =>
              card.name !== commander &&
              !card.cardData?.typeLine?.startsWith('Basic Land'),
          )
          .reduce((sum, card) => sum + card.quantity, 0),
        ignored: ignoredSynergies.has(tag),
      }))
      .sort(
        (a, b) =>
          Number(a.ignored) - Number(b.ignored) ||
          b.calculationCount - a.calculationCount ||
          b.count - a.count ||
          displayTag(a.tag).localeCompare(displayTag(b.tag)),
      );
  }, [cards, commander, knownTypes, ignoredSynergies]);
  const selectedSynergyGroup = discoveredSynergies.find(
    (group) => group.tag === selectedSynergy,
  );
  const discoveredThemeSynergies = discoveredSynergies.filter(
    (group) => !isFunctionalRoleTag(group.tag),
  );
  const discoveredRoleSynergies = discoveredSynergies.filter((group) =>
    isFunctionalRoleTag(group.tag),
  );
  const selectedSynergyRoleGroups = useMemo(() => {
    const result = {
      both: [] as WorkspaceCard[],
      enablers: [] as WorkspaceCard[],
      payoffs: [] as WorkspaceCard[],
      other: [] as WorkspaceCard[],
    };
    if (!selectedSynergyGroup) return result;
    selectedSynergyGroup.cards.forEach((card) => {
      const roles = synergyPreviewRoles(card, selectedSynergyGroup.tag);
      if (roles.enabler && roles.payoff) result.both.push(card);
      else if (roles.enabler) result.enablers.push(card);
      else if (roles.payoff) result.payoffs.push(card);
      else result.other.push(card);
    });
    return result;
  }, [selectedSynergyGroup]);
  const explainedModifier = modifierExplanation
    ? tagModifier(modifierExplanation.card, modifierExplanation.tag)
    : null;
  useEffect(() => {
    function openConnectionTag(event: MouseEvent) {
      const element = event.target as HTMLElement;
      if (element.closest('button[aria-label^="Explain"]')) return;
      const badge = element.closest('span');
      const panel = badge?.closest('article');
      if (
        !badge ||
        panel?.querySelector('h3')?.textContent !== 'Synergy connections'
      )
        return;
      const tag = focused?.tags.find(
        (candidate) =>
          badge.textContent?.trim().startsWith(displayTag(candidate)),
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
          (candidate) =>
            badge.textContent?.trim().startsWith(displayTag(candidate)),
        );
        badge.classList.toggle(
          'ignored-synergy-connection',
          Boolean(tag && ignoredSynergies.has(tag)),
        );
      });
    });
  }, [focused, ignoredSynergies]);
  function renderConnectionTag(tag: string, kind: 'theme' | 'role') {
    if (!focused) return null;
    return (
        <Badge
          key={tag}
          variant="outline"
          className={
            kind === 'theme'
              ? 'border-lime-300/20 text-[9px] text-lime-200'
              : 'border-sky-300/20 bg-sky-300/[0.035] text-[9px] text-sky-200'
          }
        >
          {kind === 'theme' && deckTopSynergyRanks.has(tag) && (
            <span className="mr-1 font-mono font-bold text-lime-300">
              #{deckTopSynergyRanks.get(tag)}
            </span>
          )}
          {kind === 'theme' && commanderSynergyTags.has(tag) && (
            <Crown
              className="mr-1 inline size-2.5 text-lime-300"
              aria-label="Shared with commander"
            />
          )}
          {kind === 'theme' && boostedSynergies.has(tag) && (
            <Sparkles
              className="mr-1 inline size-2.5 text-amber-300"
              aria-label="Boosted synergy"
            />
          )}
          <SynergyTagLabel
            card={focused.card}
            tag={tag}
            onExplain={() =>
              setModifierExplanation({ card: focused.card, tag })
            }
          />
        </Badge>
    );
  }
  function renderBrowserGroup(
    group: (typeof discoveredSynergies)[number],
    kind: 'theme' | 'role',
  ) {
    const isTheme = kind === 'theme';
    return (
      <div
        key={group.tag}
        className={`flex overflow-hidden rounded-xl border ${group.ignored ? 'border-red-300/25 bg-red-300/10' : isTheme && boostedSynergies.has(group.tag) ? 'border-lime-300/50 bg-lime-300/10' : isTheme ? 'border-white/8 bg-black/20' : 'border-sky-300/15 bg-sky-300/[0.035]'}`}
      >
        <button
          type="button"
          onClick={() => setSelectedSynergy(group.tag)}
          className="flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.035]"
        >
          {isTheme && !group.ignored && deckTopSynergyRanks.has(group.tag) && (
            <span className="rounded-md bg-lime-300 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-950">
              {deckTopSynergyRanks.get(group.tag) === 1
                ? 'Top Synergy'
                : deckTopSynergyRanks.get(group.tag) === 2
                  ? '2nd Top Synergy'
                  : '3rd Top Synergy'}
            </span>
          )}
          {isTheme && !group.ignored && commanderSynergyTags.has(group.tag) && (
            <Crown
              className="size-3.5 shrink-0 text-lime-300"
              aria-label="Commander synergy"
            />
          )}
          <span
            className={`text-xs ${group.ignored ? 'text-red-200' : isTheme ? 'text-zinc-300' : 'text-sky-200'}`}
          >
            {displayTag(group.tag)}
          </span>
          <span
            className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 font-mono text-[10px] ${group.ignored ? 'bg-red-300/15 text-red-200' : isTheme ? 'bg-lime-300/10 text-lime-300' : 'bg-sky-300/10 text-sky-300'}`}
          >
            {group.count}
          </span>
        </button>
        {isTheme && !group.ignored && (
          <button
            type="button"
            aria-label={`${boostedSynergies.has(group.tag) ? 'Remove boost from' : 'Boost'} ${displayTag(group.tag)}`}
            title={
              boostedSynergies.has(group.tag)
                ? 'Remove synergy boost'
                : 'Preserve this synergy'
            }
            onClick={() =>
              setBoostedSynergies((current) => {
                const next = new Set(current);
                if (next.has(group.tag)) next.delete(group.tag);
                else next.add(group.tag);
                return next;
              })
            }
            className={`grid w-9 place-items-center border-l transition-colors ${boostedSynergies.has(group.tag) ? 'border-lime-300/30 bg-lime-300/20 text-lime-200' : 'border-white/8 text-zinc-600 hover:bg-lime-300/10 hover:text-lime-300'}`}
          >
            <Sparkles className="size-3.5" />
          </button>
        )}
      </div>
    );
  }
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
            <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3 min-[900px]:items-start">
              <div className="group relative mx-auto aspect-[63/88] w-full max-w-sm min-w-0 origin-center rounded-[4.75%] bg-black/20 shadow-xl shadow-black/20 ring-1 ring-white/10 [perspective:1200px] transition-[transform,box-shadow] duration-300 ease-out hover:z-20 hover:-translate-y-1 hover:scale-[1.035] hover:shadow-2xl hover:shadow-black/50 min-[900px]:max-w-none">
                {focused.card.cardData?.imageUri ? (
                  <div
                    className="relative h-full w-full rounded-[4.75%] transition-transform duration-700 ease-in-out"
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: flippedCards.has(keyOf(focused.card))
                        ? 'rotateY(180deg)'
                        : 'rotateY(0deg)',
                    }}
                  >
                    <img
                      src={previewImage(focused.card.cardData.imageUri)}
                      alt={`${focused.card.name} front face`}
                      className="absolute inset-0 h-full w-full rounded-[4.75%] object-cover"
                      style={{ backfaceVisibility: 'hidden' }}
                    />
                    {focused.card.cardData.backImageUri && (
                      <img
                        src={previewImage(focused.card.cardData.backImageUri)}
                        alt={`${focused.card.name} back face`}
                        className="absolute inset-0 h-full w-full rounded-[4.75%] object-cover"
                        style={{
                          backfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)',
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="grid aspect-[63/88] place-items-center overflow-hidden rounded-[4.75%] border border-white/10 text-xs text-zinc-600">
                    Artwork unavailable
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-[4.75%] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="absolute -left-1/2 -top-1/4 h-[150%] w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent blur-sm transition-transform duration-700 ease-out group-hover:translate-x-[300%]" />
                  <div className="absolute inset-0 rounded-[4.75%] ring-1 ring-inset ring-lime-200/20" />
                </div>
                {focused.card.cardData?.cacheKey.split(':').at(-1) ===
                  'foil' && (
                  <div
                    className="foil-card-effect pointer-events-none absolute inset-0 z-[6] rounded-[4.75%]"
                    aria-hidden="true"
                  />
                )}
                {focused.card.cardData?.backImageUri && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={flipFocusedCard}
                    aria-label={`Show other face of ${focused.card.name}`}
                    title="Flip card"
                    className="absolute bottom-3 right-3 z-10 size-9 rounded-full border border-white/10 bg-black/20 text-white/55 shadow-sm backdrop-blur-[1px] transition-[opacity,background-color,color,border-color] hover:border-lime-300/35 hover:bg-black/55 hover:text-lime-100 focus-visible:border-lime-300/40 focus-visible:bg-black/65 focus-visible:text-white"
                  >
                    <RefreshCw
                      className={`size-4 transition-transform duration-700 ${flippedCards.has(keyOf(focused.card)) ? 'rotate-180' : ''}`}
                    />
                  </Button>
                )}
              </div>
              <div className="mx-auto flex aspect-[63/88] w-full max-w-sm min-w-0 flex-col overflow-hidden min-[900px]:max-w-none">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-300">
                  Interactive preview
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-heading text-2xl font-semibold text-white">
                    {focused.card.name}
                    <FoilIndicator cacheKey={focused.card.cardData?.cacheKey} />
                    {focusedIsCommander && (
                      <Crown className="ml-2 inline size-4 text-lime-300" />
                    )}
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
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-3">
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
                <div className="hidden">
                  {focusedScoreCards.map(({ value, label, rows, summary }) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${label} score calculation`}
                      className={`group relative cursor-help rounded-xl border p-3 text-left transition-colors hover:border-lime-300/35 focus-visible:border-lime-300/50 focus-visible:outline-none ${
                        value === 'all'
                          ? 'col-span-2 border-lime-300/25 bg-gradient-to-r from-lime-300/10 via-lime-300/[0.04] to-lime-300/10'
                          : 'border-white/8 bg-black/20'
                      }`}
                    >
                      <div
                        className={`pointer-events-none absolute left-1/2 z-[100] hidden w-80 max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-950 p-3 text-left text-xs font-normal text-zinc-200 shadow-2xl group-hover:block group-focus-visible:block ${
                          value === 'curve' || value === 'synergy'
                            ? 'top-[calc(100%+0.5rem)]'
                            : 'bottom-[calc(100%+0.5rem)]'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                          <span className="font-semibold text-white">
                            {label} calculation
                          </span>
                          <span className="font-mono text-lime-300">
                            {value === 'popularity' &&
                            !focused.card.cardData?.edhrecRank
                              ? 'N/A'
                              : Math.round(focused[value] * 100)}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {rows.map((row) => (
                            <div
                              key={row.label}
                              className="flex items-center justify-between gap-4 rounded-md bg-white/[0.045] px-2 py-1.5"
                            >
                              <span className="text-zinc-400">{row.label}</span>
                              <span className="shrink-0 font-mono font-semibold text-white">
                                {row.value}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 border-t border-white/10 pt-2 leading-relaxed text-zinc-400">
                          {summary}
                        </p>
                        <span
                          className={`absolute left-1/2 size-2 -translate-x-1/2 rotate-45 border-white/15 bg-zinc-950 ${
                            value === 'curve' || value === 'synergy'
                              ? 'bottom-full translate-y-1/2 border-l border-t'
                              : 'top-full -translate-y-1/2 border-b border-r'
                          }`}
                        />
                      </div>
                      <div className="flex items-end justify-between">
                        <p
                          className={`font-mono font-semibold text-white ${value === 'all' ? 'text-2xl' : 'text-xl'}`}
                        >
                          {value === 'popularity' &&
                          !focused.card.cardData?.edhrecRank
                            ? 'N/A'
                            : Math.round(focused[value] * 100)}
                        </p>
                        <p
                          className={`text-[9px] ${value === 'all' ? 'font-semibold uppercase tracking-widest text-lime-300' : 'text-zinc-600'}`}
                        >
                          {label}
                        </p>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full ${value === 'all' ? 'bg-lime-200' : 'bg-lime-300'}`}
                          style={{
                            width:
                              value === 'popularity' &&
                              !focused.card.cardData?.edhrecRank
                                ? '0%'
                                : `${focused[value] * 100}%`,
                          }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
                <div className="hidden">
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
                <p className="mt-3 max-h-24 shrink-0 overflow-y-auto text-xs leading-5 text-zinc-500">
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
              <div className="relative z-10 mx-auto aspect-[63/88] w-full max-w-sm min-w-0 min-[900px]:max-w-none">
                <article className="hidden">
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
                          {index}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="flex h-full min-h-0 min-w-0 flex-col overflow-visible rounded-xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 text-lime-300" />
                    <h3 className="text-sm font-medium text-white">
                      Synergy connections
                    </h3>
                  </div>
                  <div className="relative z-20 mt-3 grid shrink-0 grid-rows-2 overflow-visible rounded-lg border border-white/8 bg-black/15">
                    <div className="min-w-0 p-2">
                      <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                        Themes
                      </p>
                      <OverflowConnectionTags
                        tags={focusedThemeTags}
                        renderTag={(tag) => renderConnectionTag(tag, 'theme')}
                        onSelect={setSelectedSynergy}
                        moreClassName="text-lime-200 hover:text-lime-100"
                      />
                    </div>
                    <div className="min-w-0 border-t border-white/8 p-2">
                      <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                        Roles
                      </p>
                      <OverflowConnectionTags
                        tags={focusedRoleTags}
                        renderTag={(tag) => renderConnectionTag(tag, 'role')}
                        onSelect={setSelectedSynergy}
                        moreClassName="text-sky-200 hover:text-sky-100"
                      />
                    </div>
                  </div>
                  <div className="relative z-0 mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                    {synergyMatches.map((match) => (
                      <button
                        type="button"
                        key={keyOf(match.card)}
                        onClick={() => setFocusedKey(keyOf(match.card))}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/8 px-2.5 py-2 text-left hover:bg-white/[0.035]"
                      >
                        <span className="truncate text-[11px] text-zinc-300">
                          {match.card.name}
                          <FoilIndicator cacheKey={match.card.cardData?.cacheKey} />
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
            <div className="mt-5 grid gap-4 border-t border-white/8 pt-5 lg:grid-cols-[180px_minmax(0,1fr)_220px] lg:items-stretch">
              <article className="rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-lime-300" />
                  <h3 className="text-sm font-medium text-white">
                    Curve after this cut
                  </h3>
                </div>
                <p className="mt-1 text-[9px] leading-4 text-zinc-600">
                  Gray: current. Green: after cut.
                </p>
                <div className="mt-3 flex h-24 items-end gap-1 overflow-hidden">
                  {baseCurve.map((before, index) => (
                    <div
                      key={index}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    >
                      <div className="flex h-16 items-end justify-center gap-px">
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
                        {index}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {focusedScoreCards.map(({ value, label, rows, summary }) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${label} score calculation`}
                    className={`group relative cursor-help rounded-xl border p-3 text-left transition-colors hover:border-lime-300/35 focus-visible:border-lime-300/50 focus-visible:outline-none ${value === 'all' ? 'col-span-2 border-lime-300/25 bg-gradient-to-r from-lime-300/10 via-lime-300/[0.04] to-lime-300/10 sm:col-span-4' : 'border-white/8 bg-black/20'}`}
                  >
                    <div className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-[100] hidden w-80 max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-950 p-3 text-left text-xs font-normal text-zinc-200 shadow-2xl group-hover:block group-focus-visible:block">
                      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="font-semibold text-white">
                          {label} calculation
                        </span>
                        <span className="font-mono text-lime-300">
                          {value === 'popularity' &&
                          !focused.card.cardData?.edhrecRank
                            ? 'N/A'
                            : Math.round(focused[value] * 100)}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {rows.map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between gap-4 rounded-md bg-white/[0.045] px-2 py-1.5"
                          >
                            <span className="text-zinc-400">{row.label}</span>
                            <span className="shrink-0 font-mono font-semibold text-white">
                              {row.value}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 border-t border-white/10 pt-2 leading-relaxed text-zinc-400">
                        {summary}
                      </p>
                    </div>
                    <div className="flex items-end justify-between">
                      <p
                        className={`font-mono font-semibold text-white ${value === 'all' ? 'text-2xl' : 'text-xl'}`}
                      >
                        {value === 'popularity' &&
                        !focused.card.cardData?.edhrecRank
                          ? 'N/A'
                          : Math.round(focused[value] * 100)}
                      </p>
                      <p
                        className={`text-[9px] ${value === 'all' ? 'font-semibold uppercase tracking-widest text-lime-300' : 'text-zinc-600'}`}
                      >
                        {label}
                      </p>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full ${value === 'all' ? 'bg-lime-200' : 'bg-lime-300'}`}
                        style={{
                          width:
                            value === 'popularity' &&
                            !focused.card.cardData?.edhrecRank
                              ? '0%'
                              : `${focused[value] * 100}%`,
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-white/8 bg-black/20 p-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                    Decision
                  </p>
                  <p className="mt-1 text-xs font-medium text-zinc-300">
                    Choose what happens to this card.
                  </p>
                </div>
                <div className="mt-3 grid gap-1.5">
                  <Button
                    variant="ghost"
                    disabled={
                      focusedIsCommander ||
                      (!selectedCuts.has(keyOf(focused.card)) &&
                        !keptCards.has(keyOf(focused.card)))
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
                    disabled={focusedIsCommander}
                  >
                    {keptCards.has(keyOf(focused.card)) && (
                      <Check data-icon="inline-start" />
                    )}{' '}
                    {focusedIsCommander ? 'Commander — Kept' : 'Keep'}
                  </Button>
                  <Button
                    variant={
                      selectedCuts.has(keyOf(focused.card))
                        ? 'secondary'
                        : 'default'
                    }
                    onClick={() => toggleCut(focused.card)}
                    disabled={focusedIsCommander}
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
              <div className="flex flex-wrap items-center gap-3 pb-2">
                <label
                  htmlFor="group-by-mana-value"
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  <Checkbox
                    id="group-by-mana-value"
                    checked={groupByMana}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true;
                      setGroupByMana(enabled);
                      if (enabled) setGroupByType(false);
                    }}
                    aria-label="Group cards by mana value"
                  />
                  Group by mana value
                </label>
                <label
                  htmlFor="group-by-card-type"
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  <Checkbox
                    id="group-by-card-type"
                    checked={groupByType}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true;
                      setGroupByType(enabled);
                      if (enabled) setGroupByMana(false);
                    }}
                    aria-label="Group cards by card type"
                  />
                  Group by card type
                </label>
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/8 bg-black/15 p-1">
                  <span className="mx-1 text-[10px] uppercase tracking-wider text-zinc-600">
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
          </div>
          <div className="grid gap-4">
            {rankedGroups.map(([label, items]) => (
              <div key={label}>
                {(groupByMana || groupByType) && (
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
                            if (item.card.name !== commander)
                              toggleCut(item.card);
                          }}
                          className={`grid size-6 place-items-center rounded-md border text-[10px] ${item.card.name === commander ? 'cursor-not-allowed border-lime-300/30 bg-lime-300/10 text-lime-300' : selected ? 'border-lime-300 bg-lime-300 text-[#11150d]' : 'border-white/10 text-zinc-600'}`}
                        >
                          {item.card.name === commander ? (
                            <Crown className="size-3" />
                          ) : selected ? (
                            <Check className="size-3" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-zinc-200">
                            {item.card.name}
                            <FoilIndicator cacheKey={item.card.cardData?.cacheKey} />
                          </span>
                          <span className="block truncate text-[9px] text-zinc-600">
                            MV {item.card.cardData?.manaValue ?? '—'} ·{' '}
                            {item.tags.length
                              ? item.tags.slice(0, 3).map((tag, tagIndex) => (
                                  <span key={tag}>
                                    {tagIndex > 0 && ', '}
                                    {displayTag(tag)}
                                    {tagModifier(item.card, tag).applied && (
                                      <span className="ml-0.5 font-mono text-[8px] text-zinc-700">
                                        ×
                                        {tagModifier(
                                          item.card,
                                          tag,
                                        ).value.toFixed(2)}
                                      </span>
                                    )}
                                  </span>
                                ))
                              : 'no detected themes'}
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
        {basicLandCards.length > 0 && (
          <section className="mt-5 rounded-2xl border border-sky-300/10 bg-[#101311] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-white">
                  Basic lands
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Adjust basic-land quantities separately. Current quantities
                  contribute directly to Land role coverage.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-sky-300/20 text-sky-200"
              >
                {basicLandCards.reduce(
                  (sum, card) => sum + card.quantity,
                  0,
                )}{' '}
                basic lands
              </Badge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {basicLandCards.map((card) => {
                const original =
                  originalBasicLandCounts.get(keyOf(card)) ?? card.quantity;
                const adjustment = card.quantity - original;
                return (
                  <div
                    key={keyOf(card)}
                    className="rounded-xl border border-white/8 bg-black/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-200">
                          {card.name}
                        </p>
                        <p
                          className={`mt-1 font-mono text-[10px] ${adjustment > 0 ? 'text-lime-300' : adjustment < 0 ? 'text-rose-300' : 'text-zinc-600'}`}
                        >
                          {adjustment > 0 ? '+' : ''}
                          {adjustment} from imported
                        </p>
                      </div>
                      <span className="font-mono text-xl font-semibold text-white">
                        {card.quantity}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={card.quantity <= 0}
                        onClick={() =>
                          onCardQuantityChange(
                            keyOf(card),
                            Math.max(0, card.quantity - 1),
                          )
                        }
                        aria-label={`Remove one ${card.name}`}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onCardQuantityChange(keyOf(card), card.quantity + 1)
                        }
                        aria-label={`Add one ${card.name}`}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
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
                  {index}
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
                Themes measure deck connections. Roles measure essential deck
                functions and target coverage.
              </p>
            </div>
            <Badge variant="outline" className="border-white/10 text-zinc-500">
              {discoveredSynergies.length} synergies
            </Badge>
          </div>
          <div className="mt-4 grid max-h-72 gap-4 overflow-y-auto pr-1 md:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-lime-300/10 bg-lime-300/[0.02] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                  Themes
                </h3>
                <span className="font-mono text-[9px] text-zinc-600">
                  {discoveredThemeSynergies.length}
                </span>
              </div>
              <div className="flex flex-wrap content-start gap-2">
                {discoveredThemeSynergies.map((group) =>
                  renderBrowserGroup(group, 'theme'),
                )}
              </div>
            </div>
            <div className="min-w-0 rounded-xl border border-sky-300/10 bg-sky-300/[0.02] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                  Roles
                </h3>
                <span className="font-mono text-[9px] text-zinc-600">
                  {discoveredRoleSynergies.length}
                </span>
              </div>
              <div className="flex flex-wrap content-start gap-2">
                {discoveredRoleSynergies.map((group) =>
                  renderBrowserGroup(group, 'role'),
                )}
              </div>
            </div>
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
      {modifierExplanation && explainedModifier && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => setModifierExplanation(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modifier-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101311] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-300">
                  Synergy modifier
                </p>
                <h2
                  id="modifier-dialog-title"
                  className="mt-1 font-heading text-xl font-semibold text-white"
                >
                  {displayTag(modifierExplanation.tag)} ×
                  {explainedModifier.value.toFixed(2)}
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  {modifierExplanation.card.name}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModifierExplanation(null)}
              >
                Close
              </Button>
            </div>
            <div className="mt-5 space-y-3 rounded-xl border border-white/8 bg-black/20 p-4 text-xs leading-5 text-zinc-400">
              <p>
                <span className="text-zinc-200">Role:</span>{' '}
                {explainedModifier.label.replace(/\b\w/g, (letter) =>
                  letter.toUpperCase(),
                )}
              </p>
              {explainedModifier.amount > 0 && (
                <p>
                  <span className="text-zinc-200">
                    {modifierExplanation.tag === 'mana ramp'
                      ? 'Estimated output:'
                      : 'Quantity:'}
                  </span>{' '}
                  {explainedModifier.amount} {explainedModifier.amountLabel}
                  {explainedModifier.amount === 1 ||
                  modifierExplanation.tag === 'mana ramp'
                    ? ''
                    : 's'}
                  ;{' '}
                  {Math.max(0, explainedModifier.amount - 1)} additional × 0.25
                  {' = +'}
                  {explainedModifier.quantityBonus.toFixed(2)}
                </p>
              )}
              <p>
                <span className="text-zinc-200">Repeatability:</span>{' '}
                {explainedModifier.repeatable
                  ? explainedModifier.amount > 0
                    ? `Yes — doubles the producer/quantity contribution to +${explainedModifier.repeatabilityBonus.toFixed(2)}.`
                    : 'Yes — adds a +0.25 continuous-effect bonus.'
                  : 'No — the effect is treated as one-time.'}
              </p>
              <p>
                <span className="text-zinc-200">Multiple uses per turn:</span>{' '}
                {explainedModifier.multiUsePerTurn
                  ? `Yes — unrestricted activation or “whenever” trigger: +${explainedModifier.multiUseBonus.toFixed(2)}.`
                  : 'No additional bonus (tap or once-per-turn limits may apply).'}
              </p>
              <p>
                <span className="text-zinc-200">Instant-speed access:</span>{' '}
                {explainedModifier.instantSpeed
                  ? `Yes — an unrestricted trigger or an ability without an “activate only as a sorcery” restriction: +${explainedModifier.instantSpeedBonus.toFixed(2)}.`
                  : 'No additional instant-speed bonus.'}
              </p>
              {explainedModifier.scalingBonus > 0 && (
                <p>
                  <span className="text-zinc-200">Scales with life change:</span>{' '}
                  “That much life” copies the size of the triggering life gain
                  or loss instead of using a fixed amount: +
                  {explainedModifier.scalingBonus.toFixed(2)}.
                </p>
              )}
              {explainedModifier.destinationBonus > 0 && (
                <p>
                  <span className="text-zinc-200">Recursion destination:</span>{' '}
                  Returns the card directly to the battlefield, avoiding the
                  normal casting step: +
                  {explainedModifier.destinationBonus.toFixed(2)}.
                </p>
              )}
              <p className="border-t border-white/8 pt-3 font-mono text-zinc-300">
                1.00 + {explainedModifier.modifierBonus.toFixed(2)} = ×
                {explainedModifier.value.toFixed(2)}
              </p>
            </div>
          </section>
        </div>
      )}
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
            <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p
                  className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isFunctionalRoleTag(selectedSynergyGroup.tag) ? 'text-sky-300' : 'text-lime-300'}`}
                >
                  {isFunctionalRoleTag(selectedSynergyGroup.tag)
                    ? 'Role preview'
                    : 'Theme preview'}
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
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                {!isFunctionalRoleTag(selectedSynergyGroup.tag) && (
                  <Button
                    className={
                      boostedSynergies.has(selectedSynergyGroup.tag)
                        ? 'border-amber-300/40 bg-amber-300/15 text-amber-200 hover:bg-amber-300/20'
                        : ''
                    }
                    variant="outline"
                    size="sm"
                    disabled={selectedSynergyGroup.ignored}
                    onClick={() =>
                      setBoostedSynergies((current) => {
                        const next = new Set(current);
                        if (next.has(selectedSynergyGroup.tag))
                          next.delete(selectedSynergyGroup.tag);
                        else next.add(selectedSynergyGroup.tag);
                        return next;
                      })
                    }
                  >
                    <Sparkles data-icon="inline-start" />
                    {boostedSynergies.has(selectedSynergyGroup.tag)
                      ? 'Remove boost'
                      : 'Boost theme'}
                  </Button>
                )}
                <Button
                  className={
                    selectedSynergyGroup.ignored
                      ? 'bg-red-400 text-red-950 hover:bg-red-300'
                      : ''
                  }
                  variant={
                    selectedSynergyGroup.ignored ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => {
                    if (!selectedSynergyGroup.ignored)
                      setBoostedSynergies((boosted) => {
                        const withoutIgnored = new Set(boosted);
                        withoutIgnored.delete(selectedSynergyGroup.tag);
                        return withoutIgnored;
                      });
                    setIgnoredSynergies((current) => {
                      const next = new Set(current);
                      if (next.has(selectedSynergyGroup.tag))
                        next.delete(selectedSynergyGroup.tag);
                      else next.add(selectedSynergyGroup.tag);
                      return next;
                    });
                  }}
                >
                  {selectedSynergyGroup.ignored
                    ? 'Restore synergy tag'
                    : 'Ignore synergy tag'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSynergy('')}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5">
              {selectedSynergyRoleGroups.both.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-300">
                    Enabler / Payoff
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedSynergyRoleGroups.both.map((card) => (
                      <SynergyPreviewCard
                        key={keyOf(card)}
                        card={card}
                        tag={selectedSynergyGroup.tag}
                        commander={commander}
                        onSelect={() => {
                          setFocusedKey(keyOf(card));
                          setSelectedSynergy('');
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2">
                {(
                  [
                    ['Enablers', selectedSynergyRoleGroups.enablers],
                    ['Payoffs', selectedSynergyRoleGroups.payoffs],
                  ] as const
                ).map(([label, roleCards]) => (
                  <div key={label} className="min-w-0">
                    <div className="mb-2 flex items-center justify-between border-b border-white/8 pb-2">
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        {label}
                      </h3>
                      <span className="font-mono text-[10px] text-zinc-600">
                        {roleCards.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {roleCards.map((card) => (
                        <SynergyPreviewCard
                          key={keyOf(card)}
                          card={card}
                          tag={selectedSynergyGroup.tag}
                          commander={commander}
                          onSelect={() => {
                            setFocusedKey(keyOf(card));
                            setSelectedSynergy('');
                          }}
                        />
                      ))}
                      {roleCards.length === 0 && (
                        <p className="rounded-xl border border-dashed border-white/8 py-6 text-center text-xs text-zinc-700">
                          No {label.toLowerCase()} detected.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {selectedSynergyRoleGroups.other.length > 0 && (
                <div>
                  <h3 className="mb-2 border-b border-white/8 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                    Other connections
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedSynergyRoleGroups.other.map((card) => (
                      <SynergyPreviewCard
                        key={keyOf(card)}
                        card={card}
                        tag={selectedSynergyGroup.tag}
                        commander={commander}
                        onSelect={() => {
                          setFocusedKey(keyOf(card));
                          setSelectedSynergy('');
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
