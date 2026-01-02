import type { SQLRequest, SQLResponse } from '../types';

export async function executeQuery(request: SQLRequest): Promise<SQLResponse> {
  const response = await fetch('/api/sql/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.json();
}
