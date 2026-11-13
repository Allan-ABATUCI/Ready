/**
 * Deterministic synthetic contact generator for tests. Uses a seeded LCG, never
 * Math.random, so every run produces the same file. All data is invented:
 * example.test emails and 555-01xx numbers.
 */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SYLLABLES = ["ba", "ko", "ri", "mel", "san", "tor", "vi", "lu", "den", "ar", "zo", "ë", "ny", "qua", "fe", "lin"];
const COMPANIES = ["Example Widgets", "Sample Holdings", "Test Labs", "Placeholder AG", "Demo Studio", "Mock Partners"];

function word(rand: () => number, parts: number): string {
  let w = "";
  for (let i = 0; i < parts; i++) w += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export interface SyntheticOptions {
  rows: number;
  seed: number;
  /** Share of rows that are a near-duplicate of an earlier row. */
  dupRate?: number;
}

/** CSV text with Full Name, Email, Phone, Company columns and injected near-duplicates. */
export function syntheticContacts({ rows, seed, dupRate = 0.1 }: SyntheticOptions): string {
  const rand = lcg(seed);
  const out: string[][] = [];
  for (let i = 0; i < rows; i++) {
    const prev = out.length > 0 ? out[Math.floor(rand() * out.length)]! : null;
    if (prev && rand() < dupRate) {
      const [name, email, phone, company] = prev;
      const variant = Math.floor(rand() * 4);
      // Variants keep each token's first 3 characters, the documented blocking limit.
      if (variant === 0) out.push([name!.toLowerCase(), email!.toUpperCase(), "", company!]);
      else if (variant === 1) out.push([name!.split(" ").reverse().join(" "), "", "", company!]);
      else if (variant === 2) out.push([`${name}x`, "", phone!, `${company}.`]);
      else out.push(["", "", phone!.replace(/ /g, "-"), ""]);
      continue;
    }
    const first = word(rand, 2);
    const last = word(rand, 3);
    out.push([
      `${first} ${last}`,
      `${first.toLowerCase()}.${last.toLowerCase()}.${i}@example.test`,
      `+1 555 01${String(i % 100).padStart(2, "0")} ${String(i).padStart(5, "0")}`,
      COMPANIES[Math.floor(rand() * COMPANIES.length)]!,
    ]);
  }
  return ["Full Name,Email,Phone,Company", ...out.map((r) => r.join(","))].join("\n") + "\n";
}
