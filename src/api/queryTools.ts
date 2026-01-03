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

// Zod schemas for tool inputs
const emptySchema = z.object({});

const setQuerySchema = z.object({
  query: z.string().describe('The SQL query to set in the editor'),
});

const executeQuerySchema = z.object({
  query: z.string().describe('The SQL query to execute'),
});

// Tool definitions
const getContextDef = toolDefinition({
  name: 'get_context',
  description: 'Get the current context including connection info, selected database/table, current query, and schema information (available tables and columns)',
  inputSchema: emptySchema,
});

const getCurrentQueryDef = toolDefinition({
  name: 'get_current_query',
  description: 'Get the current SQL query from the editor',
  inputSchema: emptySchema,
});

const getQueryResultDef = toolDefinition({
  name: 'get_query_result',
  description: 'Get the result of the last executed query, including columns, rows, and any errors',
  inputSchema: emptySchema,
});

const setQueryDef = toolDefinition({
  name: 'set_query',
  description: 'Set the SQL query in the editor. This updates the query editor content but does not execute it.',
  inputSchema: setQuerySchema,
});

const executeQueryDef = toolDefinition({
  name: 'execute_query',
  description: 'Execute a SQL query and return the results. This will run the query against the connected database.',
  inputSchema: executeQuerySchema,
});

// Type aliases for tool inputs
type SetQueryInput = z.infer<typeof setQuerySchema>;
type ExecuteQueryInput = z.infer<typeof executeQuerySchema>;

// Create client tool implementations
export function createQueryTools(environment: QueryChatEnvironment) {
  const { connection, database, table, currentQuery, queryResult, schema, setters } = environment;

  const getContext = getContextDef.client(async () => {
    // Get columns for the currently selected table
    const currentTableColumns = table && schema?.columns[table]
      ? schema.columns[table].map(c => ({ name: c.name, type: c.type, nullable: c.nullable }))
      : null;

    return {
      connection: connection ? {
        name: connection.name,
        driver: connection.driver,
      } : null,
      database,
      table,
      currentTableColumns,
      schema: schema ? {
        tables: schema.tables,
        columns: Object.fromEntries(
          Object.entries(schema.columns).map(([tableName, cols]) => [
            tableName,
            cols.map(c => ({ name: c.name, type: c.type, nullable: c.nullable }))
          ])
        ),
      } : null,
    };
  });

  const getCurrentQuery = getCurrentQueryDef.client(async () => {
    return { query: currentQuery || '(empty)' };
  });

  const getQueryResult = getQueryResultDef.client(async () => {
    if (!queryResult) {
      return { error: 'No query has been executed yet.' };
    }
    
    if (queryResult.error) {
      return { error: queryResult.error };
    }

    return {
      columns: queryResult.columns,
      rowCount: queryResult.rows?.length ?? 0,
      rows: truncateResults(queryResult.rows),
      rowsAffected: queryResult.rows_affected,
      truncated: (queryResult.rows?.length ?? 0) > MAX_RESULT_ROWS,
    };
  });

  const setQuery = setQueryDef.client(async (args: unknown) => {
    const input = args as SetQueryInput;
    setters.setQuery(input.query);
    return { success: true, query: input.query };
  });

  const executeQuery = executeQueryDef.client(async (args: unknown) => {
    const input = args as ExecuteQueryInput;
    setters.executeQuery(input.query);
    return { success: true, message: 'Query execution started. Use get_query_result to see results after execution completes.' };
  });

  return clientTools(
    getContext,
    getCurrentQuery,
    getQueryResult,
    setQuery,
    executeQuery
  );
}

// Build instructions for the SQL chat assistant
export function buildQueryInstructions(): string {
  return `You are an AI assistant embedded in a SQL client application (similar to DataGrip or DBeaver). You help users write, understand, and debug SQL queries.

IMPORTANT: When you use tools like set_query or execute_query, the changes appear immediately in the user's query editor. You are actively editing their query—not just describing what to do.

Your capabilities:
- View the current database context (connection, database, table, schema)
- View and modify the SQL query in the editor
- Execute queries and analyze results
- Help write complex queries based on the available schema

Guidelines:
- When the user asks to write a query, use set_query to put it in the editor
- When the user wants to run a query, use execute_query, then ALWAYS use get_query_result to check the actual results
- IMPORTANT: After executing a query, you MUST call get_query_result to verify if it succeeded or failed. Do NOT assume there was an error without checking the results first
- Always check the schema context first to understand available tables and columns
- Provide clear explanations of what queries do
- When debugging, always get_query_result first to see the actual error message or results
- Suggest optimizations when appropriate
- Use proper SQL syntax for the connected database driver (PostgreSQL, MySQL, SQLite, etc.)
- IMPORTANT: Only one query can be executed at a time. Do NOT include multiple queries separated by semicolons in a single execution
- IMPORTANT: For Oracle databases, do NOT include a trailing semicolon (;) at the end of queries - Oracle's driver does not support it
- Format your responses using Markdown: use **bold**, \`code\`, code blocks with language tags, lists, and headers when appropriate
- When showing SQL examples, use \`\`\`sql code blocks`;
}

// Adapter metadata
export const queryAdapterConfig = {
  id: 'query',
  name: 'SQL Assistant',
  placeholder: 'Ask about your query or data...',
};
