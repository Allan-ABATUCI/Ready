import "client-only";

/** "Zoë  van der Berg" → ["Zoë", "van der Berg"]. Split at the first whitespace run. */
export function splitName(full: string): [string, string] {
  const m = /^(\S+)\s+(.*)$/su.exec(full.trim());
  return m ? [m[1]!, m[2]!.trim()] : [full.trim(), ""];
}

/** (" Bo ", "Sample") → "Bo Sample"; blanks are skipped so one part alone has no stray space. */
export function joinName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}
