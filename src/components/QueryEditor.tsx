import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play } from 'lucide-react';
import type { Connection } from '../types';

interface QueryEditorProps {
  connection: Connection | null;
  selectedTable: string | null;
  onExecute: (sql: string) => void;
  isLoading: boolean;
}

export function QueryEditor({ connection, selectedTable, onExecute, isLoading }: QueryEditorProps) {
  const [sql, setSql] = useState('');

  // Update SQL when table selection changes
  useEffect(() => {
    if (selectedTable) {
      // Using a microtask to avoid the warning about setState in effects
      queueMicrotask(() => setSql(`SELECT * FROM ${selectedTable} LIMIT 100`));
    }
  }, [selectedTable]);

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
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
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
        
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600">⌘↵</span>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={sql}
          onChange={(value) => setSql(value || '')}
          theme="vs-dark"
          options={{
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
