import { Result } from "./result";

/** @ignore */ /** */

/**
 * Commands and Subscriptions are both effects and they can both be batched and mapped.
 * This module handles the batching and mapping of both commands and subscriptions
 * in a generic way.
 * Each effect specifies a "home" that it belongs to. The effects can then be
 * gathered by "home" and passed to the Effect Manager for that "home".
 * This is an internal module which is not intended for outside usage.
 * Please use only the Cmd and Sub modules externally.
 */
export type Effect<A> = BatchedEffect<A> | MappedEffect<unknown, A> | PromiseEffect<A, unknown, unknown>;

export type PromiseEffect<A, TError, TValue> = {
  readonly type: "Promise";
  readonly promise: Promise<Result<TError, TValue>>;
  readonly gotResult: (result: Result<TError, TValue>) => A;
};

export type BatchedEffect<A> = {
  readonly type: "Batched";
  readonly list: ReadonlyArray<Effect<A>>;
};

export type MappedEffect<A1, A2> = {
  readonly type: "Mapped";
  readonly actionMapper: (a1: A1) => A2;
  readonly original: BatchedEffect<A1> | MappedEffect<unknown, A1> | PromiseEffect<A1, unknown, unknown>;
};

// Perform a promise that can never fail
export function perform<A, TValue>(
  resolved: (value: TValue) => A,
  promise: Promise<Result<never, TValue>>
): PromiseEffect<A, never, TValue> {
  return {
    type: "Promise",
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
    type: "Promise",
    promise,
    gotResult,
  };
}

export function batchEffects<A>(effects: ReadonlyArray<Effect<A> | undefined>): BatchedEffect<A> {
  return {
    type: "Batched",
    list: effects.filter((c) => c !== undefined) as ReadonlyArray<Effect<A>>,
  };
}

export function mapEffect<A1, A2>(
  actionMapper: (a1: A1) => A2,
  c: BatchedEffect<A1> | MappedEffect<unknown, A1> | PromiseEffect<A1, unknown, unknown> | undefined
): MappedEffect<A1, A2> | undefined {
  return c === undefined ? undefined : { type: "Mapped", actionMapper, original: c };
}

export type GatheredEffects<A> = Readonly<Record<"cmds" | "subs", ReadonlyArray<PromiseEffect<A, unknown, unknown>>>>;

export function gatherEffects<A>(
  cmd: Effect<unknown> | undefined,
  sub: Effect<unknown> | undefined
): GatheredEffects<A> {
  return {
    cmds: cmd ? gatherEffectsInternal(cmd, undefined) : [],
    subs: sub ? gatherEffectsInternal(sub, undefined) : [],
  };
}

function gatherEffectsInternal<A>(
  effect: Effect<unknown>,
  actionMapper: ((a1: unknown) => unknown) | undefined
): ReadonlyArray<PromiseEffect<A, unknown, unknown>> {
  switch (effect.type) {
    case "Batched":
      return effect.list.flatMap((c) => gatherEffectsInternal(c, actionMapper));

    case "Mapped": {
      return gatherEffectsInternal(
        effect.original,
        actionMapper ? (a) => actionMapper(effect.actionMapper(a)) : effect.actionMapper
      );
    }

    case "Promise": {
      return [
        (actionMapper ? { ...effect, gotResult: (a) => actionMapper(effect.gotResult(a)) } : effect) as PromiseEffect<
          A,
          unknown,
          unknown
        >,
      ];
    }

    default: {
      const exhaustive: never = effect;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      throw new Error(`Invalid result type ${(exhaustive as unknown as any).type}`);
    }
  }
}
