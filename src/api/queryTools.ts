// TanStack AI tools for SQL query assistance
import { toolDefinition } from '@tanstack/ai';
import { clientTools } from '@tanstack/ai-client';
import { z } from 'zod';
import type { QueryChatEnvironment } from '../types/chat';

const MAX_RESULT_ROWS = 50;

// Truncate results if too large
function truncateResults(rows: Record<string, unknown>[] | undefined): Record<string, unknown>[] {
  if (!rows) return [];
  if (rows.length <= MAX_RESULT_ROWS) return rows;
  return rows.slice(0, MAX_RESULT_ROWS);
}

// Format query result for AI response
function formatQueryResult(response: { columns?: string[]; rows?: Record<string, unknown>[]; rows_affected?: number; error?: string }) {
  if (response.error) {
    return { error: response.error };
  }

  return {
    columns: response.columns,
    rowCount: response.rows?.length ?? 0,
    rows: truncateResults(response.rows),
    rowsAffected: response.rows_affected,
    truncated: (response.rows?.length ?? 0) > MAX_RESULT_ROWS,
  };
}

// Zod schemas for tool inputs
const emptySchema = z.object({});

const setQuerySchema = z.object({
  query: z.string().describe('The SQL query to set in the editor'),
});

const executeQuerySchema = z.object({
  query: z.string().describe('The SQL query to execute'),
});

const runQuerySchema = z.object({
  query: z.string().describe('The SQL query to run silently'),
});

// Tool definitions
const getQueryResultDef = toolDefinition({
  name: 'get_query_result',
  description: 'Get the result of the last executed query that was shown in the UI, including columns, rows, and any errors',
  inputSchema: emptySchema,
});

const setQueryDef = toolDefinition({
  name: 'set_query',
  description: 'Set the SQL query in the editor without executing it. The user will see the query appear in their editor immediately.',
  inputSchema: setQuerySchema,
});

const executeQueryDef = toolDefinition({
  name: 'execute_query',
  description: 'Execute a SQL query and show results in the UI. The query will be set in the editor and executed, with results displayed to the user. Returns the query results directly.',
  inputSchema: executeQuerySchema,
});

const runQueryDef = toolDefinition({
  name: 'run_query',
  description: 'Run a SQL query silently WITHOUT changing the UI or query editor. Use this for exploratory queries, checking data, or gathering information without disrupting what the user is currently working on. Results are returned but not shown in the UI.',
  inputSchema: runQuerySchema,
});

// Type aliases for tool inputs
type SetQueryInput = z.infer<typeof setQuerySchema>;
type ExecuteQueryInput = z.infer<typeof executeQuerySchema>;
type RunQueryInput = z.infer<typeof runQuerySchema>;

// Create client tool implementations
export function createQueryTools(environment: QueryChatEnvironment) {
  const { queryResult, setters } = environment;

  const getQueryResult = getQueryResultDef.client(async () => {
    if (!queryResult) {
      return { error: 'No query has been executed yet.' };
    }
    return formatQueryResult(queryResult);
  });

  const setQuery = setQueryDef.client(async (args: unknown) => {
    const input = args as SetQueryInput;
    setters.setQuery(input.query);
    return { success: true, query: input.query };
  });

  const executeQuery = executeQueryDef.client(async (args: unknown) => {
    const input = args as ExecuteQueryInput;
    try {
      const response = await setters.executeQuery(input.query);
      return formatQueryResult(response);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Query execution failed' };
    }
  });

  const runQuery = runQueryDef.client(async (args: unknown) => {
    const input = args as RunQueryInput;
    try {
      const response = await setters.executeQuerySilent(input.query);
      return formatQueryResult(response);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Query execution failed' };
    }
  });

  return clientTools(
    getQueryResult,
    setQuery,
    executeQuery,
    runQuery
  );
}

// Build instructions for the SQL chat assistant
export function buildQueryInstructions(environment: QueryChatEnvironment): string {
  const { connection, database, table, currentQuery, schema } = environment;
  
  // Build current environment section
  const envLines: string[] = [];
  if (connection) {
    envLines.push(`- **Driver**: ${connection.driver}`);
    envLines.push(`- **Database**: ${database || '(none selected)'}`);
    envLines.push(`- **Table**: ${table || '(none selected)'}`);
  } else {
    envLines.push('- Not connected to a database');
  }
  
  const envSection = envLines.join('\n');
  
  // Build current query section
  const querySection = currentQuery?.trim() 
    ? `\`\`\`sql\n${currentQuery}\n\`\`\`` 
    : '(empty)';

  // Build schema section if available
  let schemaSection = '';
  if (schema?.tables?.length) {
    const tableList = schema.tables.map(t => {
      const cols = schema.columns[t];
      if (cols?.length) {
        const colStr = cols.map(c => `${c.name} (${c.type})`).join(', ');
        return `- **${t}**: ${colStr}`;
      }
      return `- **${t}**`;
    }).join('\n');
    schemaSection = `\n\n## Schema\n\n${tableList}`;
  }

  return `You are an AI assistant embedded in a database management tool. You help users write, understand, and debug SQL queries.

## Current Environment

${envSection}

## Current Query

${querySection}${schemaSection}

## Tools

- \`get_query_result\`: Get results of the last executed query
- \`set_query\`: Put a query in the editor (user sees it immediately)
- \`execute_query\`: Run a query and show results in UI
- \`run_query\`: Run a query silently without changing UI (for exploration)

## Guidelines

- **Writing queries**: Use \`set_query\` to show it in the editor for review
- **Running queries**: Use \`execute_query\` - results return directly
- **Exploring data**: Use \`run_query\` to check data without disrupting the UI
- **Query format**: One query at a time. For Oracle, omit trailing semicolon
- **Response format**: Use Markdown. Be concise.`;
}

// Adapter metadata
export const queryAdapterConfig = {
  id: 'query',
  name: 'SQL Assistant',
  placeholder: 'Ask about your query or data...',
};
