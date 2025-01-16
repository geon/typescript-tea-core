/** @ignore */ /** */

import { groupBy } from "./group-by";
import { Result } from "./result";

/**
 * Commands and Subscriptions are both effects and they can both be batched and mapped.
 * This module handles the batching and mapping of both commands and subscriptions
 * in a generic way.
 * Each effect specifies a "home" that it belongs to. The effects can then be
 * gathered by "home" and passed to the Effect Manager for that "home".
 * This is an internal module which is not intended for outside usage.
 * Please use only the Cmd and Sub modules externally.
 */
export type Effect<A> =
  | BatchedEffect<A>
  | MappedEffect<A, unknown>
  | LeafEffect<A>
  | PromiseEffect<A, unknown, unknown>;

export const InternalHome = "__internal";
export type InternalHome = typeof InternalHome;

export type LeafEffect<_A, Home = string> = {
  readonly home: Home;
  readonly type: string;
};

export type PromiseEffect<A, TError, TValue> = {
  readonly home: "PromiseEffect";
  readonly type: string; // Not really used. Just for compatibility.
  readonly promise: Promise<Result<TError, TValue>>;
  readonly gotResult: (result: Result<TError, TValue>) => A;
};

export type BatchedEffect<A> = {
  readonly home: InternalHome;
  readonly type: "Batched";
  readonly list: ReadonlyArray<Effect<A>>;
};

export type MappedEffect<A1, A2> = {
  readonly home: InternalHome;
  readonly type: "Mapped";
  readonly actionMapper: (a1: A1) => A2;
  readonly original: BatchedEffect<A1> | MappedEffect<A1, A2> | LeafEffect<A1>;
};

// Perform a promise that can never fail
export function perform<A, TValue>(
  resolved: (value: TValue) => A,
  promise: Promise<Result<never, TValue>>
): PromiseEffect<A, never, TValue> {
  return {
    home: "PromiseEffect",
    type: "",
    promise,
    gotResult: (result: Result<never, TValue>) => {
      if (result.type === "Err") {
        throw new Error(
          `A promise effect with error of type never has failed. This should never happen. The result was: ${JSON.stringify(
            result
          )}`
        );
      }
      return resolved(result.value);
    },
  };
}

// Attempt a promise that can fail
export function attempt<A, TError, TValue>(
  gotResult: (result: Result<TError, TValue>) => A,
  promise: Promise<Result<TError, TValue>>
): PromiseEffect<A, TError, TValue> {
  return {
    home: "PromiseEffect",
    type: "",
    promise,
    gotResult,
  };
}

export function batchEffects<A>(effects: ReadonlyArray<Effect<A> | undefined>): BatchedEffect<A> {
  return {
    home: InternalHome,
    type: "Batched",
    list: effects.filter((c) => c !== undefined) as ReadonlyArray<Effect<A>>,
  };
}

export function mapEffect<A1, A2>(
  actionMapper: (a1: A1) => A2,
  c: BatchedEffect<A1> | MappedEffect<A1, A2> | LeafEffect<A1> | undefined
): MappedEffect<A1, A2> | undefined {
  return c === undefined ? undefined : { home: InternalHome, type: "Mapped", actionMapper, original: c };
}

export type LeafEffectMapper<A1 = unknown, A2 = unknown> = (
  actionMapper: (a1: A1) => A2,
  effect: Effect<A1>
) => LeafEffect<A2>;

export type GatheredEffects<A> = Readonly<
  Record<
    "cmds" | "subs",
    {
      // This type is mutable for efficency
      // eslint-disable-next-line functional/prefer-readonly-type
      [home: string]: Array<LeafEffect<A>>;
    }
  >
>;

export type EffectMapper<A1 = unknown, A2 = unknown, THome = unknown> = {
  readonly home: THome;
  readonly mapCmd: LeafEffectMapper<A1, A2>;
  readonly mapSub: LeafEffectMapper<A1, A2>;
};

export function gatherEffects<A>(
  getEffectMapper: (home: string) => EffectMapper,
  cmd: Effect<unknown> | undefined,
  sub: Effect<unknown> | undefined
): GatheredEffects<A> {
  const gatheredEffectsCmds = cmd ? gatherEffectsInternal(getEffectMapper, true, cmd) : [];
  const gatheredEffectsSubs = sub ? gatherEffectsInternal(getEffectMapper, false, sub) : [];
  return {
    cmds: groupBy(gatheredEffectsCmds, (x) => x.home),
    subs: groupBy(gatheredEffectsSubs, (x) => x.home),
  } as unknown as GatheredEffects<A>;
}

function gatherEffectsInternal<A>(
  getEffectMapper: (home: string) => EffectMapper,
  isCmd: boolean,
  effect: Effect<unknown>,
  actionMapper: ((a1: unknown) => unknown) | undefined = undefined
): ReadonlyArray<LeafEffect<A>> {
  if (effect.home === InternalHome) {
    const internalEffect = effect as BatchedEffect<unknown> | MappedEffect<unknown, unknown>;
    switch (internalEffect.type) {
      case "Batched": {
        return internalEffect.list.flatMap((c) => gatherEffectsInternal(getEffectMapper, isCmd, c, actionMapper));
      }
      case "Mapped":
        return gatherEffectsInternal(
          getEffectMapper,
          isCmd,
          internalEffect.original,
          actionMapper ? (a) => actionMapper(internalEffect.actionMapper(a)) : internalEffect.actionMapper
        );
      default: {
        const exhaustive: never = internalEffect;
        throw new Error(`Invalid result type ${exhaustive}`);
      }
    }
  } else {
    const manager = getEffectMapper(effect.home);
    const mapper = isCmd ? manager.mapCmd : manager.mapSub;
    return [actionMapper ? mapper(actionMapper, effect) : effect];
  }
}
