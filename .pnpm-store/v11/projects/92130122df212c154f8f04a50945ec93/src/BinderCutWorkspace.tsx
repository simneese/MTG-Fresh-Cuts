import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Crown,
  DollarSign,
  Info,
  Layers3,
  RefreshCw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import FoilIndicator from '@/components/FoilIndicator';
import type { WorkspaceCard } from '@/DeckWorkspace';

export type BinderScoreMetric =
  | 'all'
  | 'curve'
  | 'synergy'
  | 'price'
  | 'popularity';

export type BinderScoreDetail = {
  value: BinderScoreMetric;
  label: string;
  rows: readonly { label: string; value: string }[];
  summary: string;
};

export type BinderCardItem = {
  card: WorkspaceCard;
  scores: Record<BinderScoreMetric, number>;
};

export type BinderEngineGroup = {
  id: string;
  label: string;
  cards: WorkspaceCard[];
};

type Props = {
  deckName: string;
  formatLabel: string;
  commander: string;
  commanderCard?: WorkspaceCard;
  items: BinderCardItem[];
  focusedKey: string;
  focusedScores: BinderScoreDetail[];
  focusedEffects: string[];
  focusedThemes: string[];
  focusedRoles: string[];
  selectedCuts: Set<string>;
  keptCards: Set<string>;
  selectedCount: number;
  cutsNeeded: number;
  budget: number | null;
  deckPrice: number;
  engines: BinderEngineGroup[];
  onFocus: (key: string) => void;
  onKeep: (card: WorkspaceCard) => void;
  onCut: (card: WorkspaceCard) => void;
  onUndecided: (card: WorkspaceCard) => void;
  onBudgetChange: (budget: number | null) => void;
  onBack: () => void;
};

const SCORE_ORDER: BinderScoreMetric[] = [
  'all',
  'curve',
  'synergy',
  'price',
  'popularity',
];
const SCORE_LABELS: Record<BinderScoreMetric, string> = {
  all: 'overall',
  curve: 'mana curve',
  synergy: 'synergy',
  price: 'price',
  popularity: 'EDHREC popularity',
};
const COLOR_HEX: Record<string, string> = {
  W: '#f0e7c7',
  U: '#3f94bd',
  B: '#6b6571',
  R: '#bd5547',
  G: '#4f9569',
  C: '#a0a5a4',
};

function budgetToSliderPosition(budget: number | null) {
  if (budget === null || budget <= 0) return 0;
  const clamped = Math.min(10000, Math.max(10, budget));
  return 1 + (Math.log10(clamped / 10) / 3) * 299;
}

function sliderPositionToBudget(position: number) {
  if (position <= 0) return null;
  return Math.round(10 * 10 ** (((position - 1) / 299) * 3));
}

function keyOf(card: WorkspaceCard) {
  return card.key ?? card.name;
}

function EngineGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g transform="translate(32 0) scale(-1 1)">
      <g className="binder-train-smoke" fill="currentColor">
        <circle className="binder-smoke-puff binder-smoke-puff-one" cx="9" cy="4.5" r="1.8" />
        <circle className="binder-smoke-puff binder-smoke-puff-two" cx="12" cy="2.5" r="1.35" />
      </g>
      <path d="M6.7 13V9.3H5.4V7.1h7.1v2.2h-1.3V13z" fill="currentColor" />
      <path d="M5.7 6h6.7l-1.2 2H6.9z" fill="currentColor" />
      <path d="M15.1 13v-2h1V9.8h3V11h1v2z" fill="currentColor" />
      <path d="M7.5 12.5h13.8a4.5 4.5 0 0 1 4.5 4.5v5H7.5a4.75 4.75 0 0 1 0-9.5z" fill="currentColor" />
      <path d="M20 8.2h8V22h-8zm-1.1-1.8h10.2v2.2H18.9z" fill="currentColor" />
      <rect x="22" y="10.4" width="4" height="4.2" rx=".45" fill="#111614" />
      <path d="M7.2 18.3 1.7 24h7.1L11 21.7zM2.2 17.7h4v2h-4z" fill="currentColor" />
      <path d="M5 21.5h23.8V24H5z" fill="currentColor" />
      <g transform="translate(10 24)"><g className="binder-train-wheel"><circle r="4" fill="currentColor" /><circle r="1.35" fill="#111614" /><path d="M0-3.15v6.3M-3.15 0h6.3M-2.2-2.2l4.4 4.4M2.2-2.2l-4.4 4.4" stroke="#111614" strokeWidth=".7" /></g></g>
      <g transform="translate(23 24)"><g className="binder-train-wheel"><circle r="4" fill="currentColor" /><circle r="1.35" fill="#111614" /><path d="M0-3.15v6.3M-3.15 0h6.3M-2.2-2.2l4.4 4.4M2.2-2.2l-4.4 4.4" stroke="#111614" strokeWidth=".7" /></g></g>
      <path className="binder-train-rod" d="M10 24h13" fill="none" stroke="#111614" strokeWidth="1.45" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function identityTheme(identity: string[]) {
  if (identity.length === 0)
    return {
      page: '#222625',
      pageDeep: '#171a19',
      accent: '#b8b9b3',
      glow: 'rgba(184,185,179,.16)',
    };
  const pair = identity.join('');
  if (pair.includes('G') && pair.includes('U'))
    return {
      page: '#192725',
      pageDeep: '#111d1c',
      accent: '#61b69a',
      glow: 'rgba(61,148,166,.18)',
    };
  if (pair.includes('W') && pair.includes('B'))
    return {
      page: '#292724',
      pageDeep: '#1d1a1c',
      accent: '#d5c48d',
      glow: 'rgba(191,170,118,.17)',
    };
  const first = COLOR_HEX[identity[0]] ?? COLOR_HEX.C;
  return {
    page: '#232625',
    pageDeep: '#171a19',
    accent: first,
    glow: `${first}2b`,
  };
}

