export const DATABASE_BACKUP_KIND = "baikal-crm-database";
export const DATABASE_BACKUP_VERSION = 1;

export type DatabaseBackupTables = {
  specialties: unknown[];
  users: unknown[];
  userSpecialties: unknown[];
  catalogCategories: unknown[];
  catalogItems: unknown[];
  kits: unknown[];
  kitComponents: unknown[];
  clients: unknown[];
  venues: unknown[];
  venuePhotos: unknown[];
  vehicles: unknown[];
  equipmentUnits: unknown[];
  equipmentDocuments: unknown[];
  quoteTemplates: unknown[];
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
    venues: 0,
    venuePhotos: 0,
    vehicles: 0,
    equipmentUnits: 0,
    equipmentDocuments: 0,
    quoteTemplates: 0,
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
