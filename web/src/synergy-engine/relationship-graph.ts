import type { CardEffect, EngineSignals, NamedTokenType } from './types.ts';

const ARTIFACT_TOKEN_TYPES = new Set<NamedTokenType>([
  'blood',
  'clue',
  'food',
  'gold',
  'incubator',
  'map',
  'powerstone',
  'treasure',
]);

// Creating one of these tokens indirectly supports its sacrifice engine
// because the token's game rules include a built-in sacrifice action.
const INTRINSIC_SACRIFICE_TOKEN_TYPES = new Set<NamedTokenType>([
  'blood',
  'clue',
  'food',
  'gold',
  'map',
  'treasure',
]);

const EMITTING_DIRECTIONS = new Set([
  'emits',
  'creates',
  'transforms',
]);

function subjectNames(effect: CardEffect) {
  const names = new Set<string>();
  if (effect.subject.tokenType) names.add(effect.subject.tokenType);
  names.add(effect.subject.kind);
  if (
    effect.subject.kind === 'token' ||
    effect.subject.qualifiers?.includes('token') ||
    effect.subject.tokenType
  )
    names.add('token');
  if (
    effect.subject.kind === 'creature' ||
    effect.subject.qualifiers?.includes('creature')
  )
    names.add('creature');
  if (
    effect.subject.kind === 'artifact' ||
    effect.subject.qualifiers?.includes('artifact') ||
    (effect.subject.tokenType && ARTIFACT_TOKEN_TYPES.has(effect.subject.tokenType))
  )
    names.add('artifact');
  if (
    !['card', 'player', 'spell'].includes(effect.subject.kind) &&
    effect.subject.kind !== 'token'
  )
    names.add('permanent');
  return names;
}

function directSignals(effect: CardEffect) {
  const signals = new Set<string>();
  effect.subject.creatureTypes?.forEach((type) =>
    signals.add(`type:${type}-present`),
  );
  const detectorId = effect.evidence[0]?.detectorId ?? '';
  const isTypalMetadata = detectorId.startsWith('typal-');
  if (effect.event === 'investigated') {
    signals.add('investigated');
    return signals;
  }
  if (!isTypalMetadata)
    subjectNames(effect).forEach((subject) =>
      signals.add(`${subject}-${effect.event}`),
    );
  if (
    detectorId === 'spell-copy' &&
    (effect.subject.kind === 'creature' ||
      /\bcreature spell\b/.test(effect.evidence[0]?.paragraphText ?? ''))
  ) {
    signals.add('spell-copied');
    signals.add('creature-created');
    signals.add('permanent-created');
    signals.add('token-created');
  }
  if (detectorId === 'creature-token-copy') {
    signals.add('creature-created');
    signals.add('permanent-created');
    signals.add('token-created');
  }
  if (['counter-placement', 'creature-anthem'].includes(detectorId))
    signals.add('creature-power-increased');
  if (detectorId === 'creature-power-threshold')
    signals.add('creature-count-increased');
  if (
    effect.sourceZone === 'graveyard' &&
    effect.destinationZone === 'battlefield'
  )
    subjectNames(effect).forEach((subject) =>
      signals.add(`${subject}-enters-battlefield`),
    );
  if (
    effect.sourceZone === 'graveyard' &&
    effect.subject.qualifiers?.includes('self')
  )
    signals.add('self-recurring-creature');
  if (effect.event === 'life-gained') signals.add('life-gained');
  if (effect.event === 'life-lost') signals.add('opponent-life-lost');
  return signals;
}

function listeningSignals(effect: CardEffect) {
  if (effect.subject.tokenType)
    return new Set([`${effect.subject.tokenType}-${effect.event}`]);
  const direct = directSignals(effect);
  if (
    ['sacrificed', 'dies', 'exiled', 'leaves-battlefield'].includes(
      effect.event,
    )
  )
    return direct;
  return expandEmittedSignals(direct);
}

function impliedSignals(signal: string) {
  const implied = new Set<string>();
  if (signal === 'investigated') {
    implied.add('clue-created');
    implied.add('token-created');
    implied.add('artifact-created');
  }
  if (signal === 'creature-sacrificed') {
    implied.add('creature-dies');
    implied.add('creature-leaves-battlefield');
    implied.add('permanent-leaves-battlefield');
  }
  if (signal === 'creature-dies') {
    implied.add('creature-leaves-battlefield');
    implied.add('permanent-leaves-battlefield');
  }
  if (signal === 'token-sacrificed') {
    implied.add('token-leaves-battlefield');
    implied.add('permanent-leaves-battlefield');
  }
  if (signal.endsWith('-sacrificed')) {
    const subject = signal.slice(0, -'-sacrificed'.length);
    if (ARTIFACT_TOKEN_TYPES.has(subject as NamedTokenType)) {
      implied.add('artifact-sacrificed');
      implied.add('token-sacrificed');
      implied.add(`${subject}-leaves-battlefield`);
      implied.add('artifact-leaves-battlefield');
      implied.add('token-leaves-battlefield');
    }
  }
  if (signal.endsWith('-exiled')) {
    const subject = signal.replace(/-exiled$/, '');
    implied.add(`${subject}-leaves-battlefield`);
    if (!['card', 'player', 'spell'].includes(subject))
      implied.add('permanent-leaves-battlefield');
  }
  if (signal === 'card-discarded' || signal === 'card-milled')
    implied.add('graveyard-stocked');
  if (signal === 'card-surveilled') implied.add('graveyard-stocked');
  if (signal === 'clue-created' || signal === 'food-created' || signal === 'treasure-created') {
    implied.add('artifact-created');
    implied.add('token-created');
  }
  if (signal.endsWith('-created')) {
    const subject = signal.slice(0, -'-created'.length);
    implied.add(`${subject}-enters-battlefield`);
    if (!['card', 'player', 'spell'].includes(subject))
      implied.add('permanent-enters-battlefield');
  }
  if (signal === 'creature-created') implied.add('creature-count-increased');
  if (signal === 'creature-created') implied.add('creature-power-increased');
  if (signal === 'token-created') implied.add('token-count-increased');
  if (signal === 'artifact-created') implied.add('artifact-count-increased');
  return implied;
}

