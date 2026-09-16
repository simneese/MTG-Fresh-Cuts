import type { WorkspaceCard } from '@/DeckWorkspace';
import type {
  CardEffect,
  EffectAbilityKind,
  EffectDirection,
  EffectEvent,
  EffectQuantity,
  EffectSubject,
  EffectTiming,
  NamedTokenType,
} from './types';

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const NAMED_TOKENS: NamedTokenType[] = [
  'blood',
  'clue',
  'food',
  'gold',
  'incubator',
  'map',
  'powerstone',
  'treasure',
];

export type OracleParagraph = {
  index: number;
  text: string;
  sourceStart: number;
};

export function oracleTextWithoutReminderText(card: WorkspaceCard) {
  return (card.cardData?.oracleText ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '');
}

export function oracleParagraphs(card: WorkspaceCard): OracleParagraph[] {
  const text = oracleTextWithoutReminderText(card);
  let sourceStart = 0;
  return text.split(/\n+/).flatMap((raw, index) => {
    const paragraph = raw.trim();
    const result = paragraph
      ? [{ index, text: paragraph, sourceStart: sourceStart + raw.indexOf(paragraph) }]
      : [];
    sourceStart += raw.length + 1;
    return result;
  });
}

function abilityKind(card: WorkspaceCard, paragraph: string): EffectAbilityKind {
  if (/\b(?:when|whenever|at)\b/.test(paragraph)) return 'triggered';
  if (/\bif\b[^.]*\binstead\b|\bwould\b[^.]*\binstead\b/.test(paragraph))
    return 'replacement';
  if (paragraph.includes(':')) return 'activated';
  if (/\binstant\b|\bsorcery\b/i.test(card.cardData?.typeLine ?? ''))
    return 'spell';
  return 'static';
}

function timingFor(card: WorkspaceCard, paragraph: string): EffectTiming {
  const kind = abilityKind(card, paragraph);
  const oncePerTurn = /\bonly once (?:each|per) turn\b/.test(paragraph);
  const requiresTap = /^\s*[^:]*\{t\}[^:]*:/.test(paragraph);
  const sorcerySpeedOnly = /\bactivate only as a sorcery\b/.test(paragraph);
  const delayedOneShot = /\bat the beginning of the next\b/.test(paragraph);
  const recurringTrigger =
    kind === 'triggered' &&
    !delayedOneShot &&
    /\bwhenever\b|\bat the beginning of (?:each|your)\b|\beach (?:upkeep|end step|combat)\b/.test(
      paragraph,
    );
  const activatedRepeatable =
    kind === 'activated' &&
    !/\bsacrifice (?:this (?:permanent|card|creature|artifact|land)|it)\b/.test(
      paragraph.split(':')[0] ?? '',
    );
  const repeatable = recurringTrigger || activatedRepeatable;
  return {
    abilityKind: kind,
    repeatable,
    multiUsePerTurn:
      repeatable && !oncePerTurn && !requiresTap && !delayedOneShot,
    instantSpeed: kind === 'activated' && !sorcerySpeedOnly,
    oncePerTurn,
    requiresTap,
    sorcerySpeedOnly,
  };
}

function quantityFrom(text: string): EffectQuantity {
  const value = text.match(
    /\b(a|an|one|two|three|four|five|six|\d+)\b/,
  )?.[1];
  const unbounded = /\b(?:any number of|for each|that many|that much|x)\b/.test(
    text,
  );
  const expected = /\b(?:any number of|one or more)\b/.test(text)
    ? 3
    : /\ball\b/.test(text)
      ? 4
      : value
        ? (NUMBER_WORDS[value] ?? Number(value))
        : 1;
  const scalesWithPlayers = /\beach (?:player|opponent)\b/.test(text);
  return {
    minimum: /\bup to\b/.test(text) ? 0 : 1,
    expected: expected * (scalesWithPlayers ? 3 : 1),
    unbounded,
    scalesWithPlayers,
    expression: value ?? (unbounded ? 'scaling' : undefined),
  };
}

