"use client";

import { KEY_COLUMNS, type ColumnRoles, type KeyColumn } from "@/lib/data-plane/columns";
import type { ColumnProfile, CsvEncoding } from "@/lib/data-plane/types";

const ROLE_LABELS: Record<KeyColumn, string> = {
  email: "Email",
  phone: "Phone",
  name: "Full name",
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
};

export interface ProfileSummaryProps {
  profile: ColumnProfile[];
  rowCount: number;
  encoding?: CsvEncoding;
  /** Current column roles. The "Use as" pickers are shown only with `onRole`. */
  roles?: ColumnRoles;
  /** `col` null clears the role. */
  onRole?: (role: KeyColumn, col: number | null) => void;
  /** Disables the pickers, e.g. while a previous change is being applied. */
  busy?: boolean;
}

export function ProfileSummary({
  profile,
  rowCount,
  encoding = "utf-8",
  roles = {},
  onRole,
  busy = false,
}: ProfileSummaryProps) {
  const roleOf = (col: number) => KEY_COLUMNS.find((k) => roles[k] === col);

  return (
    <section aria-labelledby="profile-heading" className="rounded-xl bg-white p-6 shadow-sm">
      <h2 id="profile-heading" className="text-lg font-semibold text-slate-900">
        Columns <span className="font-normal text-slate-500">({rowCount} rows)</span>
      </h2>
      {encoding === "windows-1252" && (
        <p className="mt-1 text-xs text-slate-500" data-testid="encoding-note">
          Read as Windows-1252 (the file wasn&apos;t UTF-8, as is common for files saved by Excel).
        </p>
      )}
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 pr-4 font-medium">Column</th>
            <th className="py-1 pr-4 font-medium">Filled</th>
            <th className="py-1 pr-4 font-medium">Distinct</th>
            <th className="py-1 pr-4 font-medium">Looks like</th>
            {onRole && <th className="py-1 font-medium">Use as</th>}
          </tr>
        </thead>
        <tbody>
          {profile.map((c) => {
            const role = roleOf(c.index);
            return (
              <tr key={c.index} className="border-t border-slate-100">
                <td className="py-1 pr-4 font-medium text-slate-800">{c.header || <em>(blank)</em>}</td>
                <td className="py-1 pr-4">{Math.round(c.fillRate * 100)}%</td>
                <td className="py-1 pr-4">{c.distinct}</td>
                <td className="py-1 pr-4">{c.pattern}</td>
                {onRole && (
                  <td className="py-1">
                    <select
                      aria-label={`Use column ${c.index + 1} as`}
                      className="rounded border px-1 py-0.5"
                      value={role ?? ""}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.value as KeyColumn | "";
                        if (next) onRole(next, c.index);
                        else if (role) onRole(role, null);
                      }}
                    >
                      <option value="">—</option>
                      {KEY_COLUMNS.map((k) => (
                        <option key={k} value={k}>
                          {ROLE_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
