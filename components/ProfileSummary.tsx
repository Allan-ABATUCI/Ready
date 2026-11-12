"use client";

import type { ColumnProfile, CsvEncoding } from "@/lib/data-plane/types";

export interface ProfileSummaryProps {
  profile: ColumnProfile[];
  rowCount: number;
  encoding?: CsvEncoding;
}

export function ProfileSummary({ profile, rowCount, encoding = "utf-8" }: ProfileSummaryProps) {
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
            <th className="py-1 font-medium">Looks like</th>
          </tr>
        </thead>
        <tbody>
          {profile.map((c) => (
            <tr key={c.index} className="border-t border-slate-100">
              <td className="py-1 pr-4 font-medium text-slate-800">{c.header || <em>(blank)</em>}</td>
              <td className="py-1 pr-4">{Math.round(c.fillRate * 100)}%</td>
              <td className="py-1 pr-4">{c.distinct}</td>
              <td className="py-1">{c.pattern}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
