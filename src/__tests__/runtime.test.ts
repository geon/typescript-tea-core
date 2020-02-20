import * as Runtime from "../runtime";
import { Program } from "../program";

beforeAll(() => {
  globalThis.window = {
    ...globalThis.window,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    navigator: { userAgent: "thisIsTheUserAgent" },
    location: { pathname: "thisIsThePathname" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.window = undefined as any;
});

test("Run simple program", () => {
  const program: Program<string, string, string> = {
    init: () => ["Hello"],
    update: () => ["Hello"],
    view: () => "Hello",
  };
  const endProgram = Runtime.runtime(program, []);
  expect(endProgram).toBeInstanceOf(Function);
  expect(globalThis.window.addEventListener).toBeCalled();
});

test("View can dispatch", (done) => {
  const program: Program<number, string, string> = {
    init: () => [0],
    update: () => [1],
    view: ({ dispatch, state }) => {
      if (state === 0) {
        dispatch("increment");
      } else {
        expect(state).toEqual(1);
        done();
      }
      return "view";
    },
  };
  Runtime.runtime(program, []);
});
