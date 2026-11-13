export interface Grouped<T> {
  key: string;
  items: T[];
}

/**
 * Group items by a string key in one pass. Groups appear in the order their
 * first item appears, and items keep their input order, so output is
 * deterministic for a given input order.
 */
export function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Grouped<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups].map(([key, list]) => ({ key, items: list }));
}