function expandEmittedSignals(seed: Set<string>) {
  const expanded = new Set(seed);
  const queue = [...seed];
  while (queue.length) {
    const signal = queue.shift()!;
    impliedSignals(signal).forEach((implied) => {
      if (expanded.has(implied)) return;
      expanded.add(implied);
      queue.push(implied);
    });
  }
  return expanded;
}

export function buildEngineSignals(effects: CardEffect[]): EngineSignals {
  const emittedSeeds = new Set<string>();
  const listens = new Set<string>();
  const eligible = new Set<string>();
  const support = new Set<string>();
  effects.forEach((effect) => {
    const signals = directSignals(effect);
    if (
      (effect.sourceZone === 'graveyard' &&
        effect.evidence[0]?.detectorId !== 'graveyard-control') ||
      effect.evidence[0]?.detectorId === 'graveyard-count-threshold'
    )
      listens.add('graveyard-stocked');
    const detectorId = effect.evidence[0]?.detectorId ?? '';
    if (detectorId === 'artifact-animation') {
      emittedSeeds.add('artifact-animation-enabled');
      emittedSeeds.add('creature-count-increased');
      listens.add('animatable-artifact');
    }
    if (detectorId === 'clue-animation') {
      emittedSeeds.add('clue-animation-enabled');
      emittedSeeds.add('creature-count-increased');
      listens.add('animatable-clue');
    }
    if (
      ['unblockable-grant', 'combat-damage-amplifier', 'extra-combat'].includes(
        detectorId,
      ) ||
      (detectorId === 'keyword-grant' &&
        /\b(?:double strike|fear|flying|horsemanship|intimidate|menace|shadow|skulk|trample)\b/.test(
          effect.evidence[0]?.matchedText ?? '',
        ))
    )
      emittedSeeds.add('combat-damage-enabled');
    if (detectorId === 'spell-copy') {
      const spellCopyText = effect.evidence[0]?.paragraphText ?? '';
      const creatureSpecific =
        effect.subject.kind === 'creature' ||
        /\bcreature spell\b/.test(spellCopyText);
      emittedSeeds.add(
        creatureSpecific
          ? 'creature-spell-copy-enabled'
          : 'spell-copy-enabled',
      );
      if (
        !creatureSpecific &&
        /\bcopy (?:that|target|each|the) spells?\b/.test(
          effect.evidence[0]?.matchedText ?? '',
        ) &&
        !/\b(?:instant|sorcery|noncreature) spells?\b/.test(spellCopyText)
      )
        emittedSeeds.add('creature-spell-copy-compatible');
      if (creatureSpecific) {
        listens.add(
          /\bnonlegendary creature spell\b/.test(
            spellCopyText,
          )
            ? 'copyable-nonlegendary-creature-spell-cast'
            : 'copyable-creature-spell-cast',
        );
      } else listens.add('copyable-spell-cast');
    }
    if (
      ['creature-token-copy', 'creature-enters-as-copy', 'creature-becomes-copy'].includes(
        detectorId,
      )
    )
      listens.add('copyable-creature');
    if (effect.direction === 'listens')
      listeningSignals(effect).forEach((signal) => listens.add(signal));
    if (EMITTING_DIRECTIONS.has(effect.direction)) {
      const effectEmits = expandEmittedSignals(signals);
      if (
        effectEmits.has('artifact-created') &&
        effectEmits.has('token-created') &&
        !effectEmits.has('creature-created')
      )
        support.add('artifact-animation-supported');
      signals.forEach((signal) => {
        emittedSeeds.add(signal);
        if (
          effect.conditions.includes('overload') &&
          effect.conditions.includes('target')
        )
          emittedSeeds.add(`multi:${signal}`);
      });
    }
  });
  const emits = expandEmittedSignals(emittedSeeds);
  INTRINSIC_SACRIFICE_TOKEN_TYPES.forEach((type) => {
    if (emits.has(`${type}-created`))
      support.add(`${type}-sacrifice-supported`);
  });
  if (emits.has('clue-created'))
    support.add('clue-animation-supported');
  return { emits, listens, eligible, support };
}

export function signalPathsBetween(
  producer: EngineSignals,
  consumer: EngineSignals,
) {
  return [...producer.emits].filter((signal) => consumer.listens.has(signal));
}
