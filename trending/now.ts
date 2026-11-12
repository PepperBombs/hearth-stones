/**
 * The browser's clock as GitHub Trending's card and page read it: again
 * every 15 seconds while they are shown, so that "Updated N min ago" and
 * the ages move on by themselves, with nothing fetched. format.ts writes
 * the times against it.
 */
import { useEffect, useState } from "react";

/** How often the clock is read again. */
const TICK_MS = 15_000;

/** This browser's clock, in milliseconds, read again every TICK_MS while the component is shown. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
