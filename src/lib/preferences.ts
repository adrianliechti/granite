import { useCallback, useState } from "react";

export function readPreference<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`granite:${key}`) ?? "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function writePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(`granite:${key}`, JSON.stringify(value));
  } catch {
    /* Storage can be disabled or full. */
  }
}
export function usePreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readPreference(key, initial));
  const update = useCallback(
    (next: T | ((current: T) => T)) =>
      setValue((current) => {
        const resolved =
          typeof next === "function"
            ? (next as (current: T) => T)(current)
            : next;
        writePreference(key, resolved);
        return resolved;
      }),
    [key],
  );
  return [value, update] as const;
}
