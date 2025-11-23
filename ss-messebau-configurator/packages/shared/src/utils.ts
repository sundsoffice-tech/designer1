const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function safeNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function collectUniqueValues<T, K extends string | number | boolean>(
  items: Iterable<T>,
  selector: (item: T) => K | null | undefined
): K[] {
  const seen = new Set<K>();
  const result: K[] = [];

  for (const item of items) {
    const value = selector(item);
    if (value === null || value === undefined) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

export function isValidEmail(email: string): boolean {
  return emailPattern.test(email.trim());
}
