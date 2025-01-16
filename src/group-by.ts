type OneOrMore<T> = readonly [T, ...ReadonlyArray<T>];
// eslint-disable-next-line functional/prefer-readonly-type
type MutableOneOrMore<T> = [T, ...Array<T>];

type NonNullableObj<T> = { readonly [K in keyof T]: NonNullable<T[K]> };
export type Grouped<T, K extends string | number | symbol = string> = NonNullableObj<Partial<Record<K, OneOrMore<T>>>>;

export function groupBy<K extends string | number, I, V = I>(
  items: ReadonlyArray<I>,
  keySelector: (item: I) => K,
  valueSelector: (value: I) => V = (x) => x as unknown as V
): Grouped<V, K> {
  const grouped: Partial<Record<K, MutableOneOrMore<V>>> = {};
  for (const item of items) {
    const key = keySelector(item);
    const value = valueSelector(item);
    const keyItems = grouped[key];
    if (!keyItems) {
      grouped[key] = [value];
    } else {
      keyItems.push(value);
    }
  }
  return grouped as Grouped<V, K>;
}
