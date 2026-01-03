import { useState, useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { Play, Sparkles } from 'lucide-react';
import type { Connection } from '../types';
import type { ColumnInfo } from '../lib/adapters';
import type { editor } from 'monaco-editor';
import { selectAllQuery } from '../lib/adapters';

// Schema info for autocomplete
export interface SchemaInfo {
  tables: string[];
  columns: Record<string, ColumnInfo[]>; // table name -> columns
}

interface QueryEditorProps {
  connection: Connection | null;
  selectedTable: string | null;
  onExecute: (sql: string) => void;
  isLoading: boolean;
  schema?: SchemaInfo;
  // Controlled state for AI integration
  value?: string;
  onChange?: (sql: string) => void;
  // AI panel toggle
  onToggleAI?: () => void;
  aiPanelOpen?: boolean;
}

// SQL keywords for autocomplete
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'INNER JOIN', 'OUTER JOIN', 'ON', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'DROP TABLE',
  'ALTER TABLE', 'ADD COLUMN', 'DROP COLUMN', 'INDEX', 'UNIQUE', 'PRIMARY KEY', 'FOREIGN KEY',
  'REFERENCES', 'CASCADE', 'ASC', 'DESC', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'COALESCE', 'NULLIF', 'CAST', 'TRUE', 'FALSE',
];

export function QueryEditor({ connection, selectedTable, onExecute, isLoading, schema, value, onChange, onToggleAI, aiPanelOpen }: QueryEditorProps) {
  const [internalSql, setInternalSql] = useState('');
  // Use controlled state if provided, otherwise use internal state
  const sql = value !== undefined ? value : internalSql;
  const setSql = onChange !== undefined ? onChange : setInternalSql;
  const monacoRef = useRef<Monaco | null>(null);
  const disposableRef = useRef<{ dispose: () => void } | null>(null);
  const schemaRef = useRef<SchemaInfo | undefined>(schema);

  // Keep schema ref updated
  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  // Update SQL when table selection changes
  useEffect(() => {
    if (selectedTable && connection) {
      // Using a microtask to avoid the warning about setState in effects
      queueMicrotask(() => setSql(selectAllQuery(selectedTable, connection.driver)));
    }
  }, [selectedTable, connection]);

  // Register autocomplete provider when Monaco is ready or schema changes
  const handleEditorMount = (_editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco;
    
    // Dispose previous completion provider if exists
    disposableRef.current?.dispose();
    
    // Register completion provider for SQL
    disposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', ',', '('],
      provideCompletionItems: (model: editor.ITextModel, position: { lineNumber: number; column: number }) => {
        const currentSchema = schemaRef.current; // Use ref to get latest schema
        
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        
        // Get text before cursor to determine context
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        }).toUpperCase();
        
        const suggestions: Parameters<typeof monaco.languages.registerCompletionItemProvider>[1] extends { provideCompletionItems: (...args: unknown[]) => infer R } ? R extends { suggestions: infer S } ? S : never : never = [];
        
        // Check if we're after a dot (table.column context)
        const lineText = model.getLineContent(position.lineNumber);
        const textBeforeDot = lineText.substring(0, position.column - 1);
        const dotMatch = textBeforeDot.match(/(\w+)\.$/);
        
        if (dotMatch && currentSchema?.columns) {
          // User typed "table." - suggest columns for that table
          const tableName = dotMatch[1].toLowerCase();
          const tableColumns = Object.entries(currentSchema.columns).find(
            ([t]) => t.toLowerCase() === tableName
          )?.[1];
          
          if (tableColumns) {
            tableColumns.forEach((col) => {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.type}${col.primaryKey ? ' (PK)' : ''}${col.nullable ? '' : ' NOT NULL'}`,
                insertText: col.name,
                range,
              });
            });
          }
          return { suggestions };
        }
        
        // Detect if we're after FROM, JOIN, INTO, UPDATE, etc. (table context)
        const isTableContext = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+$/i.test(textBeforeCursor) ||
                              /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+\w*$/i.test(textBeforeCursor);
        
        // Detect if we're in SELECT, WHERE, SET, etc. (column context)  
        const isColumnContext = /\bSELECT\s+(\w+\s*,\s*)*\w*$/i.test(textBeforeCursor) ||
                               /\bWHERE\s+.*$/i.test(textBeforeCursor) ||
                               /\bSET\s+.*$/i.test(textBeforeCursor) ||
                               /\bAND\s+\w*$/i.test(textBeforeCursor) ||
                               /\bOR\s+\w*$/i.test(textBeforeCursor) ||
                               /\bORDER BY\s+.*$/i.test(textBeforeCursor) ||
                               /\bGROUP BY\s+.*$/i.test(textBeforeCursor);

        // Add SQL keywords
        SQL_KEYWORDS.forEach((kw) => {
          if (kw.toUpperCase().startsWith(word.word.toUpperCase())) {
            suggestions.push({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword,
              detail: 'SQL keyword',
              insertText: kw,
              range,
            });
          }
        });
        
        // Add table suggestions
        if (currentSchema?.tables && (isTableContext || !isColumnContext)) {
          currentSchema.tables.forEach((table) => {
            suggestions.push({
              label: table,
              kind: monaco.languages.CompletionItemKind.Class,
              detail: 'Table',
              insertText: table,
              range,
            });
          });
        }
        
        // Add column suggestions (show all columns from all known tables)
        if (currentSchema?.columns && isColumnContext) {
          Object.entries(currentSchema.columns).forEach(([tableName, cols]) => {
            cols.forEach((col) => {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${tableName}.${col.name} (${col.type})`,
                insertText: col.name,
                range,
              });
              // Also suggest table.column format
              suggestions.push({
                label: `${tableName}.${col.name}`,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: col.type,
                insertText: `${tableName}.${col.name}`,
                range,
              });
            });
          });
        }
        
        return { suggestions };
      },
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposableRef.current?.dispose();
    };
  }, []);

  const handleExecute = () => {
    if (!connection || !sql.trim()) return;
    onExecute(sql);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1a1a1a]/60 dark:backdrop-blur-xl border border-neutral-200 dark:border-white/8 rounded-xl overflow-hidden dark:shadow-2xl" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="px-3 py-2.5 flex items-center gap-3 border-b border-neutral-200 dark:border-white/8">
        <button
          onClick={handleExecute}
          disabled={!connection || !sql.trim() || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {isLoading ? 'Running...' : 'Run'}
        </button>
        
        <div className="flex-1" />
        
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {connection ? (
            <>
              <span className="font-medium text-neutral-600 dark:text-neutral-300">{connection.name}</span>
              <span className="mx-1.5">·</span>
              <span className="uppercase">{connection.driver}</span>
            </>
          ) : (
            'No connection'
          )}
        </span>
        
        {onToggleAI && (
          <button
            onClick={onToggleAI}
            className={`p-1.5 rounded-lg transition-colors ${
              aiPanelOpen 
                ? 'bg-amber-500/10 text-amber-500' 
                : 'text-neutral-400 hover:text-amber-500 hover:bg-amber-500/10'
            }`}
            title="Toggle AI Assistant"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}
        
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600">⌘↵</span>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={sql}
          onChange={(value) => setSql(value || '')}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollbar: { vertical: 'auto', horizontal: 'auto', verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            lineNumbersMinChars: 3,
            folding: false,
          }}
        />
      </div>
    </div>
  );
}