function subjectFrom(text: string, card?: WorkspaceCard): EffectSubject {
  const tokenType = NAMED_TOKENS.find((type) =>
    new RegExp(`\\b${type}s?\\b`).test(text),
  );
  const kind = /\bcreatures?\b/.test(text)
    ? 'creature'
    : /\bartifacts?\b/.test(text)
      ? 'artifact'
      : /\benchantments?\b/.test(text)
        ? 'enchantment'
        : /\blands?\b/.test(text)
          ? 'land'
          : /\b(?:permanents?|this permanent)\b/.test(text)
            ? 'permanent'
            : /\bspells?\b/.test(text)
              ? 'spell'
              : /\btokens?\b/.test(text) || tokenType
                ? 'token'
                : /\bplayers?|opponents?\b/.test(text)
                  ? 'player'
                  : 'card';
  const controller = /\beach opponent\b/.test(text)
    ? 'each-opponent'
    : /\beach player\b/.test(text)
      ? 'each-player'
      : /\btarget (?:player|opponent)\b/.test(text)
        ? 'target-player'
        : /\bopponents?\b/.test(text)
          ? 'opponent'
          : /\byou control\b|\byour\b/.test(text)
            ? 'you'
            : undefined;
  const frontName = card?.name.split('//')[0].trim().toLowerCase();
  const selfReference =
    /\b(?:this card|this creature|this artifact|this permanent|this land)\b/.test(
      text,
    ) ||
    /^(?:it)\b/.test(text.trim()) ||
    Boolean(frontName && text.includes(frontName));
  return {
    kind,
    controller,
    tokenType,
    qualifiers: selfReference ? ['self'] : undefined,
  };
}

function addMatches(
  effects: CardEffect[],
  card: WorkspaceCard,
  paragraph: OracleParagraph,
  detectorId: string,
  pattern: RegExp,
  config: {
    label: string | ((match: RegExpMatchArray) => string);
    direction:
      | EffectDirection
      | ((match: RegExpMatchArray) => EffectDirection);
    event: EffectEvent;
    subject?: (match: RegExpMatchArray) => EffectSubject;
    sourceZone?: CardEffect['sourceZone'];
    destinationZone?: CardEffect['destinationZone'];
    inferred?: boolean;
  },
) {
  for (const match of paragraph.text.matchAll(pattern)) {
    const matchedText = match[0];
    const start = paragraph.sourceStart + (match.index ?? 0);
    effects.push({
      id: `${card.key ?? card.name}:${paragraph.index}:${detectorId}:${effects.length}`,
      label:
        typeof config.label === 'function' ? config.label(match) : config.label,
      direction:
        typeof config.direction === 'function'
          ? config.direction(match)
          : config.direction,
      event: config.event,
      subject: config.subject?.(match) ?? subjectFrom(matchedText, card),
      sourceZone: config.sourceZone,
      destinationZone: config.destinationZone,
      timing: timingFor(card, paragraph.text),
      quantity: quantityFrom(matchedText),
      conditions: [],
      evidence: [
        {
          detectorId,
          paragraphIndex: paragraph.index,
          paragraphText: paragraph.text,
          matchedText,
          start,
          end: start + matchedText.length,
          inferred: config.inferred ?? false,
        },
      ],
    });
  }
}

