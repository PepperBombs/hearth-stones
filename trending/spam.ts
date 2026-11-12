/**
 * The deny-list: the spam GitHub's search still lets through after the
 * query's own filters (`fork:false archived:false` and a fewest number of
 * forks), as three patterns, one for each kind the owner named. The job
 * (server.ts) leaves out a repository that matches one before anything is
 * stored; the space's Hide list takes care of what gets past them.
 *
 * Imported by server.ts alone, so none of it reaches a browser. The README
 * lists the patterns, and the tests hold each to a sample it catches and a
 * near miss it keeps.
 */

const PATTERNS: readonly RegExp[] = [
  // A year, then "installer": "XYZ 2026: Full-Feature Desktop Installer". Not "nix-installer".
  /\b(?:19|20)\d\d\b.*\binstaller\b/i,
  // Crypto bots: "solana-mint-bot", "pump sniper bot", "wallet drainer bot", "volume bot". Not "mint-theme".
  /\b(?:mint|sniper|drainer|volume) ?bot\b/i,
  // Fake balances: "Fake-Balance" wallet tools, "flash USDT". Not "flash-attention", nor "fake-balancer".
  /\b(?:fake ?balance|flash ?usdt)\b/i,
];

/**
 * Whether a repository is spam by its name (owner/name) and description:
 * whether the two, with `-`, `_`, `.` and `/` read as spaces, match one of
 * the patterns. Read so, "Fake_Balance.v2" holds the words "Fake Balance".
 */
export function isSpam(fullName: string, description: string): boolean {
  const text = `${fullName} ${description}`.replace(/[-_./]/g, " ");
  return PATTERNS.some((pattern) => pattern.test(text));
}
