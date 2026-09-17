import type { CardEffect, EngineSignals, NamedTokenType } from './types';

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
  if (effect.event === 'investigated') {
    signals.add('investigated');
    return signals;
  }
  subjectNames(effect).forEach((subject) =>
    signals.add(`${subject}-${effect.event}`),
  );
  if (effect.event === 'life-gained') signals.add('life-gained');
  if (effect.event === 'life-lost') signals.add('opponent-life-lost');
  return signals;
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
  if (signal.endsWith('-exiled') || signal.endsWith('-returned')) {
    const subject = signal.replace(/-(?:exiled|returned)$/, '');
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
  effects.forEach((effect) => {
    const signals = directSignals(effect);
    if (effect.sourceZone === 'graveyard') listens.add('graveyard-stocked');
    if (effect.direction === 'listens')
      signals.forEach((signal) => listens.add(signal));
    if (EMITTING_DIRECTIONS.has(effect.direction)) {
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
  return { emits: expandEmittedSignals(emittedSeeds), listens };
}

export function signalPathsBetween(
  producer: EngineSignals,
  consumer: EngineSignals,
) {
  return [...producer.emits].filter((signal) => consumer.listens.has(signal));
}
