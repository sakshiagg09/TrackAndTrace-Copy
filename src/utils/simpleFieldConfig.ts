export interface UIFieldConfig {
  title: string;
  technicalName: string;
  visible: boolean;
}

/** Row shape coming from SQL */
interface DBFieldRow {
  Title: string;
  TechnicalName: string;
  Visible: boolean;
}

export async function fetchSimpleFieldConfig(): Promise<UIFieldConfig[]> {
  const res = await fetch("/api/UiFieldConfig");
  if (!res.ok) return [];

  const raw: DBFieldRow[] = await res.json();

  return raw.map((r): UIFieldConfig => ({
    title: r.Title,
    technicalName: r.TechnicalName,
    visible: r.Visible
  }));
}
