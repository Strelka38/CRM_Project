export const DATABASE_BACKUP_KIND = "baikal-crm-database";
export const DATABASE_BACKUP_VERSION = 4;

export const QUOTE_PACK_KIND = "baikal-crm-quotes";
export const QUOTE_PACK_VERSION = 1;

export const QUOTE_PACK_TABLES = [
  "quotes",
  "quoteZones",
  "quoteBlocks",
  "quoteAssignments",
  "quoteCalcShares",
  "quoteCalcLineOverrides",
  "quoteExtraExpenses",
  "specOverrides",
  "specExtras",
  "quoteComments",
  "quoteAttachments",
  "quoteSnapshots",
  "quoteAuditEvents",
  "specRevisions",
] as const;

export type QuotePackTableKey = (typeof QUOTE_PACK_TABLES)[number];

export type DatabaseBackupTables = {
  specialties: unknown[];
  users: unknown[];
  userSpecialties: unknown[];
  catalogCategories: unknown[];
  catalogItems: unknown[];
  kits: unknown[];
  kitComponents: unknown[];
  clients: unknown[];
  freelancers: unknown[];
  freelancerSpecialties: unknown[];
  venues: unknown[];
  venuePhotos: unknown[];
  vehicles: unknown[];
  legalEntities: unknown[];
  legalEntityBankAccounts: unknown[];
  equipmentUnits: unknown[];
  equipmentDocuments: unknown[];
  quoteTemplates: unknown[];
  quotes: unknown[];
  quoteZones: unknown[];
  quoteBlocks: unknown[];
  quoteAssignments: unknown[];
  quoteCalcShares: unknown[];
  quoteCalcLineOverrides: unknown[];
  quoteExtraExpenses: unknown[];
  specOverrides: unknown[];
  specExtras: unknown[];
  quoteComments: unknown[];
  quoteAttachments: unknown[];
  quoteSnapshots: unknown[];
  quoteAuditEvents: unknown[];
  specRevisions: unknown[];
};

export type QuotePackTables = Pick<DatabaseBackupTables, QuotePackTableKey>;

export type QuotePackFile = {
  kind: typeof QUOTE_PACK_KIND;
  version: number;
  exportedAt: string;
  tables: QuotePackTables;
};

export type DatabaseBackupFile = {
  kind: typeof DATABASE_BACKUP_KIND;
  version: number;
  exportedAt: string;
  tables: DatabaseBackupTables;
};

export type DatabaseBackupCounts = {
  [K in keyof DatabaseBackupTables]: number;
};

export function emptyBackupCounts(): DatabaseBackupCounts {
  return {
    specialties: 0,
    users: 0,
    userSpecialties: 0,
    catalogCategories: 0,
    catalogItems: 0,
    kits: 0,
    kitComponents: 0,
    clients: 0,
    freelancers: 0,
    freelancerSpecialties: 0,
    venues: 0,
    venuePhotos: 0,
    vehicles: 0,
    legalEntities: 0,
    legalEntityBankAccounts: 0,
    equipmentUnits: 0,
    equipmentDocuments: 0,
    quoteTemplates: 0,
    quotes: 0,
    quoteZones: 0,
    quoteBlocks: 0,
    quoteAssignments: 0,
    quoteCalcShares: 0,
    quoteCalcLineOverrides: 0,
    quoteExtraExpenses: 0,
    specOverrides: 0,
    specExtras: 0,
    quoteComments: 0,
    quoteAttachments: 0,
    quoteSnapshots: 0,
    quoteAuditEvents: 0,
    specRevisions: 0,
  };
}

export function countBackupTables(
  tables: Partial<DatabaseBackupTables> | undefined,
): DatabaseBackupCounts {
  const counts = emptyBackupCounts();
  if (!tables) return counts;
  for (const key of Object.keys(counts) as Array<keyof DatabaseBackupCounts>) {
    const rows = tables[key];
    counts[key] = Array.isArray(rows) ? rows.length : 0;
  }
  return counts;
}