export function extractCardEffects(card: WorkspaceCard): CardEffect[] {
  const effects: CardEffect[] = [];
  for (const paragraph of oracleParagraphs(card)) {
    addMatches(
      effects,
      card,
      paragraph,
      'sacrifice-effect',
      /\bsacrific(?:e|es)\s+([^:.;\n]+)/g,
      {
        label: (match) => {
          const prefix = paragraph.text.slice(0, match.index ?? 0);
          const watches =
            /\b(?:when|whenever|if)\b/.test(prefix) && !prefix.includes(',');
          const subject = subjectFrom(match[1], card).kind;
          return watches
            ? `${subject[0].toUpperCase()}${subject.slice(1)} Sacrifice Trigger`
            : `Sacrifices ${subject}`;
        },
        direction: (match) => {
          const prefix = paragraph.text.slice(0, match.index ?? 0);
          return /\b(?:when|whenever|if)\b/.test(prefix) &&
            !prefix.includes(',')
            ? 'listens'
            : 'emits';
        },
        event: 'sacrificed',
        subject: (match) => subjectFrom(match[1], card),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'dies-trigger',
      /\b(?:when|whenever|if)\b[^.\n]*\bcreatures?\b[^.\n]*\bdies?\b/g,
      {
        label: 'Creature Dies Trigger',
        direction: 'listens',
        event: 'dies',
        subject: () => ({ kind: 'creature' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'ltb-trigger',
      /\b(?:when|whenever|if)\b[^.\n]*\b(?:tokens?|creatures?|permanents?)\b[^.\n]*\bleaves? the battlefield\b/g,
      {
        label: (match) =>
          /\btoken/.test(match[0])
            ? 'Token Leaves-the-Battlefield Trigger'
            : 'Leaves-the-Battlefield Trigger',
        direction: 'listens',
        event: 'leaves-battlefield',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'token-create',
      /\bcreates?\b[^.\n]*\b(?:tokens?|treasures?|clues?|food|blood|maps?|gold|powerstones?|incubators?)\b/g,
      {
        label: (match) => {
          const token = NAMED_TOKENS.find((type) =>
            new RegExp(`\\b${type}s?\\b`).test(match[0]),
          );
          return token
            ? `Creates ${token[0].toUpperCase()}${token.slice(1)}`
            : 'Creates Tokens';
        },
        direction: 'creates',
        event: 'created',
      },
    );
    addMatches(effects, card, paragraph, 'draw', /\bdraws?\b[^.\n]*/g, {
      label: 'Draws Cards',
      direction: 'emits',
      event: 'drawn',
      subject: () => ({ kind: 'card', controller: 'you' }),
      destinationZone: 'hand',
    });
    addMatches(
      effects,
      card,
      paragraph,
      'discard',
      /\bdiscards?\b[^.\n]*/g,
      {
        label: 'Discards Cards',
        direction: /^\s*(?:when|whenever|if)\b/.test(paragraph.text)
          ? 'listens'
          : 'emits',
        event: 'discarded',
        subject: () => ({ kind: 'card' }),
        destinationZone: 'graveyard',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'recursion',
      /\b(?:return|put)\b[^.\n]*\b(?:from|in) (?:your|a|any|target player'?s|an opponent'?s) graveyard\b[^.\n]*(?:\bto|\bonto) (?:your hand|the battlefield|the top of [^.\n]*library)|\b(?:you may )?cast\b[^.\n]*\bfrom (?:your|a|any) graveyard\b/g,
      {
        label: (match) =>
          /battlefield/.test(match[0])
            ? 'Returns from Graveyard to Battlefield'
            : /hand/.test(match[0])
              ? 'Returns from Graveyard to Hand'
              : /top of/.test(match[0])
                ? 'Returns from Graveyard to Library'
                : 'Casts from Graveyard',
        direction: 'emits',
        event: 'returned',
        sourceZone: 'graveyard',
        destinationZone: /battlefield/.test(paragraph.text)
          ? 'battlefield'
          : /hand/.test(paragraph.text)
            ? 'hand'
            : /library/.test(paragraph.text)
              ? 'library'
              : undefined,
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'grants-death-return',
      /\b(?:target |another |enchanted |equipped )?creatures?(?: you control)?\b[^.\n]*(?:gains?|has|have)\b[^.\n]*\bwhen(?:ever)? (?:this|that) creature dies\b[^.\n]*\breturn (?:it|that card)\b[^.\n]*\b(?:to|onto) the battlefield\b/g,
      {
        label: 'Grants Death Return',
        direction: 'grants',
        event: 'returned',
        subject: () => ({ kind: 'creature' }),
        sourceZone: 'graveyard',
        destinationZone: 'battlefield',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'removal',
      /\b(?:destroy|exile)\b[^.\n]*\b(?:target|all|each)\b[^.\n]*\b(?:creatures?|artifacts?|enchantments?|permanents?|planeswalkers?|battles?)\b/g,
      {
        label: (match) =>
          match[0].startsWith('destroy') ? 'Destroys Permanents' : 'Exiles Permanents',
        direction: 'emits',
        event: /destroy/.test(paragraph.text) ? 'dies' : 'exiled',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'counterspell',
      /\bcounter\b[^.\n]*\b(?:spells?|abilit(?:y|ies))\b/g,
      {
        label: 'Counters Spells or Abilities',
        direction: 'emits',
        event: 'countered',
        subject: (match) => subjectFrom(match[0]),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'tutor',
      /\bsearch (?:your|their|that player'?s) library for\b[^.\n]*/g,
      {
        label: 'Searches Library',
        direction: 'emits',
        event: 'searched',
        subject: () => ({ kind: 'card' }),
        sourceZone: 'library',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'life-gain',
      /\b(?:you|its controller|that player) gains? (?:that much|x|\d+|one|two|three|four|five|a) life\b/g,
      {
        label: 'Gains Life',
        direction: 'emits',
        event: 'life-gained',
        subject: () => ({ kind: 'player', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'life-loss',
      /\b(?:(?:target|each|an) opponent|your opponents?|target player|defending player) loses? (?:that much|x|\d+|one|two|three|four|five|a) life\b/g,
      {
        label: 'Causes Life Loss',
        direction: 'emits',
        event: 'life-lost',
        subject: () => ({ kind: 'player', controller: 'opponent' }),
      },
    );
  }
  return effects;
}
