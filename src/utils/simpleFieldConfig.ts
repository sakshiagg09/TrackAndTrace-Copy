// src/types/uiFieldConfig.ts

/**
 * Single source of truth:
 * - One type only (no duplicate declarations)
 * - Includes `visibleInAdapt` because your mapper sets it
 */

export type SimpleFieldDef = {
  id?: number;
  title: string;
  technicalName: string;
  /** whether the field is shown in the Adapt/Personalize UI */
  visibleInAdapt?: boolean;
  order?: number;
};

// Backward-compatible alias for existing usage elsewhere
export type UIFieldConfig = SimpleFieldDef;

/** Row shape coming from SQL / API */
type DBFieldRow = {
  Title: string;
  TechnicalName: string;
  Visible: boolean;
  Id?: number;
  Order?: number;
};

export async function fetchSimpleFieldConfig(): Promise<SimpleFieldDef[]> {
  const res = await fetch("/api/UiFieldConfig");
  if (!res.ok) return [];

  const raw: DBFieldRow[] = await res.json();

  return raw.map((r) => ({
    id: r.Id,
    title: r.Title,
    technicalName: r.TechnicalName,
    visibleInAdapt: r.Visible,
    order: r.Order,
  }));
}
