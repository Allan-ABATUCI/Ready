import "client-only";
import type { Crm } from "@/lib/rule-packs/types";
import type { ColumnRoles } from "./columns";
import { joinName, splitName } from "./names";
import type { CsvRow } from "./types";

export const CRM_LABELS: Record<Crm, string> = {
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
};

interface CrmLayout {
  /** "split": separate first / last name columns. "full": one name column. */
  names: "split" | "full";
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
  phone: string;
  company: string;
}

/** Default import headers per CRM (contact/person import templates). */
export const CRM_LAYOUTS: Record<Crm, CrmLayout> = {
  hubspot: {
    names: "split",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone Number",
    company: "Company Name",
  },
  salesforce: {
    names: "split",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
  },
  pipedrive: { names: "full", fullName: "Name", email: "Email", phone: "Phone", company: "Organization" },
};

/** Where an output column's value comes from. */
export type ColumnSource =
  | { kind: "col"; index: number }
  | { kind: "firstName"; index: number }
  | { kind: "lastName"; index: number }
  | { kind: "join"; first: number | undefined; last: number | undefined }
  /** The file(s) the row came from, for combined files (see `ExportOptions.sourceFile`). Not a file column. */
  | { kind: "sourceFile" };

export interface OutputColumn {
  header: string;
  source: ColumnSource;
}

/**
 * Map the file's columns onto a CRM's import headers. Recognised columns come
 * first in a fixed order; everything else passes through under its own header
 * (suffixed if it would collide with a CRM header).
 */
export function planColumns(headers: string[], crm: Crm, keys: ColumnRoles): OutputColumn[] {
  const layout = CRM_LAYOUTS[crm];
  const used = new Set<number>();
  const out: OutputColumn[] = [];
  const take = (header: string, source: ColumnSource, ...cols: (number | undefined)[]) => {
    out.push({ header, source });
    for (const c of cols) if (c !== undefined) used.add(c);
  };

  const hasParts = keys.firstName !== undefined || keys.lastName !== undefined;
  if (layout.names === "split") {
    if (hasParts) {
      if (keys.firstName !== undefined) take(layout.firstName!, { kind: "col", index: keys.firstName }, keys.firstName);
      if (keys.lastName !== undefined) take(layout.lastName!, { kind: "col", index: keys.lastName }, keys.lastName);
    } else if (keys.name !== undefined) {
      take(layout.firstName!, { kind: "firstName", index: keys.name }, keys.name);
      take(layout.lastName!, { kind: "lastName", index: keys.name });
    }
  } else if (keys.name !== undefined) {
    take(layout.fullName!, { kind: "col", index: keys.name }, keys.name);
  } else if (hasParts) {
    take(layout.fullName!, { kind: "join", first: keys.firstName, last: keys.lastName }, keys.firstName, keys.lastName);
  }

  if (keys.email !== undefined) take(layout.email, { kind: "col", index: keys.email }, keys.email);
  if (keys.phone !== undefined) take(layout.phone, { kind: "col", index: keys.phone }, keys.phone);
  if (keys.company !== undefined) take(layout.company, { kind: "col", index: keys.company }, keys.company);

  const taken = new Set(out.map((c) => c.header.toLowerCase()));
  headers.forEach((h, index) => {
    if (used.has(index)) return;
    let header = h;
    for (let n = 2; taken.has(header.toLowerCase()); n++) header = `${h} (${n})`;
    taken.add(header.toLowerCase());
    out.push({ header, source: { kind: "col", index } });
  });
  return out;
}

/** The file columns an output column is made from. */
export function sourceColumns(s: ColumnSource): number[] {
  if (s.kind === "sourceFile") return [];
  if (s.kind !== "join") return [s.index];
  return [s.first, s.last].filter((c) => c !== undefined);
}

/** One output row. `sourceFile` fills the "sourceFile" column, if there is one. */
export function projectRow(row: CsvRow, columns: OutputColumn[], sourceFile = ""): CsvRow {
  const cell = (i: number | undefined) => (i === undefined ? "" : (row[i] ?? ""));
  return columns.map(({ source: s }) => {
    switch (s.kind) {
      case "col":
        return cell(s.index);
      case "firstName":
        return splitName(cell(s.index))[0];
      case "lastName":
        return splitName(cell(s.index))[1];
      case "join":
        return joinName(cell(s.first), cell(s.last));
      case "sourceFile":
        return sourceFile;
    }
  });
}
