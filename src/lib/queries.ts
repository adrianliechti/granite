export interface QueryDraft {
  id: string;
  title: string;
  sql: string;
}

export interface QueryRequest extends QueryDraft {
  connection: string;
  database: string;
}

export type OpenQuery = (
  connection: string,
  database: string,
  sql: string,
  title: string,
) => void;
