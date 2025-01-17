/* eslint-disable functional/prefer-readonly-type */
import { describe, expect, test, vi } from "vitest";
import { Dispatch } from "../dispatch";
import { run, createProgram, Program } from "../program";
import { Cmd } from "../cmd";
import { mapEffect, perform, PromiseEffect } from "../effect";
import { Ok } from "../result";

const tests: ReadonlyArray<TestProgram<unknown, unknown>> = [
  createTest({
    description: "Initialize",
    initialState: 0,
    update: (_action, state) => [state],
    steps: [],
  }),

  createTest({
    description: "Increment once",
    initialState: 0,
    update: (_action, state) => [state + 1],
    steps: [{ action: "increment", result: 1 }],
  }),

  createTest({
    description: "Increment twice",
    initialState: 0,
    update: (_action, state) => [state + 1],
    steps: [
      { action: "increment", result: 1 },
      { action: "increment", result: 2 },
    ],
  }),

  createTest({
    description: "Increment thrice",
    initialState: 0,
    update: (_action, state) => [state + 1],
    steps: [
      { action: "increment", result: 1 },
      { action: "increment", result: 2 },
      { action: "increment", result: 3 },
    ],
  }),

  createTest({
    description: "No change",
    initialState: 0,
    update: (action, state) => {
      switch (action) {
        case "increment": {
          return [state + 1];
        }
        case "nothing": {
          return [state];
        }
        default: {
          return exhaust(action);
        }
      }
    },
    steps: [
      { action: "nothing", result: 0 },
      { action: "increment", result: 1 },
      { action: "nothing", result: 1 },
      { action: "increment", result: 2 },
    ] as const,
  }),

  createTest({
    description: "Increment and decrement",
    initialState: 0,
    update: (action, state) => {
      switch (action) {
        case "increment": {
          return [state + 1];
        }
        case "decrement": {
          return [state - 1];
        }
        default: {
          return exhaust(action);
        }
      }
    },
    steps: [
      { action: "increment", result: 1 },
      { action: "decrement", result: 0 },
    ] as const,
  }),

  createTest<
    number,
    | {
        readonly type: "issue-command";
        readonly value: number;
      }
    | {
        readonly type: "increment-by";
        readonly amount: number;
      }
  >({
    description: "Issue command",
    initialState: 0,
    update: (action, state) => {
      switch (action.type) {
        case "issue-command": {
          return [
            state,
            createTestEffectManagerCmd(action.value, (result) => ({ type: "increment-by", amount: result })),
          ];
        }
        case "increment-by": {
          return [state + action.amount];
        }
        default: {
          return exhaust(action);
        }
      }
    },
    steps: [{ action: { type: "issue-command", value: 123 }, result: 123 }] as const,
  }),

  createTest<
    {
      readonly outer: number;
      readonly inner: number;
    },
    | {
        type: "inner-update-action";
        innerAction: { type: "increment-inner" } | { type: "dummy" };
      }
    | {
        type: "increment-outer";
      }
  >({
    description: "Increment in fractal update",
    initialState: { outer: 0, inner: 0 },
    update: (action, state) => {
      switch (action.type) {
        case "inner-update-action": {
          const innerAction = action.innerAction;
          switch (innerAction.type) {
            case "increment-inner": {
              return [{ ...state, inner: state.inner + 1 }];
            }
            case "dummy": {
              return [state];
            }
            default: {
              return exhaust(innerAction);
            }
          }
        }
        case "increment-outer": {
          return [{ ...state, outer: state.outer + 1 }];
        }
        default: {
          return exhaust(action);
        }
      }
    },
    steps: [
      {
        action: { type: "inner-update-action", innerAction: { type: "increment-inner" } },
        result: { outer: 0, inner: 1 },
      },
      {
        action: { type: "increment-outer" },
        result: { outer: 1, inner: 1 },
      },
    ],
  }),

  createTest<
    number,
    | {
        type: "inner-update-action";
        innerAction:
          | {
              readonly type: "issue-command";
              readonly value: number;
            }
          | {
              readonly type: "increment-by";
              readonly amount: number;
            };
      }
    | {
        type: "dummy";
      }
  >({
    description: "Command in fractal update",
    initialState: 0,
    update: (action, state) => {
      switch (action.type) {
        case "inner-update-action": {
          const innerAction = action.innerAction;
          switch (innerAction.type) {
            case "issue-command": {
              return [
                state,
                mapEffect(
                  (innerAction) => ({ type: "inner-update-action", innerAction } as const),
                  createTestEffectManagerCmd(
                    innerAction.value,
                    (result) => ({ type: "increment-by", amount: result } as const)
                  )
                )!,
              ];
            }
            case "increment-by": {
              return [state + innerAction.amount];
            }
            default: {
              return exhaust(innerAction);
            }
          }
        }
        case "dummy": {
          return [state];
        }
        default: {
          return exhaust(action);
        }
      }
    },
    steps: [
      {
        action: { type: "inner-update-action", innerAction: { type: "issue-command", value: 234 } },
        result: 234,
      },
    ] as const,
  }),
];

