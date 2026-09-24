import { SYNERGY_ANALYSIS_SCHEMA_VERSION } from './types.ts';
import type {
  CardEffect,
  EffectAbilityKind,
  EffectDirection,
  EffectEvent,
  EffectQuantity,
  EffectSubject,
  EffectTiming,
  NamedTokenType,
} from './types.ts';

type EffectCard = {
  key?: string;
  name: string;
  cardData?: {
    oracleText?: string;
    typeLine?: string;
    manaCost?: string;
    keywords?: string[];
  };
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
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

export function oracleTextWithoutReminderText(card: EffectCard) {
  return (card.cardData?.oracleText ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '');
}

export function oracleParagraphs(card: EffectCard): OracleParagraph[] {
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

function abilityKind(card: EffectCard, paragraph: string): EffectAbilityKind {
  if (/\b(?:when|whenever|at)\b/.test(paragraph)) return 'triggered';
  if (/\bif\b[^.]*\binstead\b|\bwould\b[^.]*\binstead\b/.test(paragraph))
    return 'replacement';
  if (paragraph.includes(':')) return 'activated';
  if (/\binstant\b|\bsorcery\b/i.test(card.cardData?.typeLine ?? ''))
    return 'spell';
  return 'static';
}

function timingScopeForMatch(
  paragraph: string,
  start: number,
  length: number,
) {
  const quotePattern = /[“"]([^”"]*)[”"]/g;
  for (const quote of paragraph.matchAll(quotePattern)) {
    const quoteStart = quote.index ?? -1;
    const quoteEnd = quoteStart + quote[0].length;
    if (start >= quoteStart && start + length <= quoteEnd)
      return quote[1];
  }
  // Restrictions inside a granted/quoted ability belong to that ability and
  // must not change the timing of the surrounding effect.
  return paragraph.replace(quotePattern, '');
}

function timingFor(card: EffectCard, paragraph: string): EffectTiming {
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

function subjectFrom(text: string, card?: EffectCard): EffectSubject {
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
  const qualifiers = [
    selfReference ? 'self' : '',
    kind !== 'token' && /\btokens?\b/.test(text) ? 'token' : '',
    kind === 'token' && /\bcreatures?\b/.test(text) ? 'creature' : '',
    kind !== 'artifact' && /\bartifacts?\b/.test(text) ? 'artifact' : '',
  ].filter(Boolean);
  const selfTypeLine = selfReference
    ? card?.cardData?.typeLine?.toLowerCase() ?? ''
    : '';
  const selfNamedTokenType = selfReference
    ? NAMED_TOKENS.find((type) =>
        new RegExp(`\\b${type}\\b`).test(selfTypeLine),
      )
    : undefined;
  const resolvedKind = selfTypeLine.includes('creature')
    ? 'creature'
    : selfTypeLine.includes('artifact')
      ? 'artifact'
      : selfTypeLine.includes('land')
        ? 'land'
        : kind;
  if (selfReference && selfTypeLine.includes('artifact'))
    qualifiers.push('artifact');
  if (selfReference && selfTypeLine.includes('creature'))
    qualifiers.push('creature');
  return {
    kind: resolvedKind,
    controller,
    tokenType: tokenType ?? selfNamedTokenType,
    qualifiers: qualifiers.length ? qualifiers : undefined,
  };
}

function addMatches(
  effects: CardEffect[],
  card: EffectCard,
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
    const quantity = quantityFrom(matchedText);
    const prefix = paragraph.text.slice(0, match.index ?? 0);
    if (
      !quantity.scalesWithPlayers &&
      /\beach (?:player|opponent)\b/.test(prefix)
    ) {
      quantity.scalesWithPlayers = true;
      quantity.expected *= 3;
    }
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
      timing: timingFor(
        card,
        timingScopeForMatch(
          paragraph.text,
          match.index ?? 0,
          matchedText.length,
        ),
      ),
      quantity,
      conditions: [
        /\btarget\b/.test(matchedText) ? 'target' : '',
        card.cardData?.keywords?.some(
          (keyword) => keyword.toLowerCase() === 'overload',
        ) || /\boverload\b/.test(oracleTextWithoutReminderText(card))
          ? 'overload'
          : '',
        /\bonly once (?:each|per) turn\b/.test(paragraph.text)
          ? 'once-per-turn'
          : '',
        /\b(?:if|unless|as long as|only if)\b/.test(paragraph.text)
          ? 'conditional'
          : '',
        /\b(?:you may|up to)\b/.test(matchedText) ? 'optional' : '',
      ].filter(Boolean),
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

function sacrificeSubjectText(
  match: RegExpMatchArray,
  paragraph: OracleParagraph,
) {
  let subject = match[1] || match[2] || '';
  const prefix = paragraph.text.slice(0, match.index ?? 0);
  if (/\b(?:when|whenever|if)\b/.test(prefix) && subject.includes(','))
    subject = subject.split(',')[0];
  if (!/^it\b/.test(subject)) return subject;
  const linkedSubject = prefix.match(
    /\b(?:that|enchanted|target) (creature|artifact|enchantment|land|permanent|planeswalker|battle|token)(?:['’]s)? controller\s*$/,
  )?.[1];
  return linkedSubject ?? subject;
}

function isTriggeredCastMatch(
  paragraph: OracleParagraph,
  match: RegExpMatchArray,
) {
  const throughCast = paragraph.text.slice(
    0,
    (match.index ?? 0) + match[0].indexOf('cast') + 4,
  );
  return /\b(?:when|whenever|if)\b/.test(throughCast);
}

function usesChosenCreatureType(
  card: EffectCard,
  paragraphText: string,
) {
  const fullText = oracleTextWithoutReminderText(card);
  return (
    /\bchoose a creature type\b/.test(fullText) &&
    /\bspells? of the chosen type\b/.test(paragraphText)
  );
}

function singularCreatureType(type: string) {
  if (type.endsWith('ves')) return `${type.slice(0, -3)}f`;
  if (type.endsWith('ies')) return `${type.slice(0, -3)}y`;
  return type.endsWith('s') ? type.slice(0, -1) : type;
}

const effectCache = new Map<string, CardEffect[]>();
const MAX_EFFECT_CACHE_ENTRIES = 4000;

function cardDataVersion(card: EffectCard) {
  return [
    SYNERGY_ANALYSIS_SCHEMA_VERSION,
    card.cardData?.oracleText ?? '',
    card.cardData?.typeLine ?? '',
    card.cardData?.manaCost ?? '',
  ].join('\u001f');
}

function extractCardEffectsUncached(card: EffectCard): CardEffect[] {
  const effects: CardEffect[] = [];
  for (const paragraph of oracleParagraphs(card)) {
    addMatches(
      effects,
      card,
      paragraph,
      'self-etb-event',
      /\bwhen this [a-z-]+ enters\b[^.\n]*/g,
      {
        label: 'Enters-the-Battlefield Trigger',
        direction: 'emits',
        event: 'enters-battlefield',
        subject: () => ({ kind: 'permanent', controller: 'you', qualifiers: ['self'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'damage-removal',
      /\b(?:each [^.\n]*|[^.\n]*?)deals? (?:\d+|x|that much) damage to (?:target|that|another) creature\b[^.\n]*/g,
      {
        label: 'Deals Damage to Creature',
        direction: 'emits',
        event: 'damaged',
        subject: () => ({ kind: 'creature', controller: 'opponent' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'attack-threshold',
      /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more creatures attacked this turn\b/g,
      {
        label: 'Counts Attacking Creatures',
        direction: 'listens',
        event: 'attacks',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-anthem',
      /\bcreatures? you control (?:get|gets) [+-]\d+\/[+-]\d+\b[^.\n]*/g,
      {
        label: 'Boosts Creatures You Control',
        direction: 'grants',
        event: 'created',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'counter-placement',
      /\b(?:put|distribute) (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) \+1\/\+1 counters?\b[^.\n]*/g,
      {
        label: 'Places +1/+1 Counters',
        direction: 'emits',
        event: 'counter-added',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'clue-animation',
      /\b(?:other |target |each |all )?clues?(?: you control)?\b[^.\n]*\bbecomes?\b[^.\n]*\bcreatures?\b[^.\n]*/g,
      {
        label: 'Animates Clues',
        direction: 'transforms',
        event: 'animated',
        subject: () => ({
          kind: 'token',
          tokenType: 'clue',
          controller: 'you',
          qualifiers: ['becomes-creature'],
        }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'artifact-animation',
      /\b(?:(?:target|each|all) )?noncreature artifacts?(?: you control)?\b(?:[^.\n]*\bbecomes?\b[^.\n]*\bcreatures?\b[^.\n]*|[^.\n]*\.\s*it becomes?\b[^.\n]*\bcreatures?\b[^.\n]*)/g,
      {
        label: 'Animates Artifact',
        direction: 'transforms',
        event: 'animated',
        subject: () => ({
          kind: 'artifact',
          controller: 'you',
          qualifiers: ['noncreature', 'becomes-creature'],
        }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-power-threshold',
      /\bcreatures? you control have total power (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) or greater\b/g,
      {
        label: 'Counts Total Creature Power',
        direction: 'listens',
        event: 'power-increased',
        subject: () => ({ kind: 'creature', controller: 'you', qualifiers: ['total-power'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-power-boost',
      /\b(?:target|another|each|all|up to [^.\n]+|that|enchanted|equipped)?\s*creatures?(?: you control)?\b[^.\n]*\b(?:gets?|get) \+(?:x|\d+)\/\+(?:x|\d+)\b[^.\n]*/g,
      {
        label: 'Boosts Creature Power',
        direction: 'emits',
        event: 'power-increased',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-power-setting',
      /\b(?:double|triple) [^.\n]*\bcreatures?['’]s power\b[^.\n]*|\b(?:target|that|enchanted|equipped) creature['’]s (?:base )?power (?:is|becomes?)\b[^.\n]*/g,
      {
        label: 'Changes Creature Power',
        direction: 'emits',
        event: 'power-increased',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-power-scaling',
      /\b(?:where x is|equal to|equal to the|based on) [^.\n]*\b(?:total|greatest|base)?\s*power\b[^.\n]*|\bcreatures? (?:with|that has|you control with) power (?:x|\d+) or greater\b[^.\n]*/g,
      {
        label: 'Scales with Creature Power',
        direction: 'listens',
        event: 'power-increased',
        subject: () => ({ kind: 'creature', controller: 'you', qualifiers: ['power-scaling'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'keyword-grant',
      /\b(?:it|that creature|target creature|target attacking creature|creatures? you control) gains? (?:flying|first strike|double strike|deathtouch|fear|haste|hexproof|horsemanship|indestructible|intimidate|lifelink|menace|reach|shadow|skulk|trample|vigilance)\b[^.\n]*/g,
      {
        label: (match) => `Grants ${match[0].match(/\b(flying|first strike|double strike|deathtouch|fear|haste|hexproof|horsemanship|indestructible|intimidate|lifelink|menace|reach|shadow|skulk|trample|vigilance)\b/)?.[1]?.replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? 'Keyword'}`,
        direction: 'grants',
        event: 'keyword-granted',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(effects, card, paragraph, 'flash', /^flash$/g, {
      label: 'Has Flash',
      direction: 'grants',
      event: 'keyword-granted',
      subject: () => ({ kind: 'spell', qualifiers: ['self'] }),
    });
    addMatches(
      effects,
      card,
      paragraph,
      'enchants-creature',
      /^enchant creature$/g,
      {
        label: 'Enchants Creature',
        direction: 'consumes',
        event: 'attached',
        subject: () => ({ kind: 'creature', controller: 'target-player' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'attack-block-restriction',
      /\b(?:enchanted|target|that) creature\b[^.\n]*\bcan(?:not|'t) attack or block\b[^.\n]*/g,
      {
        label: 'Prevents Attacking or Blocking',
        direction: 'grants',
        event: 'restricted',
        subject: () => ({ kind: 'creature', controller: 'opponent' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'umbra-armor-protection',
      /\b(?:this aura|it|enchanted creature) has umbra armor\b[^.\n]*/g,
      {
        label: 'Grants Umbra Armor',
        direction: 'grants',
        event: 'keyword-granted',
        subject: () => ({ kind: 'creature' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'ward-protection',
      /\b(?:other|target|another|each|all)?\s*(?:legendary )?creatures?(?: you control)?\b[^.\n]*\b(?:gains?|has|have) ward\b[^.\n]*/g,
      {
        label: 'Grants Ward',
        direction: 'grants',
        event: 'keyword-granted',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'unblockable-grant',
      /\b(?:target|another|that|each|all)?\s*(?:legendary )?creatures?\b[^.\n]*\bcan(?:not|'t) be blocked\b[^.\n]*/g,
      {
        label: 'Grants Unblockable',
        direction: 'grants',
        event: 'combat-damage',
        subject: () => ({ kind: 'creature' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'combat-damage-amplifier',
      /\b(?:double|triple)\b[^.\n]*\b(?:combat )?damage\b[^.\n]*|\bdeals? (?:twice|three times) (?:that|the) (?:combat )?damage\b[^.\n]*/g,
      {
        label: 'Amplifies Combat Damage',
        direction: 'grants',
        event: 'combat-damage',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'extra-combat',
      /\b(?:there is|you get|you have|you may have|add)\b[^.\n]*\badditional combat phase\b[^.\n]*|\bafter this (?:main phase|phase), there is an additional combat phase\b[^.\n]*/g,
      {
        label: 'Adds a Combat Phase',
        direction: 'emits',
        event: 'combat-damage',
        subject: () => ({ kind: 'creature', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'additional-land-play',
      /\b(?:you may )?play (?:up to )?(?:one|an) additional lands?\b[^.\n]*/g,
      {
        label: 'Plays Additional Lands',
        direction: 'emits',
        event: 'played',
        subject: () => ({ kind: 'land', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'land-count-threshold',
      /\byou control (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) or more lands?\b/g,
      {
        label: 'Counts Lands You Control',
        direction: 'listens',
        event: 'enters-battlefield',
        subject: () => ({ kind: 'land', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'graveyard-count-threshold',
      /\b(?:there are|you have) (?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|\d+) or more cards? in your graveyard\b/g,
      {
        label: 'Counts Cards in Graveyard',
        direction: 'listens',
        event: 'accessed',
        subject: () => ({ kind: 'card', controller: 'you', qualifiers: ['graveyard-count'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'top-library-visibility',
      /\b(?:you may )?look at the top card of your library\b[^,.\n]*/g,
      {
        label: 'Looks at Top Card of Library',
        direction: 'grants',
        event: 'accessed',
        subject: () => ({ kind: 'card', controller: 'you', qualifiers: ['top-of-library'] }),
        sourceZone: 'library',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'tap-event',
      /\b(?:when|whenever|if)\b[^.\n]*\b(?:this|that|a|another) (?:creature|artifact|permanent) becomes tapped\b/g,
      {
        label: 'Becomes Tapped Trigger',
        direction: 'listens',
        event: 'tapped',
        subject: () => ({ kind: 'permanent', qualifiers: ['self'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'top-library-to-hand',
      /\bif (?:it(?:'s| is)|the top card is) a land card\b[^.\n]*\bput it into your hand\b|\bput (?:the|that) top card\b[^.\n]*\binto your hand\b/g,
      {
        label: 'Puts Top Land into Hand',
        direction: 'emits',
        event: 'drawn',
        subject: () => ({ kind: 'land', controller: 'you', qualifiers: ['top-of-library'] }),
        sourceZone: 'library',
        destinationZone: 'hand',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'top-library-to-graveyard',
      /\bif you don'?t put (?:the|that) card into your hand\b[^.\n]*\bput it into your graveyard\b|\bput (?:the|that) top card\b[^.\n]*\binto your graveyard\b/g,
      {
        label: 'Puts Top Card into Graveyard',
        direction: 'emits',
        event: 'milled',
        subject: () => ({ kind: 'card', controller: 'you', qualifiers: ['top-of-library'] }),
        sourceZone: 'library',
        destinationZone: 'graveyard',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'top-library-play',
      /\b(?:you may )?(?:play lands? and )?cast [^.\n]+ spells? from the top of your library\b|\b(?:you may )?play lands? from the top of your library\b/g,
      {
        label: 'Plays Cards from Top of Library',
        direction: 'emits',
        event: 'played',
        subject: () => ({ kind: 'card', controller: 'you', qualifiers: ['top-of-library'] }),
        sourceZone: 'library',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'sacrifice-effect',
      /\b(?:for each (artifact|creature|enchantment|land|permanent|planeswalker|battle|token)[^,.;\n]*,\s*(?:its|their) controller\s+)?sacrific(?:e|es)\s+([^:.;\n]+)/g,
      {
        label: (match) => {
          const prefix = paragraph.text.slice(0, match.index ?? 0);
          const watches =
            /\b(?:when|whenever|if)\b/.test(prefix) && !prefix.includes(',');
          const subject = subjectFrom(
            sacrificeSubjectText(match, paragraph),
            card,
          );
          const displaySubjectValue = subject.tokenType ?? subject.kind;
          const displaySubject = `${displaySubjectValue[0].toUpperCase()}${displaySubjectValue.slice(1)}`;
          return watches
            ? `${displaySubject} Sacrifice Trigger`
            : `Sacrifices ${displaySubject}`;
        },
        direction: (match) => {
          const prefix = paragraph.text.slice(0, match.index ?? 0);
          return /\b(?:when|whenever|if)\b/.test(prefix) &&
            !prefix.includes(',')
            ? 'listens'
            : 'emits';
        },
        event: 'sacrificed',
        subject: (match) =>
          subjectFrom(sacrificeSubjectText(match, paragraph), card),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'typal-group-bonus',
      /\b(?:other )?((?!(?:creatures?|artifacts?|enchantments?|lands?|permanents?|tokens?|cards?|spells?)\b)[a-z][a-z-]+s) you control\b[^.\n]*\b(?:get|have|gain|cost|can|may)\b[^.\n]*/g,
      {
        label: (match) => {
          const type = singularCreatureType(match[1]);
          return `${type[0].toUpperCase()}${type.slice(1)} Typal Bonus`;
        },
        direction: 'listens',
        event: 'created',
        subject: (match) => ({
          kind: 'creature',
          creatureTypes: [singularCreatureType(match[1])],
        }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'typal-event-payoff',
      /\b(?:when|whenever) (?:a|another|one or more) ((?!(?:creature|artifact|enchantment|land|permanent|token|card|spell)\b)[a-z][a-z-]+)\b[^.\n]*\b(?:enters?|dies?|attacks?|deals? combat damage)\b[^.\n]*/g,
      {
        label: (match) =>
          `${match[1][0].toUpperCase()}${match[1].slice(1)} Typal Trigger`,
        direction: 'listens',
        event: 'created',
        subject: (match) => ({
          kind: 'creature',
          creatureTypes: [match[1]],
        }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'sacrifice-effect',
      /\b([^,.;\n]+?)\s+(?:is|are) sacrificed\b/g,
      {
        label: (match) => {
          const subject = subjectFrom(match[1], card).kind;
          return `${subject[0].toUpperCase()}${subject.slice(1)} Sacrifice Trigger`;
        },
        direction: 'listens',
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
      'typal-conditional-bonus',
      /\bif\b[^.\n]*\b(?:creature|permanent)\b[^.\n]*\bis (?:a|an) ([a-z][a-z-]+)\b[^.\n]*/g,
      {
        label: (match) =>
          `${match[1][0].toUpperCase()}${match[1].slice(1)} Typal Bonus`,
        direction: 'listens',
        event: 'created',
        subject: (match) => ({
          kind: 'creature',
          creatureTypes: [match[1]],
        }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'named-token-payoff',
      /\b(?:number of |other |each |all )?(clues?|treasures?|food|blood|maps?|gold|powerstones?|incubators?) you control\b/g,
      {
        label: (match) => `Uses ${match[1][0].toUpperCase()}${match[1].slice(1)}`,
        direction: 'listens',
        event: 'created',
        subject: (match) => subjectFrom(match[1]),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'improvise',
      /\b(?:has|have) improvise\b|\bimprovise\b/g,
      {
        label: 'Uses Artifacts for Improvise',
        direction: 'listens',
        event: 'created',
        subject: () => ({ kind: 'artifact' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'overload-target',
      /\btarget\b[^.\n]*\bartifact\b[^.\n]*(?=\. overload\b|\boverload\b)/g,
      {
        label: 'Overload Artifact Payoff',
        direction: 'listens',
        event: 'created',
        subject: () => ({ kind: 'artifact' }),
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
    if (/\b(?:put|dies?|graveyard)\b/.test(paragraph.text))
      addMatches(
        effects,
        card,
        paragraph,
        'recursion',
        /\breturn\b[^.\n]*\bto (?:its owner'?s|your) hand\b/g,
        {
          label: 'Returns from Graveyard to Hand',
          direction: 'emits',
          event: 'returned',
          subject: (match) => subjectFrom(match[0], card),
          sourceZone: 'graveyard',
          destinationZone: 'hand',
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
    addMatches(
      effects,
      card,
      paragraph,
      'untap-lands',
      /\buntap (?:all|up to [^.\n]+)?\s*lands?\b[^.\n]*/g,
      {
        label: 'Untaps Lands',
        direction: 'emits',
        event: 'untapped',
        subject: () => ({ kind: 'land', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'mana-production',
      /\badd (?:one|two|three|four|five|\{[^}]+\}) mana\b|\badd \{[wubrgc]\}/g,
      {
        label: 'Produces Mana',
        direction: 'grants',
        event: 'created',
        subject: () => ({ kind: 'permanent' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'cost-reduction',
      /\b(?:spells? you cast )?costs? [^.\n]* less to cast\b|\bwithout paying (?:its|their|the) mana cost\b|\brather than pay [^.\n]* mana cost\b/g,
      {
        label: 'Reduces Casting Costs',
        direction: 'grants',
        event: 'cast',
        subject: () => ({ kind: 'spell', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'generic-protection',
      /\b(?:target|another|enchanted|equipped )?creatures?(?: you control)?\b[^.\n]*(?:gains?|has|have)\b[^.\n]*\b(?:indestructible|hexproof|protection from)\b[^.\n]*/g,
      {
        label: 'Protects Creature',
        direction: 'grants',
        event: 'returned',
        subject: () => ({ kind: 'creature' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'regeneration-protection',
      /\bregenerate target\b[^.\n]*(?:creature|insect|rat|spider|squirrel|sliver|zombie|goblin)[^.\n]*/g,
      {
        label: 'Protects Creature',
        direction: 'grants',
        event: 'returned',
        subject: () => ({ kind: 'creature' }),
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
      'graveyard-control',
      /\bput\b[^.\n]*\b(?:target|a|up to one) cards? from (?:a|any|target player'?s|an opponent'?s) graveyard\b[^.\n]*\bon the bottom of (?:its owner'?s|their|that player'?s) library\b/g,
      {
        label: 'Moves Graveyard Card to Bottom of Library',
        direction: 'emits',
        event: 'restricted',
        subject: () => ({ kind: 'card', controller: 'any' }),
        sourceZone: 'graveyard',
        destinationZone: 'library',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'graveyard-control',
      /\bexile\b[^.\n]*\b(?:target|all|each|any|up to (?:one|two|three|four|five|\d+)) cards? from (?:a|any|target player'?s|an opponent'?s|each player'?s|all) graveyards?\b/g,
      {
        label: 'Exiles Cards from Graveyard',
        direction: 'emits',
        event: 'exiled',
        subject: () => ({ kind: 'card', controller: 'any' }),
        sourceZone: 'graveyard',
        destinationZone: 'exile',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'graveyard-control',
      /\bshuffle (?:target player'?s|an opponent'?s|each player'?s|all players'?) graveyard\b[^.\n]*\binto (?:their|that player'?s|its owner'?s) library\b/g,
      {
        label: 'Shuffles Graveyard into Library',
        direction: 'emits',
        event: 'restricted',
        subject: () => ({ kind: 'card', controller: 'target-player' }),
        sourceZone: 'graveyard',
        destinationZone: 'library',
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
    const counterLimitedSelfReturn = paragraph.text.match(
      /\bwhen this creature dies\b[^.]*\breturn it to the battlefield with one fewer ([a-z-]+) counter on it\b[^.]*/,
    );
    if (counterLimitedSelfReturn) {
      const counterName = counterLimitedSelfReturn[1];
      const initialCounterText = oracleTextWithoutReminderText(card).match(
        new RegExp(
          `\\benters with (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) ${counterName} counters? on it`,
        ),
      )?.[1];
      const initialCounters = initialCounterText
        ? (NUMBER_WORDS[initialCounterText] ?? Number(initialCounterText))
        : 1;
      const before = effects.length;
      addMatches(
        effects,
        card,
        paragraph,
        'counter-limited-self-return',
        /\breturn it to the battlefield with one fewer [a-z-]+ counter on it\b/g,
        {
          label: `Returns Itself to the Battlefield (${initialCounters} returns)`,
          direction: 'emits',
          event: 'returned',
          subject: () => ({ kind: 'creature', qualifiers: ['self'] }),
          sourceZone: 'graveyard',
          destinationZone: 'battlefield',
        },
      );
      effects.slice(before).forEach((effect) => {
        effect.quantity = {
          minimum: 0,
          expected: initialCounters,
          unbounded: false,
          scalesWithPlayers: false,
          expression: `${initialCounters} counter-limited returns`,
        };
        effect.timing = {
          ...effect.timing,
          repeatable: initialCounters > 1,
          multiUsePerTurn: false,
        };
        effect.conditions = [
          ...new Set([...effect.conditions, 'counter-limited']),
        ];
      });
    }
    if (
      /\benchant creature card in (?:a|the) graveyard\b/.test(
        oracleTextWithoutReminderText(card).toLowerCase(),
      )
    )
      addMatches(
        effects,
        card,
        paragraph,
        'aura-recursion',
        /\breturn enchanted creature card to the battlefield\b/g,
        {
          label: 'Returns Enchanted Creature from Graveyard to Battlefield',
          direction: 'emits',
          event: 'returned',
          subject: () => ({ kind: 'creature' }),
          sourceZone: 'graveyard',
          destinationZone: 'battlefield',
          inferred: true,
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
    addMatches(
      effects,
      card,
      paragraph,
      'life-gain-trigger',
      /\b(?:when|whenever|if)\b[^.\n]*\b(?:you|a player) gain(?:s)? life\b/g,
      {
        label: 'Life Gain Trigger',
        direction: 'listens',
        event: 'life-gained',
        subject: () => ({ kind: 'player', controller: 'you' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'life-loss-trigger',
      /\b(?:when|whenever|if)\b[^.\n]*\b(?:an |each |target |your )?opponents? loses? life\b/g,
      {
        label: 'Opponent Life-Loss Trigger',
        direction: 'listens',
        event: 'life-lost',
        subject: () => ({ kind: 'player', controller: 'opponent' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'investigate',
      /\binvestigates?\b/g,
      {
        label: 'Investigates',
        direction: 'emits',
        event: 'investigated',
        subject: () => ({ kind: 'token', tokenType: 'clue' }),
      },
    );
    addMatches(effects, card, paragraph, 'mill', /\bmills?\b[^.\n]*/g, {
      label: 'Mills Cards',
      direction: 'emits',
      event: 'milled',
      subject: () => ({ kind: 'card' }),
      sourceZone: 'library',
      destinationZone: 'graveyard',
    });
    addMatches(
      effects,
      card,
      paragraph,
      'surveil',
      /\bsurveils?\b[^.\n]*/g,
      {
        label: 'Surveils',
        direction: 'emits',
        event: 'surveilled',
        subject: () => ({ kind: 'card' }),
        sourceZone: 'library',
        destinationZone: 'graveyard',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'cast-event',
      /\b(?:cast|casts)\b[^.\n]*\b(?:spell|card|creature|artifact|instant|sorcery|enchantment)s?\b/g,
      {
        label: (match) =>
          isTriggeredCastMatch(paragraph, match)
            ? /\bcreature spell\b/.test(match[0]) ||
              usesChosenCreatureType(card, paragraph.text)
              ? 'Creature Cast Trigger'
              : 'Spell Cast Trigger'
            : 'Casts Spells',
        direction: (match) =>
          isTriggeredCastMatch(paragraph, match) ? 'listens' : 'emits',
        event: 'cast',
        subject: (match) =>
          /\bcreature spell\b/.test(match[0]) ||
          usesChosenCreatureType(card, paragraph.text)
            ? { kind: 'creature', controller: 'you' }
            : subjectFrom(match[0], card),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'spell-copy',
      /\bcopy (?:that|target|each|the) spells?\b[^.\n]*/g,
      {
        label: () =>
          /\bcreature spell\b/.test(paragraph.text) ||
          usesChosenCreatureType(card, paragraph.text)
            ? 'Copies Creature Spells'
            : 'Copies Spells',
        direction: 'creates',
        event: 'copied',
        subject: () =>
          /\bcreature spell\b/.test(paragraph.text) ||
          usesChosenCreatureType(card, paragraph.text)
            ? { kind: 'creature', controller: 'you' }
            : { kind: 'spell', controller: 'you' },
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-token-copy',
      /\bcreate [^.\n]*\bcreature tokens? (?:that(?:'s| is)|which is|as) (?:a )?copy of\b[^.\n]*|\bcreate [^.\n]*\btokens? (?:that(?:'s| is)|which is|as) (?:a )?copy of (?:target|another|that) creature\b[^.\n]*/g,
      {
        label: 'Creates Creature Token Copies',
        direction: 'creates',
        event: 'copied',
        subject: () => ({ kind: 'creature', controller: 'you', qualifiers: ['token', 'copy'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-enters-as-copy',
      /\b(?:you may have )?(?:this creature|it|[a-z][a-z ',!-]+) enter(?:s)? (?:the battlefield )?as a copy of\b[^.\n]*/g,
      {
        label: 'Enters as a Creature Copy',
        direction: 'transforms',
        event: 'copied',
        subject: () => ({ kind: 'creature', controller: 'you', qualifiers: ['copy'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'creature-becomes-copy',
      /\b(?:target|that|this|each|another|up to [^.\n]+)?\s*creatures? becomes? (?:a )?copy of\b[^.\n]*/g,
      {
        label: 'Turns a Creature into a Copy',
        direction: 'transforms',
        event: 'copied',
        subject: () => ({ kind: 'creature', controller: 'you', qualifiers: ['copy'] }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'etb-event',
      /\b(?:when|whenever|if)\b[^.\n]*\b(?:creatures?|artifacts?|enchantments?|lands?|permanents?|tokens?)\b[^.\n]*\benters?(?: the battlefield)?\b/g,
      {
        label: 'Enters-the-Battlefield Trigger',
        direction: 'listens',
        event: 'enters-battlefield',
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'attack-event',
      /\b(?:when|whenever|if)\b(?:[^.\n]*\b(?:creatures?|this creature|it)\b[^.\n]*\battacks?\b|[^.\n]*\byou attack\b)/g,
      {
        label: 'Attack Trigger',
        direction: 'listens',
        event: 'attacks',
        subject: () => ({ kind: 'creature' }),
      },
    );
    addMatches(
      effects,
      card,
      paragraph,
      'combat-damage-event',
      /\b(?:when|whenever|if)\b[^.\n]*\b(?:creatures?|this creature|it)\b[^.\n]*\bdeals? combat damage\b/g,
      {
        label: 'Combat Damage Trigger',
        direction: 'listens',
        event: 'combat-damage',
        subject: () => ({ kind: 'creature' }),
      },
    );
  }
  return effects;
}

export function extractCardEffects(card: EffectCard): CardEffect[] {
  const version = cardDataVersion(card);
  const cached = effectCache.get(version);
  if (cached) return cached;
  const effects = extractCardEffectsUncached(card);
  if (effectCache.size >= MAX_EFFECT_CACHE_ENTRIES)
    effectCache.delete(effectCache.keys().next().value!);
  effectCache.set(version, effects);
  return effects;
}

export function clearCardEffectCache() {
  effectCache.clear();
}
