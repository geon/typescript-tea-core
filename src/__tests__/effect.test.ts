import { expect, test } from "vitest";
import { batchEffects, gatherEffects, mapEffect, MappedEffect, perform, PromiseEffect } from "../effect";
import { Ok, Result } from "../result";

const effect = perform(() => "action" as const, Promise.resolve(Ok(undefined)));

test("map effect", () => {
  const mappedEffect = mapEffect((innerAction) => ({ type: "inner-action", innerAction } as const), effect)!;
  const mappedAction = mappedEffect.actionMapper("action");
  expect(mappedEffect).toEqual({
    actionMapper: expect.any(Function),
    original: {
      gotResult: expect.any(Function),
      promise: expect.any(Promise),
      type: "Promise",
    },
    type: "Mapped",
  });
  expect(mappedAction).toEqual({
    innerAction: "action",
    type: "inner-action",
  });
});

test("gather effects - single command", () => {
  const gatheredEffects = gatherEffects(effect, undefined);
  expect(gatheredEffects).toEqual({
    cmds: [
      {
        gotResult: expect.any(Function),
        promise: expect.any(Promise),
        type: "Promise",
      },
    ],
    subs: [],
  });
});

// test("gather effects - mapped command", () => {
//   type ChildAction = { type: "ChildAction"; result: string };
//   type ParentAction = { type: "ParentAction"; action: ChildAction };
//   type MyCmd<A> = { home: "MyManager"; type: "MyCmd"; gotResult: (result: string) => A };
//   const myCmdFromChild: MyCmd<ChildAction> = {
//     home: "MyManager",
//     type: "MyCmd",
//     gotResult: (result) => ({ type: "ChildAction", result }),
//   };
//   const actionMapper = (action: ChildAction): ParentAction => ({ type: "ParentAction", action });
//   const myCmdFromParent: MappedEffect<ChildAction, ParentAction> = {
//     home: InternalHome,
//     type: "Mapped",
//     original: myCmdFromChild,
//     actionMapper,
//   };
//   const gatheredEffects = gatherEffects(myCmdFromParent, undefined);
//   expect(gatheredEffects).toEqual({
//     cmds: { MyManager: [{ home: "MyManager", type: "MyCmd", gotResult: expect.any(Function) }] },
//     subs: {},
//   });
//   const resultOfGotResult = (gatheredEffects.cmds["MyManager"][0] as MyCmd<unknown>).gotResult("Hello");
//   expect(resultOfGotResult).toEqual({ type: "ParentAction", action: { type: "ChildAction", result: "Hello" } });
// });

test("gather effects - mapped command", () => {
  type ChildAction = { type: "ChildAction"; result: Result<undefined, string> };
  type ParentAction = { type: "ParentAction"; action: ChildAction };
  const myCmdFromChild: PromiseEffect<ChildAction, undefined, string> = {
    type: "Promise",
    promise: Promise.resolve(Ok("Hello")),
    gotResult: (result) => ({ type: "ChildAction", result }),
  };
  const actionMapper = (action: ChildAction): ParentAction => ({ type: "ParentAction", action });
  const myCmdFromParent: MappedEffect<ChildAction, ParentAction> = {
    type: "Mapped",
    original: myCmdFromChild,
    actionMapper,
  };
  const gatheredEffects = gatherEffects(myCmdFromParent, undefined);
  expect(gatheredEffects).toEqual({
    cmds: [
      {
        gotResult: expect.any(Function),
        promise: expect.any(Promise),
        type: "Promise",
      },
    ],
    subs: [],
  });
  const resultOfGotResult = gatheredEffects.cmds[0].gotResult(Ok("Hello"));
  expect(resultOfGotResult).toEqual({
    type: "ParentAction",
    action: {
      type: "ChildAction",
      result: {
        type: "Ok",
        value: "Hello",
      },
    },
  });
});

test("gather effects - batched commands", () => {
  const batchedCommands = batchEffects<"action">([effect, effect]);
  const gatheredEffects = gatherEffects(batchedCommands, undefined);
  expect(gatheredEffects).toEqual({
    cmds: [effect, effect],
    subs: [],
  });
});