function exhaust(notExhausted: never): never {
  throw new Error("Not exhausted: " + JSON.stringify(notExhausted));
}

type TestProgram<State, Action> = {
  readonly description: string;
  readonly initialState: State;
  readonly steps: ReadonlyArray<{
    action: Action;
    result: State;
  }>;
  readonly program: Program<
    void,
    State,
    Action,
    {
      readonly state: State;
      readonly dispatch: Dispatch<Action>;
    }
  >;
};

function createTest<State, Action>(test: {
  readonly description: string;
  readonly initialState: State;
  readonly initialCmd?: Cmd<Action>;
  readonly update: (action: Action, state: State) => [State, Cmd<Action>?];
  readonly steps: ReadonlyArray<{
    readonly action: Action;
    readonly result: State;
  }>;
}): TestProgram<State, Action> {
  return {
    description: test.description,
    initialState: test.initialState,
    steps: test.steps,
    program: createProgram({
      init: () => [test.initialState, test.initialCmd],
      update: test.update,
      view: (props) => props,
    }),
  };
}

function createTestEffectManagerCmd<Action, Value>(
  value: Value,
  onResult: (result: Value) => Action
): PromiseEffect<Action, undefined, Value> {
  return perform<Action, Value>(onResult, new Promise((resolve) => setTimeout(() => resolve(Ok(value)), 10)));
}

describe("Run programs", async () => {
  for (const testProgram of tests) {
    test(testProgram.description, async () => {
      type ViewProps = Parameters<typeof testProgram.program.view>[0];

      const render = vi.fn<(props: ViewProps) => void>();

      // Create a promise that resolves when the render function is called. When the state is
      // unchanged, typescript-tea does not re-render, so resolve with the old state.
      // `dispatch` and `state` are saved outside the render function so the dispatch
      // can be called by the test steps, and state can be reused on timeouts.
      let dispatch: Dispatch<unknown> = undefined!;
      let state = testProgram.initialState;
      async function createRenderPromise(): Promise<unknown> {
        return new Promise<unknown>((resolve) => {
          render.mockImplementationOnce((args) => {
            ({ dispatch, state } = args);
            resolve(state);
          });
          setTimeout(() => {
            render.mockReset();
            resolve(state);
          }, 100);
        });
      }

      // The initial render is done by `run`, so set up the render promise first, and await after `run`.
      {
        const promise = createRenderPromise();
        run(testProgram.program, undefined, render);
        expect(await promise).toEqual(testProgram.initialState);
      }

      // Set up the render promise for each step, dispatch the action, await the result and verify it, in that order.
      for (const step of testProgram.steps) {
        const promise = createRenderPromise();
        // Do the dispatch async just because we can.
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        setTimeout(() => dispatch(step.action), 0);
        const state = await promise;
        expect(state).toEqual(step.result);
      }
    });
  }
});
