import { expect, test } from "vitest";
import { Effect, InternalHome, MappedEffect, gatherEffects, EffectMapper, mapEffect, perform } from "../effect";

const effect = perform(
  async () => undefined,
  () => "action" as const
);

test("map effect", () => {
  const effect: Effect<unknown> = { home: "manager1", type: "cmd1" };
  const mappedEffect = mapEffect((innerAction) => ({ type: "inner-action", innerAction } as const), effect)!;
  const mappedAction = mappedEffect.actionMapper("action");
  expect(mappedEffect).toEqual({
    actionMapper: expect.any(Function),
    home: "__internal",
    original: {
      home: "manager1",
      type: "cmd1",
    },
    type: "Mapped",
  });
  expect(mappedAction).toEqual({
    innerAction: "action",
    type: "inner-action",
  });
});

test("gather effects - single command", () => {
  const manager1: EffectMapper = {
    home: "manager1",
    mapCmd: (_, b) => b,
    mapSub: (_, b) => b,
  };
  const gatheredEffects = gatherEffects(() => manager1, effect, undefined);
  expect(gatheredEffects).toEqual({
    cmds: {
      PromiseEffect: [
        {
          home: "PromiseEffect",
          makeAction: expect.any(Function),
          makePromise: expect.any(Function),
          type: "",
        },
      ],
    },
    subs: {},
  });
});

test("gather effects - mapped command", () => {
  type ChildAction = { type: "ChildAction"; result: string };
  type ParentAction = { type: "ParentAction"; action: ChildAction };
  type MyCmd<A> = { home: "MyManager"; type: "MyCmd"; gotResult: (result: string) => A };
  const myCmdFromChild: MyCmd<ChildAction> = {
    home: "MyManager",
    type: "MyCmd",
    gotResult: (result) => ({ type: "ChildAction", result }),
  };
  const actionMapper = (action: ChildAction): ParentAction => ({ type: "ParentAction", action });
  const myCmdFromParent: MappedEffect<ChildAction, ParentAction> = {
    home: InternalHome,
    type: "Mapped",
    original: myCmdFromChild,
    actionMapper,
  };
  const mapper: EffectMapper<unknown, unknown, "MyManager"> = {
    home: "MyManager",
    mapCmd: (
      actionMapper: (childAction: ChildAction) => ParentAction,
      cmd: MyCmd<ChildAction>
    ): MyCmd<ParentAction> => {
      return { ...cmd, gotResult: (result) => actionMapper(cmd.gotResult(result)) };
    },
    mapSub: (_actionMapper, effect) => effect,
  };
  const gatheredEffects = gatherEffects(() => mapper, myCmdFromParent, undefined);
  expect(gatheredEffects).toEqual({
    cmds: { MyManager: [{ home: "MyManager", type: "MyCmd", gotResult: expect.any(Function) }] },
    subs: {},
  });
  const resultOfGotResult = (gatheredEffects.cmds["MyManager"][0] as MyCmd<unknown>).gotResult("Hello");
  expect(resultOfGotResult).toEqual({ type: "ParentAction", action: { type: "ChildAction", result: "Hello" } });
});
