import type { SpecLine } from "@/lib/spec-build";

export type SpecImportDiff = {
  added: SpecLine[];
  removed: SpecLine[];
  kept: SpecLine[];
  extras: SpecLine[];
};

function derivedKey(line: SpecLine): string | null {
  return line.source === "derived" && line.deriveKey ? line.deriveKey : null;
}

export function parseSpecLines(raw: unknown): SpecLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: SpecLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const type = o.type === "SECTION" ? "SECTION" : o.type === "ITEM" ? "ITEM" : null;
    if (!type) continue;
    const source = o.source === "extra" ? "extra" : "derived";
    const key =
      typeof o.key === "string" && o.key
        ? o.key
        : source === "extra" && typeof o.extraId === "string"
          ? `extra:${o.extraId}`
          : typeof o.deriveKey === "string"
            ? o.deriveKey
            : "";
    if (!key) continue;
    lines.push({
      key,
      deriveKey: typeof o.deriveKey === "string" ? o.deriveKey : null,
      source,
      zoneId: typeof o.zoneId === "string" ? o.zoneId : null,
      zoneName: typeof o.zoneName === "string" ? o.zoneName : null,
      zoneSortOrder:
        typeof o.zoneSortOrder === "number" ? o.zoneSortOrder : null,
      zoneActive: o.zoneActive !== false,
      type,
      title: typeof o.title === "string" ? o.title : o.title == null ? null : String(o.title),
      name: typeof o.name === "string" ? o.name : o.name == null ? null : String(o.name),
      qty: Number(o.qty) || 0,
      comment: typeof o.comment === "string" ? o.comment : "",
      kitName: typeof o.kitName === "string" ? o.kitName : o.kitName == null ? null : String(o.kitName),
      catalogItemId:
        typeof o.catalogItemId === "string" ? o.catalogItemId : null,
      extraId: typeof o.extraId === "string" ? o.extraId : null,
      hidden: Boolean(o.hidden),
      isKitHeader: Boolean(o.isKitHeader),
      ownerLabel: typeof o.ownerLabel === "string" ? o.ownerLabel : undefined,
    });
  }
  return lines;
}

/** Снимок спецификации побеждает live-derive. Смена lifecycle не должна сюда вмешиваться. */
export function specLinesFromRevisionOrDerived(
  revision: { lines: unknown } | null | undefined,
  derived: SpecLine[],
): { lines: SpecLine[]; hasSnapshot: boolean } {
  if (revision) {
    return { lines: parseSpecLines(revision.lines), hasSnapshot: true };
  }
  return { lines: derived, hasSnapshot: false };
}

export function specLinesToJson(lines: SpecLine[]): SpecLine[] {
  return lines.map((l) => ({
    key: l.key,
    deriveKey: l.deriveKey,
    source: l.source,
    zoneId: l.zoneId ?? null,
    zoneName: l.zoneName ?? null,
    zoneSortOrder: l.zoneSortOrder ?? null,
    zoneActive: l.zoneActive !== false,
    type: l.type,
    title: l.title,
    name: l.name,
    qty: l.qty,
    comment: l.comment ?? "",
    kitName: l.kitName,
    catalogItemId: l.catalogItemId,
    extraId: l.extraId,
    hidden: Boolean(l.hidden),
    isKitHeader: Boolean(l.isKitHeader),
    ownerLabel: l.ownerLabel,
  }));
}

export function diffSpecImport(
  current: SpecLine[],
  incoming: SpecLine[],
): SpecImportDiff {
  const currentDerived = current.filter((l) => derivedKey(l));
  const incomingDerived = incoming.filter((l) => derivedKey(l));
  const currentByKey = new Map(
    currentDerived.map((l) => [derivedKey(l)!, l]),
  );
  const incomingByKey = new Map(
    incomingDerived.map((l) => [derivedKey(l)!, l]),
  );

  const added = incomingDerived.filter((l) => !currentByKey.has(derivedKey(l)!));
  const removed = currentDerived.filter(
    (l) => !incomingByKey.has(derivedKey(l)!),
  );
  const kept = currentDerived.filter((l) => incomingByKey.has(derivedKey(l)!));
  const extras = current.filter((l) => l.source === "extra");
  return { added, removed, kept, extras };
}

/**
 * Merge import: keep brigadier edits on matching deriveKey, add new quote
 * lines, drop derived lines that left the quote, always keep extras.
 * Incoming extra lines are ignored — extras live on the current snapshot.
 */
export function mergeSpecImport(
  current: SpecLine[],
  incoming: SpecLine[],
): SpecLine[] {
  const diff = diffSpecImport(current, incoming);
  const keptByKey = new Map(diff.kept.map((l) => [derivedKey(l)!, l]));
  const result: SpecLine[] = [];
  for (const line of incoming) {
    const key = derivedKey(line);
    if (!key) continue;
    const kept = keptByKey.get(key);
    result.push(
      kept
        ? {
            ...kept,
            zoneId: line.zoneId ?? null,
            zoneName: line.zoneName ?? null,
            zoneSortOrder: line.zoneSortOrder ?? null,
            zoneActive: line.zoneActive !== false,
          }
        : line,
    );
  }
  result.push(...diff.extras);
  return result;
}

export function summarizeSpecImportDiff(diff: SpecImportDiff) {
  return {
    added: diff.added.map(specDiffRow),
    removed: diff.removed.map(specDiffRow),
    kept: diff.kept.map(specDiffRow),
    extras: diff.extras.map(specDiffRow),
  };
}

function specDiffRow(line: SpecLine) {
  return {
    key: line.key,
    deriveKey: line.deriveKey,
    type: line.type,
    label: line.type === "SECTION" ? line.title || "" : line.name || "",
    qty: line.qty,
    hidden: Boolean(line.hidden),
    extra: line.source === "extra",
  };
}

export function overridesFromMerged(
  incoming: SpecLine[],
  merged: SpecLine[],
): Array<{
  deriveKey: string;
  action: "HIDE" | "SET_QTY" | "RENAME" | "SET_COMMENT";
  qty?: number | null;
  name?: string | null;
}> {
  const incomingBy = new Map(
    incoming
      .filter((l) => l.source === "derived" && l.deriveKey)
      .map((l) => [l.deriveKey!, l]),
  );
  const out: Array<{
    deriveKey: string;
    action: "HIDE" | "SET_QTY" | "RENAME" | "SET_COMMENT";
    qty?: number | null;
    name?: string | null;
  }> = [];
  for (const line of merged) {
    if (line.source !== "derived" || !line.deriveKey) continue;
    const base = incomingBy.get(line.deriveKey);
    if (!base) continue;
    if (line.hidden) {
      out.push({ deriveKey: line.deriveKey, action: "HIDE" });
    }
    if (line.qty !== base.qty) {
      out.push({
        deriveKey: line.deriveKey,
        action: "SET_QTY",
        qty: line.qty,
      });
    }
    const baseName = line.type === "SECTION" ? base.title : base.name;
    const curName = line.type === "SECTION" ? line.title : line.name;
    if ((curName || "") !== (baseName || "")) {
      out.push({
        deriveKey: line.deriveKey,
        action: "RENAME",
        name: curName || "",
      });
    }
    if ((line.comment || "") !== (base.comment || "")) {
      out.push({
        deriveKey: line.deriveKey,
        action: "SET_COMMENT",
        name: line.comment || "",
      });
    }
  }
  return out;
}