export default function BinderCutWorkspace({
  deckName,
  formatLabel,
  commander,
  commanderCard,
  items,
  focusedKey,
  focusedScores,
  focusedEffects,
  focusedThemes,
  focusedRoles,
  selectedCuts,
  keptCards,
  selectedCount,
  cutsNeeded,
  budget,
  deckPrice,
  engines,
  onFocus,
  onKeep,
  onCut,
  onUndecided,
  onBudgetChange,
  onBack,
}: Props) {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState(
    () => new Set<'undecided' | 'keep' | 'cut'>(['undecided', 'keep', 'cut']),
  );
  const [scoreMetric, setScoreMetric] = useState<BinderScoreMetric>('all');
  const [showDetails, setShowDetails] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [sortMetric, setSortMetric] = useState<BinderScoreMetric>('all');
  const [groupMode, setGroupMode] = useState<'none' | 'mana' | 'type'>('none');
  const [pageDirection, setPageDirection] = useState<'next' | 'previous'>('next');
  const [turningFrontItems, setTurningFrontItems] = useState<BinderCardItem[]>([]);
  const [turningBackItems, setTurningBackItems] = useState<BinderCardItem[]>([]);
  const [turningTargetItems, setTurningTargetItems] = useState<BinderCardItem[]>([]);
  const [isTurningPage, setIsTurningPage] = useState(false);
  const [manaPhase, setManaPhase] = useState<
    'closed' | 'expanding' | 'slices' | 'open' | 'closing'
  >('closed');
  const [isClosingInspection, setIsClosingInspection] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<number | null>(budget);
  const [engineOverviewOpen, setEngineOverviewOpen] = useState(false);
  const [selectedEngineId, setSelectedEngineId] = useState('');
  const [introPhase, setIntroPhase] = useState<'cover' | 'shifting' | 'opening' | 'done'>('cover');
  const refreshTimers = useRef<number[]>([]);
  const [binderLayout, setBinderLayout] = useState({
    columns: 4,
    rows: 4,
    sheets: 2,
  });

  const commanderIdentity = commanderCard?.cardData?.colorIdentity ?? [];
  const commanderItem = items.find((item) => item.card.name === commander);
  const theme = identityTheme(commanderIdentity);
  const themeStyle = {
    '--binder-page': theme.page,
    '--binder-page-deep': theme.pageDeep,
    '--binder-accent': theme.accent,
    '--binder-glow': theme.glow,
  } as CSSProperties;

  useEffect(() => {
    const shiftTimer = window.setTimeout(() => setIntroPhase('shifting'), 620);
    const openTimer = window.setTimeout(() => setIntroPhase('opening'), 1220);
    const finishTimer = window.setTimeout(() => setIntroPhase('done'), 2520);
    return () => {
      window.clearTimeout(shiftTimer);
      window.clearTimeout(openTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  const statusOf = (card: WorkspaceCard) =>
    selectedCuts.has(keyOf(card))
      ? 'cut'
      : keptCards.has(keyOf(card))
        ? 'keep'
        : 'undecided';

  const visibleItems = useMemo(() => {
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
    return items
      .filter(
        (item) =>
          item.card.name !== commander && filters.has(statusOf(item.card)),
      )
      .sort((first, second) => {
        if (groupMode === 'mana') {
          const manaDifference =
            Math.floor(first.card.cardData?.manaValue ?? 0) -
            Math.floor(second.card.cardData?.manaValue ?? 0);
          if (manaDifference) return manaDifference;
        }
        if (groupMode === 'type') {
          const firstType = first.card.cardData?.type ?? 'Other';
          const secondType = second.card.cardData?.type ?? 'Other';
          const typeDifference =
            (typeOrder.indexOf(firstType) < 0
              ? typeOrder.length
              : typeOrder.indexOf(firstType)) -
            (typeOrder.indexOf(secondType) < 0
              ? typeOrder.length
              : typeOrder.indexOf(secondType));
          if (typeDifference) return typeDifference;
        }
        return (
          second.scores[sortMetric] - first.scores[sortMetric] ||
          first.card.name.localeCompare(second.card.name)
        );
      });
  }, [
    items,
    commander,
    filters,
    selectedCuts,
    keptCards,
    groupMode,
    sortMetric,
  ]);
  const visibleSignature = visibleItems
    .map(
      (item) =>
        `${keyOf(item.card)}:${item.scores[sortMetric].toFixed(4)}:${statusOf(item.card)}`,
    )
    .join('|');
  const [presentedItems, setPresentedItems] = useState(visibleItems);
  const [presentedSignature, setPresentedSignature] = useState(visibleSignature);
  const [refreshPhase, setRefreshPhase] = useState<'idle' | 'out' | 'in'>(
    'idle',
  );
  const cardsPerSheet = binderLayout.columns * binderLayout.rows;
  const cardsPerSpread = cardsPerSheet * binderLayout.sheets;
  const pageCount = Math.max(
    1,
    Math.ceil(presentedItems.length / cardsPerSpread),
  );
  const pageItems = presentedItems.slice(
    page * cardsPerSpread,
    page * cardsPerSpread + cardsPerSpread,
  );
  const leftPage = pageItems.slice(0, cardsPerSheet);
  const rightPage = pageItems.slice(cardsPerSheet, cardsPerSpread);
  const targetLeftPage = turningTargetItems.slice(0, cardsPerSheet);
  const targetRightPage = turningTargetItems.slice(
    cardsPerSheet,
    cardsPerSpread,
  );
  const displayedLeftPage =
    isTurningPage &&
    binderLayout.sheets === 2 &&
    pageDirection === 'previous'
      ? targetLeftPage
      : leftPage;
  const displayedRightPage =
    isTurningPage && binderLayout.sheets === 2 && pageDirection === 'next'
      ? targetRightPage
      : rightPage;
  const focused = items.find((item) => keyOf(item.card) === focusedKey);
  const selectedEngine =
    engines.find((engine) => engine.id === selectedEngineId) ?? null;
  const focusedStatus = focused ? statusOf(focused.card) : 'undecided';
  const score = focused?.scores[scoreMetric] ?? 0;
  const scoreDetail = focusedScores.find((entry) => entry.value === scoreMetric);

  const colorTotals = useMemo(() => {
    const totals = new Map<string, number>();
    items.forEach(({ card }) => {
      const symbols = card.cardData?.manaCost?.match(/\{([^}]+)\}/g) ?? [];
      symbols.forEach((symbol) =>
        ['W', 'U', 'B', 'R', 'G'].forEach((color) => {
          if (symbol.includes(color))
            totals.set(color, (totals.get(color) ?? 0) + card.quantity);
        }),
      );
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const productionTotals = useMemo(() => {
    const totals = new Map<string, number>();
    items.forEach(({ card }) =>
      card.cardData?.producedMana?.forEach((color) => {
        if (COLOR_HEX[color])
          totals.set(color, (totals.get(color) ?? 0) + card.quantity);
      }),
    );
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const manaCurve = useMemo(() => {
    const buckets = Array.from({ length: 8 }, () => 0);
    items.forEach(({ card }) => {
      if (card.cardData?.type === 'Land') return;
      const bucket = Math.min(
        7,
        Math.max(0, Math.floor(card.cardData?.manaValue ?? 0)),
      );
      buckets[bucket] += card.quantity;
    });
    return buckets;
  }, [items]);
  const colorTotal = colorTotals.reduce((sum, [, count]) => sum + count, 0) || 1;
  let colorOffset = 0;
  const colorPie = `conic-gradient(${colorTotals
    .map(([color, count]) => {
      const start = colorOffset;
      colorOffset += (count / colorTotal) * 100;
      return `${COLOR_HEX[color] ?? COLOR_HEX.C} ${start}% ${colorOffset}%`;
    })
    .join(',')})`;
  const productionTotal =
    productionTotals.reduce((sum, [, count]) => sum + count, 0) || 1;
  let productionOffset = 0;
  const productionPie = `conic-gradient(${productionTotals
    .map(([color, count]) => {
      const start = productionOffset;
      productionOffset += (count / productionTotal) * 100;
      return `${COLOR_HEX[color] ?? COLOR_HEX.C} ${start}% ${productionOffset}%`;
    })
    .join(',')})`;
  const maxCurve = Math.max(1, ...manaCurve);
  const manaSlices = useMemo(() => {
    let start = -90;
    return colorTotals.map(([color, count]) => {
      const sweep = (count / colorTotal) * 360;
      const end = start + sweep;
      const middle = (start + end) / 2;
      const radius = 44;
      const startRadians = (start * Math.PI) / 180;
      const endRadians = (end * Math.PI) / 180;
      const middleRadians = (middle * Math.PI) / 180;
      const x1 = 50 + radius * Math.cos(startRadians);
      const y1 = 50 + radius * Math.sin(startRadians);
      const x2 = 50 + radius * Math.cos(endRadians);
      const y2 = 50 + radius * Math.sin(endRadians);
      const path = `M 50 50 L ${x1} ${y1} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
      start = end;
      return {
        color,
        path,
        x: Math.cos(middleRadians) * 18,
        y: Math.sin(middleRadians) * 18,
      };
    });
  }, [colorTotals, colorTotal]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);
  useEffect(() => {
    function updateBinderLayout() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width >= 1280 && height >= 760) {
        setBinderLayout({ columns: 4, rows: 4, sheets: 2 });
      } else if (width >= 900 && height >= 650) {
        setBinderLayout({ columns: 4, rows: 3, sheets: 2 });
      } else if (width >= 700) {
        setBinderLayout({ columns: 3, rows: 3, sheets: 2 });
      } else if (height >= 680) {
        setBinderLayout({ columns: 3, rows: 3, sheets: 1 });
      } else {
        setBinderLayout({ columns: 3, rows: 2, sheets: 1 });
      }
    }
    updateBinderLayout();
    window.addEventListener('resize', updateBinderLayout);
    return () => window.removeEventListener('resize', updateBinderLayout);
  }, []);
  useEffect(() => {
    setScoreMetric('all');
    setShowDetails(false);
    setFlipped(false);
    setIsClosingInspection(false);
  }, [focusedKey]);
  useEffect(() => {
    setBudgetDraft(budget);
  }, [budget]);
  useEffect(() => {
    if (visibleSignature === presentedSignature) return;
    refreshTimers.current.forEach((timer) => window.clearTimeout(timer));
    refreshTimers.current = [];
    if (isTurningPage) {
      setPresentedItems(visibleItems);
      setPresentedSignature(visibleSignature);
      setRefreshPhase('idle');
      return;
    }
    setRefreshPhase('out');
    refreshTimers.current.push(
      window.setTimeout(() => {
        setPresentedItems(visibleItems);
        setPresentedSignature(visibleSignature);
        setPage(0);
        setRefreshPhase('in');
      }, 170),
      window.setTimeout(() => setRefreshPhase('idle'), 390),
    );
    return () => {
      refreshTimers.current.forEach((timer) => window.clearTimeout(timer));
      refreshTimers.current = [];
    };
  }, [visibleItems, visibleSignature, isTurningPage]);

  function toggleFilter(value: 'undecided' | 'keep' | 'cut') {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(value) && next.size > 1) next.delete(value);
      else next.add(value);
      return next;
    });
    setPage(0);
  }

  function cycleScore() {
    const index = SCORE_ORDER.indexOf(scoreMetric);
    setScoreMetric(SCORE_ORDER[(index + 1) % SCORE_ORDER.length]);
  }

  function openManaAnalysis() {
    if (manaPhase !== 'closed') return;
    setManaPhase('expanding');
    window.setTimeout(() => setManaPhase('open'), 680);
  }

  function closeManaAnalysis() {
    if (manaPhase !== 'open') return;
    setManaPhase('closing');
    window.setTimeout(() => setManaPhase('closed'), 680);
  }

  function closeInspection() {
    if (isClosingInspection) return;
    setIsClosingInspection(true);
    window.setTimeout(() => {
      onFocus('');
      setIsClosingInspection(false);
    }, 540);
  }

  function commitBudgetSlider(value: string) {
    onBudgetChange(sliderPositionToBudget(Number(value)));
  }

  function changePage(direction: 'next' | 'previous') {
    if (isTurningPage) return;
    const targetPage =
      direction === 'next'
        ? Math.min(pageCount - 1, page + 1)
        : Math.max(0, page - 1);
    const targetItems = presentedItems.slice(
      targetPage * cardsPerSpread,
      targetPage * cardsPerSpread + cardsPerSpread,
    );
    setPageDirection(direction);
    setTurningFrontItems(direction === 'next' ? rightPage : leftPage);
    setTurningBackItems(
      direction === 'next'
        ? targetItems.slice(0, cardsPerSheet)
        : targetItems.slice(cardsPerSheet, cardsPerSpread),
    );
    setTurningTargetItems(targetItems);
    setIsTurningPage(true);
    window.setTimeout(() => {
      setPage(targetPage);
      setIsTurningPage(false);
      setTurningFrontItems([]);
      setTurningBackItems([]);
      setTurningTargetItems([]);
    }, binderLayout.sheets === 2 ? 1080 : 660);
  }

  function renderSlot(item: BinderCardItem, slot: number) {
    const card = item.card;
    const key = keyOf(card);
    const status = statusOf(card);
    const displayedScore = item.scores[sortMetric];
    return (
      <button
        key={key}
        type="button"
        onClick={() => onFocus(key)}
        aria-label={`${card.name}, ${status}, ${SCORE_LABELS[sortMetric]} cut score ${Math.round(displayedScore * 100)}`}
        className={`group relative grid h-full w-full min-h-0 min-w-0 place-items-center rounded-md bg-black/20 p-1.5 ring-1 ring-inset ring-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--binder-accent)] ${binderLayout.sheets===1?'overflow-hidden':'overflow-visible'} ${status === 'keep' ? 'binder-card-keep' : status === 'cut' ? 'binder-card-cut' : ''}`}
      >
        <span className="sr-only">Slot {slot + 1}</span>
        {card.cardData?.imageUri ? (
          <img
            src={card.cardData.imageUri}
            alt={card.name}
            className="relative z-[1] block max-h-full max-w-full rounded-[4.75%] object-contain shadow-md [clip-path:inset(0_round_4.75%)] transition duration-200 ease-out group-hover:-translate-y-0.5 group-hover:brightness-110 group-hover:shadow-xl group-focus-visible:-translate-y-0.5 group-focus-visible:brightness-110"
          />
        ) : (
          <span className="grid aspect-[63/88] h-full place-items-center rounded bg-black/25 px-1 text-center text-[10px] text-zinc-500">
            {card.name}
          </span>
        )}
        {card.quantity > 1 && (
          <span className="absolute left-1.5 top-1.5 z-10 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] text-white">
            {card.quantity}×
          </span>
        )}
        {status === 'keep' && (
          <span className="pointer-events-none absolute right-1 top-1 z-10 grid size-5 place-items-center rounded-full bg-amber-300 text-amber-950 shadow-[0_0_12px_rgba(252,211,77,.75)]">
            <ShieldCheck className="size-3" />
          </span>
        )}
        {status === 'cut' && (
          <span className="pointer-events-none absolute inset-1 z-10 bg-[linear-gradient(135deg,transparent_47%,rgba(248,113,113,.85)_48%,rgba(248,113,113,.85)_52%,transparent_53%)]" />
        )}
        <span
          className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 grid size-7 -translate-x-1/2 place-items-center rounded-full text-[9px] font-semibold text-white shadow-[0_3px_10px_rgba(0,0,0,.7)]"
          style={{
            background: `radial-gradient(circle at center,#111614 54%,transparent 56%),conic-gradient(${displayedScore >= 0.7 ? '#ef6b61' : displayedScore >= 0.4 ? '#e6c66a' : 'var(--binder-accent)'} ${displayedScore * 100}%,rgba(255,255,255,.18) 0)`,
          }}
          title={`${SCORE_LABELS[sortMetric]} cut score`}
        >
          {Math.round(displayedScore * 100)}
        </span>
      </button>
    );
  }

  return (
    <main
      className={`relative grid h-dvh min-h-[620px] overflow-hidden bg-[#0c100f] text-zinc-100 ${introPhase !== 'done' ? 'binder-workspace-intro' : ''} ${introPhase === 'opening' ? 'binder-workspace-revealing' : ''}`}
      style={themeStyle}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-15%,var(--binder-glow),transparent_48%)]" />
      <div className="relative grid min-h-0 grid-rows-[52px_minmax(0,1fr)_46px]">
        <header className="binder-workspace-chrome flex items-center justify-between gap-4 border-b border-white/8 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Return to deck import">
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <p className="truncate font-heading text-base font-semibold text-white">{deckName}</p>
              <p className="truncate text-[10px] uppercase tracking-[0.14em] text-zinc-600">{formatLabel} · {items.reduce((sum, item) => sum + item.card.quantity, 0)} cards</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-rose-200">{Math.max(0, cutsNeeded - selectedCount)} cuts remaining</p>
            <p className="text-[10px] text-zinc-600">{keptCards.size} kept · {selectedCuts.size} cut</p>
          </div>
        </header>

        <section className="grid min-h-0 grid-rows-[40px_minmax(0,1fr)] px-3 pb-2 pt-1 sm:px-5">
          <div className="binder-workspace-chrome flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
            <details className="group relative z-20">
              <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200" aria-label="Sort, group, and filter cards"><SlidersHorizontal className="size-4" /></summary>
              <div className="absolute left-0 top-9 w-64 rounded-xl border border-white/10 bg-[#121715] p-3 shadow-2xl shadow-black/55">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Show cards</p>
                <div className="mt-2 grid grid-cols-3 gap-1" aria-label="Card decision filters">{(['undecided','keep','cut'] as const).map((value)=><button key={value} type="button" onClick={()=>toggleFilter(value)} aria-pressed={filters.has(value)} className={`rounded-md px-2 py-1.5 text-[11px] capitalize transition ${filters.has(value)?'bg-white/10 text-zinc-100':'text-zinc-600 hover:text-zinc-300'}`}>{value}</button>)}</div>
                <div className="mt-3 border-t border-white/8 pt-3"><button type="button" onClick={()=>{const index=SCORE_ORDER.indexOf(sortMetric);setSortMetric(SCORE_ORDER[(index+1)%SCORE_ORDER.length]);setPage(0);}} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5" aria-label={`Sort by ${SCORE_LABELS[sortMetric]}. Click for next option.`}><span className="text-zinc-600">Sort</span><span>{SCORE_LABELS[sortMetric]}</span></button><button type="button" onClick={()=>{setGroupMode((current)=>current==='none'?'mana':current==='mana'?'type':'none');setPage(0);}} className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5" aria-label={`Group by ${groupMode}. Click for next option.`}><span className="text-zinc-600">Group</span><span>{groupMode==='none'?'none':groupMode==='mana'?'mana value':'card type'}</span></button></div>
              </div>
            </details>
            <details className="group relative z-20">
              <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200" aria-label="Deck price and budget"><DollarSign className="size-4" /></summary>
              <div className="absolute left-0 top-9 w-72 rounded-xl border border-white/10 bg-[#121715] p-4 shadow-2xl shadow-black/55">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-zinc-200">Deck budget</p><p className="mt-0.5 text-[10px] text-zinc-600">Price scoring is {budget===null?'disabled':'included in cut scores'}.</p></div><p className="font-mono text-sm text-zinc-200">${deckPrice.toFixed(2)}</p></div>
                <input type="range" min="0" max="300" step="1" value={budgetToSliderPosition(budgetDraft)} onChange={(event)=>setBudgetDraft(sliderPositionToBudget(Number(event.target.value)))} onPointerUp={(event)=>commitBudgetSlider(event.currentTarget.value)} onKeyUp={(event)=>commitBudgetSlider(event.currentTarget.value)} onBlur={(event)=>commitBudgetSlider(event.currentTarget.value)} className="mt-4 w-full accent-[var(--binder-accent)]" aria-label="Deck budget" />
                <div className="mt-2 flex items-center gap-2"><label className="flex h-9 flex-1 items-center rounded-lg border border-white/10 bg-black/20 px-2 text-sm text-zinc-500">$<input type="number" min="0" max="10000" step="1" value={budgetDraft??''} onChange={(event)=>{const value=event.target.value===''?null:Math.max(0,Number(event.target.value));setBudgetDraft(value);onBudgetChange(value);}} placeholder="No budget" className="min-w-0 flex-1 bg-transparent pl-1 text-zinc-200 outline-none" aria-label="Type a deck budget" /></label><button type="button" onClick={()=>onBudgetChange(null)} disabled={budget===null} className="h-9 rounded-lg px-3 text-xs text-zinc-500 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30">Clear</button></div>
                {budgetDraft!==null&&<p className={`mt-3 text-[10px] ${deckPrice>budgetDraft?'text-rose-300':'text-emerald-300'}`}>{deckPrice>budgetDraft?`$${(deckPrice-budgetDraft).toFixed(2)} over budget`:`$${(budgetDraft-deckPrice).toFixed(2)} under budget`}{budgetDraft!==budget?' · release to apply':''}</p>}
              </div>
            </details>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedEngineId('');
                setEngineOverviewOpen(true);
              }}
              className="binder-engine-trigger group grid size-9 place-items-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-[var(--binder-accent)]"
              aria-label="Open deck engine overview"
              title="Deck engines"
            >
              <EngineGlyph className="size-6" />
            </button>
          </div>
          <div className="relative min-h-0">
            <button type="button" disabled={Boolean(focusedKey)} onClick={openManaAnalysis} aria-expanded={manaPhase!=='closed'} className="binder-workspace-chrome absolute left-1/2 top-0 z-40 grid size-10 -translate-x-1/2 -translate-y-1/3 place-items-center rounded-full bg-[#111614] shadow-[0_4px_16px_rgba(0,0,0,.5)] transition hover:scale-105 disabled:pointer-events-none" title={colorTotals.map(([color,count]) => `${Math.round(count/colorTotal*100)}% ${color}`).join(' · ')} aria-label="Show mana and color analysis"><span className="block size-8 rounded-full shadow-[inset_0_0_0_4px_#141817]" style={{ background: colorPie }} /></button>
            {manaPhase!=='closed' && <div className={`binder-mana-overlay binder-mana-phase-${manaPhase} fixed inset-0 z-[80] grid place-items-center bg-black/40 p-5 backdrop-blur-md`}>
              <div className="binder-mana-pie-stage pointer-events-none absolute inset-0 m-auto size-64">
                <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible drop-shadow-[0_24px_35px_rgba(0,0,0,.55)]" role="img" aria-label="Deck color distribution">
                  {manaSlices.map((slice,index)=><path key={slice.color} d={slice.path} fill={COLOR_HEX[slice.color]} className="binder-mana-slice" style={{'--slice-x':`${slice.x}px`,'--slice-y':`${slice.y}px`,'--slice-x-far':`${slice.x*1.8}px`,'--slice-y-far':`${slice.y*1.8}px`,'--slice-index':index} as CSSProperties} />)}
                </svg>
              </div>
              <section className="binder-mana-analysis w-[min(560px,96%)] rounded-2xl border border-white/10 bg-[#111614]/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,.65)]" aria-label="Mana analysis">
              <div className="flex items-center justify-between"><div><p className="font-heading text-base font-semibold text-white">Mana balance</p><p className="text-[10px] text-zinc-500">Casting demand compared with available production</p></div><button type="button" onClick={closeManaAnalysis} className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Close mana analysis"><X className="size-4" /></button></div>
              <div className="mt-4 grid grid-cols-2 gap-6">
                {[["Deck colors",colorTotals,colorTotal,colorPie],["Mana production",productionTotals,productionTotal,productionPie]].map(([label,values,total,pie])=><div key={label as string} className="grid grid-cols-[68px_1fr] items-center gap-3"><div className="size-16 rounded-full shadow-[inset_0_0_0_9px_#141817]" style={{background:pie as string}} /><div><p className="mb-1.5 text-xs font-medium text-zinc-200">{label as string}</p><div className="space-y-0.5">{(values as [string,number][]).map(([color,count])=><p key={color} className="flex justify-between gap-3 text-[10px] text-zinc-500"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{background:COLOR_HEX[color]}} />{color}</span><span className="font-mono text-zinc-300">{Math.round(count/(total as number)*100)}%</span></p>)}</div></div></div>)}
              </div>
              <div className="mt-5 border-t border-white/8 pt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-zinc-200">Mana curve</p><p className="text-[10px] text-zinc-600">Nonland cards</p></div><div className="flex h-24 items-end gap-2">{manaCurve.map((count,index)=><div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="font-mono text-[9px] text-zinc-500">{count}</span><div className="w-full rounded-t-sm bg-[var(--binder-accent)]" style={{height:`${Math.max(count?8:1,count/maxCurve*100)}%`}} /><span className="font-mono text-[9px] text-zinc-600">{index===7?'7+':index}</span></div>)}</div></div>
              </section>
            </div>}
            <div key={`${page}-${cardsPerSpread}`} inert={isTurningPage || refreshPhase!=='idle' ? true : undefined} aria-busy={isTurningPage || refreshPhase!=='idle'} className={`binder-spread grid h-full min-h-0 drop-shadow-[0_18px_25px_rgba(0,0,0,.34)] ${isTurningPage||refreshPhase!=='idle'?'pointer-events-none':''} ${!isTurningPage&&refreshPhase!=='idle'?`binder-content-refresh-${refreshPhase}`:''} ${binderLayout.sheets === 2 ? 'grid-cols-2' : `grid-cols-1 ${isTurningPage?`binder-single-slide-out-${pageDirection}`:''}`}`}>
              <div className={`grid min-h-0 gap-3 bg-[var(--binder-page)] p-3 sm:p-4 ${binderLayout.sheets===1?'overflow-hidden rounded-2xl shadow-[inset_0_0_22px_rgba(0,0,0,.22)]':'rounded-l-2xl rounded-r-sm shadow-[inset_-14px_0_22px_rgba(0,0,0,.22)]'}`} style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{displayedLeftPage.map(renderSlot)}</div>
              {binderLayout.sheets === 2 && <div className="grid min-h-0 gap-3 rounded-l-sm rounded-r-2xl border-l border-black/30 bg-[var(--binder-page)] p-3 shadow-[inset_14px_0_22px_rgba(0,0,0,.22)] sm:p-4" style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{displayedRightPage.map((item,index)=>renderSlot(item,index+cardsPerSheet))}</div>}
            </div>
            {isTurningPage && binderLayout.sheets === 2 && <div className={`binder-turning-sheet binder-full-turn-${pageDirection} pointer-events-none absolute inset-y-0 z-30 w-1/2 ${pageDirection==='next'?'right-0':'left-0'}`}>
              <div className={`binder-turn-face binder-turn-front absolute inset-0 grid gap-3 bg-[var(--binder-page)] p-3 sm:p-4 ${pageDirection==='next'?'rounded-r-2xl shadow-[inset_14px_0_22px_rgba(0,0,0,.22)]':'rounded-l-2xl shadow-[inset_-14px_0_22px_rgba(0,0,0,.22)]'}`} style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{turningFrontItems.map(renderSlot)}</div>
              <div className={`binder-turn-face binder-turn-back absolute inset-0 grid gap-3 bg-[var(--binder-page)] p-3 sm:p-4 ${pageDirection==='next'?'rounded-l-2xl shadow-[inset_-14px_0_22px_rgba(0,0,0,.22)]':'rounded-r-2xl shadow-[inset_14px_0_22px_rgba(0,0,0,.22)]'}`} style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{turningBackItems.map(renderSlot)}</div>
            </div>}
            {isTurningPage && binderLayout.sheets === 1 && <div className={`binder-single-page-in binder-single-slide-in-${pageDirection} pointer-events-none absolute inset-0 z-30 grid gap-3 overflow-hidden rounded-2xl bg-[var(--binder-page)] p-3 shadow-[inset_0_0_22px_rgba(0,0,0,.22)] sm:p-4`} style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{turningTargetItems.slice(0,cardsPerSheet).map(renderSlot)}</div>}
            {commanderItem && <div className="binder-workspace-chrome group absolute bottom-0 left-1/2 z-40 -translate-x-1/2 translate-y-1/3">
              <div className="pointer-events-none absolute bottom-9 left-1/2 aspect-[63/88] w-28 -translate-x-1/2 translate-y-4 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {commanderCard?.cardData?.imageUri ? <img src={commanderCard.cardData.imageUri} alt="" className="h-full w-full rounded-[4.75%] object-cover shadow-[0_18px_38px_rgba(0,0,0,.65)] [clip-path:inset(0_round_4.75%)]" /> : <div className="grid h-full place-items-center rounded-md bg-zinc-900 text-xs text-zinc-500">{commander}</div>}
              </div>
              <button type="button" onClick={()=>onFocus(keyOf(commanderItem.card))} className="grid size-11 place-items-center rounded-full border border-amber-300/45 bg-[#171914] text-amber-300 shadow-[0_0_18px_rgba(252,211,77,.25),0_5px_14px_rgba(0,0,0,.55)] transition hover:scale-105 hover:bg-amber-300 hover:text-amber-950" aria-label={`Inspect commander ${commander}`}><Crown className="size-5" /></button>
            </div>}
          </div>
        </section>

        <footer className="binder-workspace-chrome grid grid-cols-[1fr_auto_1fr] items-center border-t border-white/8 px-4 text-xs text-zinc-500 sm:px-6">
          <button type="button" disabled={page===0||isTurningPage} onClick={()=>changePage('previous')} className="flex items-center gap-1 justify-self-start disabled:opacity-25"><ChevronLeft className="size-4" />Previous</button>
          <span>{presentedItems.length ? `${page*cardsPerSpread+1}–${Math.min((page+1)*cardsPerSpread,presentedItems.length)} of ${presentedItems.length}` : 'No cards in this filter'}</span>
          <button type="button" disabled={page>=pageCount-1||isTurningPage} onClick={()=>changePage('next')} className="flex items-center gap-1 justify-self-end disabled:opacity-25">Next<ChevronRight className="size-4" /></button>
        </footer>
      </div>

      {introPhase !== 'done' && (
        <div className={`binder-intro-overlay binder-intro-${introPhase} fixed inset-0 z-[100] grid place-items-center overflow-hidden`} aria-label={`Opening ${deckName} binder`}>
          <div className="binder-intro-curtain absolute inset-0 bg-[#0b0f0e]" />
          <div className="binder-intro-book absolute bottom-[54px] top-[96px] w-[calc((100vw-40px)/2)] [perspective:1800px]">
            <div className="binder-intro-pages pointer-events-none absolute inset-0 grid min-h-0 gap-3 overflow-hidden rounded-r-2xl bg-[var(--binder-page)] p-3 shadow-[0_28px_80px_rgba(0,0,0,.72),inset_14px_0_22px_rgba(0,0,0,.22)] sm:p-4" style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{(binderLayout.sheets===2?rightPage:pageItems).map((item,index)=>renderSlot(item,index+cardsPerSheet))}</div>
            <div className="binder-intro-cover pointer-events-none absolute inset-0 origin-left">
              <div className="binder-intro-face binder-intro-cover-front absolute inset-0 grid place-items-center overflow-hidden rounded-[1.6rem] border border-white/10 bg-[var(--binder-page-deep)] shadow-[0_30px_85px_rgba(0,0,0,.75),inset_-22px_0_38px_rgba(0,0,0,.3)]">
                <div className="absolute inset-3 rounded-[1.2rem] border border-white/[.07]" />
                <div className="absolute inset-y-0 left-7 w-px bg-white/[.08] shadow-[4px_0_10px_rgba(0,0,0,.55)]" />
                <div className="relative max-w-[76%] text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-[.34em] text-white/35">Deck binder</p>
                  <h1 className="mt-4 font-heading text-[clamp(1.7rem,4vw,4rem)] font-semibold tracking-[-.04em] text-white/90 [text-shadow:0_3px_18px_rgba(0,0,0,.65)]">{deckName}</h1>
                  <div className="mt-6 flex items-center justify-center gap-2.5" aria-label={`Deck colors ${commanderIdentity.length ? commanderIdentity.join(', ') : 'colorless'}`}>
                    {(commanderIdentity.length ? commanderIdentity : ['C']).map((color,index)=><span key={color} className="binder-intro-mana-symbol grid size-10 place-items-center rounded-full border border-black/40 font-heading text-base font-bold text-black/70 shadow-[0_5px_13px_rgba(0,0,0,.4),inset_0_2px_3px_rgba(255,255,255,.45)]" style={{background:COLOR_HEX[color]??COLOR_HEX.C,'--mana-index':index} as CSSProperties}>{color}</span>)}
                  </div>
                </div>
                <span className="absolute bottom-5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-[var(--binder-accent)]/45 shadow-[0_0_16px_var(--binder-glow)]" />
              </div>
              <div className="binder-intro-face binder-intro-cover-back absolute inset-0 grid min-h-0 gap-3 rounded-l-2xl bg-[var(--binder-page)] p-3 shadow-[inset_-14px_0_22px_rgba(0,0,0,.22)] sm:p-4" style={{gridTemplateColumns:`repeat(${binderLayout.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${binderLayout.rows},minmax(0,1fr))`}}>{(binderLayout.sheets===2?leftPage:pageItems).map(renderSlot)}</div>
            </div>
          </div>
        </div>
      )}

      {engineOverviewOpen && (
        <section className="binder-engine-overlay fixed inset-0 z-[80] grid place-items-center bg-black/42 p-4 backdrop-blur-md" aria-label="Deck engine overview">
          <div className="binder-engine-window flex max-h-[88vh] w-[min(880px,96vw)] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111614]/96 shadow-[0_30px_90px_rgba(0,0,0,.72)]">
            <header className="flex items-center justify-between px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="binder-engine-running grid size-10 place-items-center rounded-full bg-white/[.04] text-[var(--binder-accent)]"><EngineGlyph className="size-7" /></span>
                <div><h2 className="font-heading text-lg font-semibold text-white">Deck engines</h2><p className="text-[10px] text-zinc-500">Choose an engine to reveal its moving pieces</p></div>
              </div>
              <button type="button" onClick={()=>setEngineOverviewOpen(false)} className="grid size-9 place-items-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-white" aria-label="Close engine overview"><X className="size-4" /></button>
            </header>

            <div className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
              {engines.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {engines.map((engine,index) => {
                    const active = selectedEngine?.id === engine.id;
                    return <button key={engine.id} type="button" onClick={()=>setSelectedEngineId(active?'':engine.id)} aria-expanded={active} className={`binder-engine-node group relative min-h-24 overflow-hidden rounded-2xl border p-3 text-left transition ${active?'border-[var(--binder-accent)]/60 bg-white/[.07]':'border-white/[.07] bg-black/15 hover:border-white/15 hover:bg-white/[.04]'}`} style={{'--engine-index':index} as CSSProperties}>
                      <span className="absolute -right-3 -top-3 text-white/[.035]"><EngineGlyph className="size-20" /></span>
                      <span className={`relative grid size-7 place-items-center rounded-full ${active?'text-[var(--binder-accent)]':'text-zinc-600 group-hover:text-zinc-400'}`}><EngineGlyph className="size-5" /></span>
                      <strong className="relative mt-3 block text-xs font-medium text-zinc-200">{engine.label}</strong>
                      <span className="relative mt-1 block text-[9px] uppercase tracking-[.12em] text-zinc-600">{engine.cards.reduce((sum,card)=>sum+card.quantity,0)} cards</span>
                    </button>;
                  })}
                </div>
              ) : <div className="grid min-h-52 place-items-center text-center"><div><EngineGlyph className="mx-auto size-10 text-zinc-700" /><p className="mt-3 text-sm text-zinc-400">No active engines detected</p><p className="mt-1 text-xs text-zinc-600">This deck may rely more on standalone roles than connected engines.</p></div></div>}

              {selectedEngine && <section className="binder-engine-cards mt-5 border-t border-white/8 pt-5" aria-label={`${selectedEngine.label} cards`}>
                <div className="mb-3 flex items-end justify-between gap-4"><div><p className="font-heading text-base font-semibold text-white">{selectedEngine.label}</p><p className="text-[10px] text-zinc-500">Cards that enable, reward, or support this engine</p></div><span className="font-mono text-[10px] text-zinc-600">{selectedEngine.cards.length} unique</span></div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {selectedEngine.cards.map((card,index)=><button key={keyOf(card)} type="button" onClick={()=>{setEngineOverviewOpen(false);onFocus(keyOf(card));}} className="binder-engine-card group relative aspect-[63/88] overflow-hidden rounded-[7%] bg-black/30 shadow-[0_8px_18px_rgba(0,0,0,.35)] transition hover:-translate-y-1 hover:shadow-[0_14px_26px_rgba(0,0,0,.55)]" style={{'--card-index':index} as CSSProperties} aria-label={`Inspect ${card.name}`} title={card.name}>{card.cardData?.imageUri?<img src={card.cardData.imageUri} alt="" className="h-full w-full object-cover" />:<span className="grid h-full place-items-center p-1 text-[9px] text-zinc-500">{card.name}</span>}{card.quantity>1&&<span className="absolute bottom-1 right-1 rounded-full bg-black/75 px-1.5 py-0.5 font-mono text-[9px] text-white">×{card.quantity}</span>}</button>)}
                </div>
              </section>}
            </div>
          </div>
        </section>
      )}

      {focusedKey && focused && (
        <section inert={isClosingInspection ? true : undefined} className={`binder-inspection-backdrop absolute inset-0 z-50 grid place-items-center overflow-hidden bg-black/38 p-5 backdrop-blur-md ${isClosingInspection?'binder-inspection-closing pointer-events-none':''}`} aria-label={`Inspect ${focused.card.name}`}>
          {!isClosingInspection && <button type="button" onClick={closeInspection} className="absolute right-5 top-4 grid size-10 place-items-center rounded-full bg-black/25 text-zinc-300 backdrop-blur" aria-label="Return card to binder"><X className="size-5" /></button>}
          <div className="grid max-h-full w-full max-w-4xl grid-cols-[minmax(220px,340px)_minmax(260px,1fr)] items-center gap-8 lg:gap-14">
            <div className="binder-lifted-card group relative mx-auto aspect-[63/88] max-h-[72vh] w-full max-w-[340px] [perspective:1200px]">
              <div className="relative h-full w-full transition-transform duration-700" style={{transformStyle:'preserve-3d',transform:flipped?'rotateY(180deg)':'rotateY(0deg)'}}>
                {focused.card.cardData?.imageUri ? <img src={focused.card.cardData.imageUri} alt={`${focused.card.name} front face`} className="absolute inset-0 h-full w-full rounded-[4.75%] object-cover shadow-[0_28px_65px_rgba(0,0,0,.65)] [clip-path:inset(0_round_4.75%)]" style={{backfaceVisibility:'hidden'}} /> : <div className="grid h-full place-items-center rounded-[4.75%] bg-zinc-900 text-zinc-500">Artwork unavailable</div>}
                {focused.card.cardData?.backImageUri && <img src={focused.card.cardData.backImageUri} alt={`${focused.card.name} back face`} className="absolute inset-0 h-full w-full rounded-[4.75%] object-cover shadow-[0_28px_65px_rgba(0,0,0,.65)] [clip-path:inset(0_round_4.75%)]" style={{backfaceVisibility:'hidden',transform:'rotateY(180deg)'}} />}
              </div>
              {focused.card.cardData?.backImageUri && <button type="button" onClick={()=>setFlipped((value)=>!value)} className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/60 text-white" aria-label="Flip card"><RefreshCw className="size-4" /></button>}
            </div>

            <div className="binder-inspection-details max-h-[76vh] overflow-y-auto pr-2 text-shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-white">{focused.card.name}<FoilIndicator cacheKey={focused.card.cardData?.cacheKey} /></h1><p className="mt-1 text-sm text-zinc-400">{score >= .7 ? 'Strong cut candidate' : score >= .4 ? 'Worth reviewing' : 'Strong fit for this deck'}</p></div>
                <button type="button" onClick={cycleScore} className="relative grid size-20 shrink-0 place-items-center rounded-full" style={{background:`conic-gradient(${scoreMetric==='all'?'#e6c66a':'var(--binder-accent)'} ${score*100}%,rgba(255,255,255,.09) 0)`}} aria-label={`Cut score ${Math.round(score*100)}. Showing ${scoreDetail?.label ?? scoreMetric}. Click to change score.`}>
                  <span className="absolute inset-[7px] rounded-full bg-[#111614]/95" /><span className="relative text-center"><strong className="block font-mono text-xl text-white">{Math.round(score*100)}</strong><small className="block text-[9px] text-zinc-500">{scoreDetail?.label ?? scoreMetric}</small></span>
                </button>
              </div>
              <div className="mt-5 space-y-4">
                {[['Effects',Zap,focusedEffects],['Themes',Sparkles,focusedThemes],['Roles',Layers3,focusedRoles]].map(([label,Icon,values])=><section key={label as string}><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"><Icon className="size-3.5" />{label as string}</p><div className="flex flex-wrap gap-1.5">{(values as string[]).length?(values as string[]).slice(0,8).map(value=><span key={value} className="border-b border-white/15 bg-black/15 px-2 py-1 text-xs text-zinc-200">{value}</span>):<span className="text-xs text-zinc-600">None detected</span>}</div></section>)}
              </div>
              <div className="mt-5 border-y border-white/10">
                <button type="button" onClick={()=>setShowDetails((value)=>!value)} className="flex w-full items-center justify-between py-3 text-left text-xs text-zinc-300"><span className="flex items-center gap-2"><Info className="size-3.5" />{scoreDetail?.label ?? 'Score'} details</span><ChevronRight className={`size-4 transition-transform ${showDetails?'rotate-90':''}`} /></button>
                {showDetails && scoreDetail && <div className="space-y-2 pb-4 text-xs"><div className="space-y-1">{scoreDetail.rows.map(row=><div key={row.label} className="flex justify-between gap-4"><span className="text-zinc-500">{row.label}</span><span className="text-right font-mono text-zinc-200">{row.value}</span></div>)}</div><p className="border-t border-white/8 pt-2 leading-5 text-zinc-500">{scoreDetail.summary}</p></div>}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <Button variant={focusedStatus==='keep'?'secondary':'outline'} onClick={()=>onKeep(focused.card)}><ShieldCheck data-icon="inline-start" />Keep</Button>
                <Button variant={focusedStatus==='undecided'?'secondary':'outline'} disabled={focused.card.name===commander} onClick={()=>onUndecided(focused.card)}>Undecided</Button>
                <Button variant={focusedStatus==='cut'?'destructive':'outline'} disabled={focused.card.name===commander} onClick={()=>onCut(focused.card)}><Scissors data-icon="inline-start" />Cut</Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
