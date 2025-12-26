export type SimpleFieldDef = {
  title: string;
  technicalName: string;
  visible: boolean;
};

// Backward-compatible alias for existing usage
export interface UIFieldConfig extends SimpleFieldDef {}



/** Used by tables (EventsTable, SearchBar, etc.) */
export interface SimpleFieldDef {
  id?: number;
  title: string;
  technicalName: string;
  visibleInAdapt?: boolean;
  order?: number;
}

/** Row shape coming from SQL */
interface DBFieldRow {
  Title: string;
  TechnicalName: string;
  Visible: boolean;
}

export async function fetchSimpleFieldConfig(): Promise<SimpleFieldDef[]> {
  const res = await fetch("/api/UiFieldConfig");
  if (!res.ok) return [];

  const raw: DBFieldRow[] = await res.json();

  return raw.map((r): SimpleFieldDef => ({
    title: r.Title,
    technicalName: r.TechnicalName,
    visibleInAdapt: r.Visible,
  }));
}
