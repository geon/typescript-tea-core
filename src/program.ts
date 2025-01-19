import { Cmd } from "./cmd";
import { Sub } from "./sub";
import { Dispatch } from "./dispatch";
import { EffectManager, createGetEffectManager } from "./effect-manager";
import { gatherEffects } from "./effect";

/**
 * A program represents the root of an application.
 * @category Program
 */
export type Program<Init, State, Action, View> = {
  readonly init: (init: Init) => readonly [State, Cmd<Action>?];
  readonly update: (action: Action, state: State) => readonly [State, Cmd<Action>?];
  readonly view: (props: { readonly state: State; readonly dispatch: Dispatch<Action> }) => View;
  readonly subscriptions?: (state: State) => Sub<Action> | undefined;
};

// The ManagerAction type only exists to ensure proper typing internally.
const managerActionTag = Symbol("managerActionTag");
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type ManagerAction = { readonly [managerActionTag]: void };

/**
 * A function to create a program without manually specifying the generic
 * type parameters. It only returns the argument, but helps infer typing.
 * @param program This is the program to create.
 * @category Program
 */
export function createProgram<Init, State, Action, View>(
  program: Program<Init, State, Action, View>
): Program<Init, State, Action, View> {
  return program;
}

/**
 * This is the runtime that provides the main loop to run a Program.
 * Given a Program and an array of EffectManagers it will start the program
 * and progress the state each time the program calls update().
 * You can use the returned function to terminate the program.
 * @param program This is the program to run.
 * @typeParam Init This is the type of the initial value passed to the program's init function.
 * @category Program
 */
export function run<Init, State, Action, View>(
  program: Program<Init, State, Action, View>,
  init: Init,
  render: (view: View) => void,
  effectManagers: ReadonlyArray<EffectManager<string, Action, unknown>> = []
): () => void {
  const getEffectManager = createGetEffectManager(effectManagers);
  const { update, view, subscriptions } = program;
  let state: State;
  const managerStates: { [home: string]: unknown } = {};
  const managerTeardowns: Array<() => void> = [];
  let isRunning = false;
  let isProcessing = false;
  const actionQueue: Array<{
    dispatch: Dispatch<Action | ManagerAction>;
    action: Action | ManagerAction;
  }> = [];
  // Init to a symbol that the appliction has no reference to so intial change always runs
  let prevState: State | symbol = Symbol("initial prevState");

  function processActions(): void {
    if (!isRunning || isProcessing) {
      return;
    }
    isProcessing = true;
    while (actionQueue.length > 0) {
      const queuedAction = actionQueue.shift()!;
      queuedAction.dispatch(queuedAction.action);
    }
    isProcessing = false;
  }

  const dispatchManager =
    (home: string) =>
    (action: ManagerAction): void => {
      if (isRunning) {
        const manager = getEffectManager(home);
        const enqueueSelfAction = enqueueManagerAction(home);
        managerStates[home] = manager.onSelfAction(
          enqueueProgramAction,
          enqueueSelfAction,
          action,
          managerStates[home]
        );
      }
    };

  function dispatchProgram(action: Action): void {
    if (isRunning) {
      change(update(action, state));
    }
  }

  const enqueueManagerAction =
    (home: string) =>
    (action: ManagerAction): void => {
      enqueueRaw(dispatchManager(home), action);
    };

  const enqueueProgramAction = (action: Action): void => {
    enqueueRaw(dispatchProgram, action);
  };

  function enqueueRaw(dispatch: Dispatch<Action | ManagerAction>, action: Action | ManagerAction): void {
    if (isRunning) {
      actionQueue.push({ dispatch, action });
      processActions();
    }
  }

  function change(change: readonly [State, Cmd<Action>?]): void {
    state = change[0];
    const cmd = change[1];
    const sub = subscriptions && subscriptions(state);
    const gatheredEffects = gatherEffects(getEffectManager, cmd, sub);
    // Always call all effect managers so they get updated subscriptions even if there are no subscriptions anymore
    for (const em of effectManagers) {
      const home = em.home;
      const { cmds, subs } = gatheredEffects[home] ?? { cmds: [], subs: [] };
      const manager = getEffectManager(home);
      managerStates[home] = manager.onEffects(
        enqueueProgramAction,
        enqueueManagerAction(home),
        cmds,
        subs,
        managerStates[home]
      );
    }
    if (state !== prevState) {
      prevState = state;
      render(view({ state, dispatch: enqueueProgramAction }));
    }
  }

  function setup(): void {
    for (const em of effectManagers) {
      managerTeardowns.push(em.setup(enqueueProgramAction, enqueueManagerAction(em.home)));
    }
  }

  function teardown(): void {
    for (const mtd of managerTeardowns) {
      mtd();
    }
  }

  setup();

  isRunning = true;

  change(program.init(init));

  processActions();

  return function end(): void {
    if (isRunning) {
      isRunning = false;
      teardown();
    }
  };
}
