import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { Play, Square, Wand2, ChevronDown } from "lucide-react";
import { format, type SqlLanguage } from "sql-formatter";
import { monaco } from "../lib/monaco";
import type { DatabaseDriver } from "../types";
import { getAdapter, type ColumnInfo } from "../lib/adapters";
import {
  commonKeywords,
  cteColumns,
  dialectFunctions,
  dialectKeywords,
  identifierText,
  sqlTokens,
  statementAt,
  tableReferences,
} from "../lib/sql";
import { usePreference } from "../lib/preferences";

export interface SchemaInfo {
  tables: string[];
  columns: Record<string, ColumnInfo[]>;
}
const driverLanguage: Record<DatabaseDriver, SqlLanguage> = {
  postgres: "postgresql",
  mysql: "mysql",
  sqlite: "sqlite",
  sqlserver: "transactsql",
  oracle: "plsql",
  trino: "trino",
};
interface QueryEditorProps {
  driver: DatabaseDriver;
  path: string;
  value: string;
  onChange: (sql: string) => void;
  onExecute: (sql: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  schema: SchemaInfo;
  loadColumns: (table: string) => Promise<ColumnInfo[]>;
  maxRows: number;
  onMaxRowsChange: (limit: number) => void;
  error?: string;
}
export function QueryEditor(props: QueryEditorProps) {
  const {
    driver,
    path,
    value,
    onChange,
    onCancel,
    isLoading,
    maxRows,
    onMaxRowsChange,
  } = props;
  const execution = useRef<{
    path: string;
    source: string;
    offset: number;
  } | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const latest = useRef(props),
    disposables = useRef<monaco.IDisposable[]>([]);
  const [position, setPosition] = useState({
      line: 1,
      column: 1,
      selected: false,
    }),
    [formatError, setFormatError] = useState("");
  const [height, setHeight] = usePreference("editor-height", 260);
  const [dark, setDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const language =
    driver === "postgres" ? "pgsql" : driver === "mysql" ? "mysql" : "sql";
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => () => disposables.current.forEach((d) => d.dispose()), []);
  const modelScope = path.slice(0, path.lastIndexOf("/") + 1);
  useEffect(
    () => () => {
      for (const model of monaco.editor.getModels())
        if (model.uri.toString().startsWith(modelScope)) model.dispose();
    },
    [modelScope],
  );
  const run = (all = false) => {
    const editor = editorRef.current,
      current = latest.current;
    if (current.isLoading) return;
    const model = editor?.getModel(),
      selection = editor?.getSelection();
    const sql = all
      ? current.value
      : selection && !selection.isEmpty() && model
        ? model.getValueInRange(selection)
        : statementAt(
            current.value,
            model && editor?.getPosition()
              ? model.getOffsetAt(editor.getPosition()!)
              : 0,
            current.driver,
          );
    if (sql.trim()) {
      const offset = all
        ? 0
        : selection && !selection.isEmpty() && model
          ? model.getOffsetAt(selection.getStartPosition())
          : current.value.indexOf(
              sql,
              Math.max(
                0,
                (model && editor?.getPosition()
                  ? model.getOffsetAt(editor.getPosition()!)
                  : 0) - sql.length,
              ),
            );
      execution.current = {
        path: current.path,
        source: current.value,
        offset: Math.max(0, offset),
      };
      current.onExecute(sql);
    }
  };
  const formatEditor = () => {
    const editor = editorRef.current,
      model = editor?.getModel(),
      current = latest.current;
    if (!editor || !model) return;
    const selection = editor.getSelection(),
      selected = selection && !selection.isEmpty();
    const range = selected ? selection : model.getFullModelRange();
    try {
      const sql = format(model.getValueInRange(range), {
        language: driverLanguage[current.driver],
        keywordCase: "upper",
        tabWidth: 2,
      });
      editor.pushUndoStop();
      editor.executeEdits("format-sql", [{ range, text: sql }]);
      editor.pushUndoStop();
      setFormatError("");
    } catch (err) {
      setFormatError(
        err instanceof Error ? err.message : "Unable to format SQL",
      );
    }
  };
  const mount: OnMount = (instance) => {
    editorRef.current = instance;
    disposables.current.forEach((d) => d.dispose());
    disposables.current = [
      instance.onDidChangeCursorSelection((event) => {
        const p = event.selection.getPosition();
        setPosition({
          line: p.lineNumber,
          column: p.column,
          selected: !event.selection.isEmpty(),
        });
      }),
      instance.addAction({
        id: "granite.run",
        label: "Run selection or current statement",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => run(),
      }),
      instance.addAction({
        id: "granite.run-all",
        label: "Run all statements",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        ],
        run: () => run(true),
      }),
      instance.addAction({
        id: "granite.format",
        label: "Format SQL",
        keybindings: [
          monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        ],
        run: formatEditor,
      }),
      monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: [".", " "],
        provideCompletionItems: async (model, pos, _context, token) => {
          if (model !== instance.getModel()) return { suggestions: [] };
          const current = latest.current,
            offset = model.getOffsetAt(pos),
            full = model.getValue();
          const before = full.slice(0, offset),
            last = sqlTokens(before, current.driver).at(-1);
          if (
            last &&
            (last.kind === "string" || last.kind === "comment") &&
            last.end === offset
          )
            return { suggestions: [] };
          const query = statementAt(full, offset, current.driver),
            references = tableReferences(query, current.driver),
            ctes = cteColumns(query, current.driver);
          const adapter = getAdapter(current.driver);
          const resolve = (name: string) =>
            current.schema.tables.find((t) => t === name) ??
            current.schema.tables.find(
              (t) => t.toLowerCase() === name.toLowerCase(),
            ) ??
            current.schema.tables.find(
              (t) => t.split(".").at(-1)?.toLowerCase() === name.toLowerCase(),
            );
          const word = model.getWordUntilPosition(pos),
            range = {
              startLineNumber: pos.lineNumber,
              endLineNumber: pos.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
          const suggestions: monaco.languages.CompletionItem[] = [];
          const add = (
            label: string,
            insertText: string,
            kind: monaco.languages.CompletionItemKind,
            detail: string,
            sortText = "2",
          ) =>
            suggestions.push({
              label,
              insertText,
              kind,
              detail,
              range,
              sortText: `${sortText}${label.toLowerCase()}`,
            });
          const qualifierMatch = before.match(
            /([\w$]+|"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[(?:[^\]]|\]\])+\])\.\w*$/,
          );
          const qualifier = qualifierMatch
            ? identifierText(qualifierMatch[1])
            : undefined;
          const ref = qualifier
            ? references.find(
                (r) =>
                  (r.alias ?? r.name).toLowerCase() === qualifier.toLowerCase(),
              )
            : undefined;
          const requested = qualifier
            ? [ref?.name ?? qualifier]
            : references.map((r) => r.name);
          const tables = [
            ...new Set(
              requested.map(resolve).filter((name): name is string => !!name),
            ),
          ];
          await Promise.all(
            tables.map(async (table) => {
              let columns = current.schema.columns[table];
              if (!columns) {
                try {
                  columns = await current.loadColumns(table);
                } catch {
                  return;
                }
              }
              for (const column of columns)
                add(
                  column.name,
                  adapter.quoteIdentifier(column.name),
                  monaco.languages.CompletionItemKind.Field,
                  `${table} · ${column.type}${column.primaryKey ? " · primary key" : ""}`,
                  "0",
                );
            }),
          );
          for (const [name, columns] of Object.entries(ctes))
            if (
              !qualifier ||
              (ref?.name ?? qualifier).toLowerCase() === name.toLowerCase()
            )
              for (const column of columns)
                add(
                  column,
                  adapter.quoteIdentifier(column),
                  monaco.languages.CompletionItemKind.Field,
                  `${name} · CTE`,
                  "0",
                );
          if (token.isCancellationRequested) return { suggestions: [] };
          if (!qualifier) {
            const tableContext =
              /\b(?:FROM|JOIN|UPDATE|INTO)\s+[^\s,;]*$/i.test(before);
            for (const table of current.schema.tables)
              add(
                table,
                adapter.quoteIdentifier(table),
                monaco.languages.CompletionItemKind.Struct,
                "Table",
                tableContext ? "0" : "2",
              );
            for (const name of Object.keys(ctes))
              add(
                name,
                adapter.quoteIdentifier(name),
                monaco.languages.CompletionItemKind.Struct,
                "Common table expression",
                tableContext ? "0" : "2",
              );
            for (const { name, alias } of references)
              if (alias)
                add(
                  alias,
                  alias,
                  monaco.languages.CompletionItemKind.Variable,
                  `Alias for ${name}`,
                  "1",
                );
            for (const keyword of [
              ...commonKeywords,
              ...dialectKeywords[current.driver],
            ])
              add(
                keyword,
                keyword,
                monaco.languages.CompletionItemKind.Keyword,
                `${current.driver} SQL`,
                "3",
              );
            for (const name of [
              "COUNT",
              "SUM",
              "AVG",
              "MIN",
              "MAX",
              "COALESCE",
              "NULLIF",
              "CAST",
              "LOWER",
              "UPPER",
              ...dialectFunctions[current.driver],
            ]) {
              suggestions.push({
                label: name,
                insertText: `${name}(\${1})`,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                kind: monaco.languages.CompletionItemKind.Function,
                detail: `${current.driver} function`,
                range,
                sortText: `3${name}`,
              });
            }
            suggestions.push({
              label: "select rows",
              insertText:
                "SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition};",
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              kind: monaco.languages.CompletionItemKind.Snippet,
              range,
            });
          }
          const unique = new Map(
            suggestions.map((s) => [`${s.label}:${s.detail}`, s]),
          );
          return { suggestions: [...unique.values()] };
        },
      }),
      monaco.languages.registerHoverProvider(language, {
        provideHover: (model, pos) => {
          if (model !== instance.getModel()) return null;
          const word = model.getWordAtPosition(pos)?.word;
          if (!word) return null;
          const current = latest.current;
          const table = current.schema.tables.find((t) => t === word);
          if (table)
            return {
              contents: [
                { value: `**${table.replace(/[*_`]/g, "")}** · table` },
                {
                  value:
                    (current.schema.columns[table] ?? [])
                      .map((c) => `${c.name.replace(/[*_`]/g, "")}: ${c.type}`)
                      .join("\n\n") ||
                    "Columns load when this table is referenced.",
                },
              ],
            };
          return null;
        },
      }),
    ];
  };
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const context = execution.current;
    const base =
      context && context.path === path && context.source === value
        ? model.getPositionAt(context.offset)
        : null;
    const match = props.error?.match(
      /(?:line\s+|ORA-06550:\s*line\s+)(\d+)(?:[,: ]+column\s+(\d+))?/i,
    );
    monaco.editor.setModelMarkers(
      model,
      "granite",
      match && base
        ? [
            {
              message: props.error!,
              severity: monaco.MarkerSeverity.Error,
              startLineNumber: base.lineNumber + Number(match[1]) - 1,
              endLineNumber: base.lineNumber + Number(match[1]) - 1,
              startColumn:
                Number(match[2] ?? 1) +
                (Number(match[1]) === 1 ? base.column - 1 : 0),
              endColumn:
                Number(match[2] ?? 1) +
                (Number(match[1]) === 1 ? base.column - 1 : 0) +
                1,
            },
          ]
        : [],
    );
  }, [props.error, path, value]);
  return (
    <div className="sql-editor">
      <div className="toolbar flex-wrap">
        {isLoading ? (
          <button className="text-button" onClick={onCancel}>
            <Square size={13} />
            Cancel query
          </button>
        ) : (
          <button
            className="text-button"
            disabled={!value.trim()}
            onClick={() => run()}
            title="⌘/Ctrl Enter"
          >
            <Play size={13} />
            {position.selected ? "Run selection" : "Run statement"}
          </button>
        )}
        <details className="inline-menu">
          <summary className="icon-button" aria-label="More run options">
            <ChevronDown size={13} />
          </summary>
          <div className="menu-popover">
            <button
              disabled={isLoading || !value.trim()}
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                run(true);
              }}
            >
              Run all · ⌘/Ctrl Shift Enter
            </button>
          </div>
        </details>
        <button
          className="text-button"
          onClick={formatEditor}
          title="Shift Alt F"
        >
          <Wand2 size={13} />
          Format
        </button>
        <span className="muted text-xs ml-auto">{driverLanguage[driver]}</span>
        <label className="inline-check muted text-xs">
          Limit
          <select
            className="inline-select"
            aria-label="Query result limit"
            value={maxRows}
            onChange={(e) => onMaxRowsChange(Number(e.target.value))}
          >
            {[100, 1000, 5000, 10000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()} rows
              </option>
            ))}
          </select>
        </label>
      </div>
      {formatError && (
        <div className="error-banner" role="alert">
          {formatError}
          <button className="text-button" onClick={() => setFormatError("")}>
            Dismiss
          </button>
        </div>
      )}
      <div
        style={{
          height: Math.max(140, Math.min(height, window.innerHeight * 0.6)),
        }}
      >
        <Editor
          path={path}
          language={language}
          value={value}
          onChange={(next) => onChange(next ?? "")}
          onMount={mount}
          theme={dark ? "granite-dark" : "granite-light"}
          loading={<span className="muted text-xs">Loading SQL editor…</span>}
          options={{
            ariaLabel: "SQL editor",
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 21,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            renderLineHighlight: "line",
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            folding: true,
            glyphMargin: false,
            lineNumbersMinChars: 3,
            wordBasedSuggestions: "off",
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            fixedOverflowWidgets: true,
            tabCompletion: "on",
            accessibilitySupport: "auto",
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </div>
      <div
        className="editor-resize"
        role="separator"
        aria-label="Editor height"
        aria-orientation="horizontal"
        aria-valuenow={height}
        tabIndex={0}
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            setHeight(
              Math.max(
                140,
                Math.min(600, height + (e.key === "ArrowDown" ? 20 : -20)),
              ),
            );
          }
        }}
        onPointerDown={(e) => {
          const target = e.currentTarget,
            start = e.clientY,
            initial = height;
          target.setPointerCapture(e.pointerId);
          const move = (event: PointerEvent) =>
            setHeight(
              Math.max(
                140,
                Math.min(
                  window.innerHeight * 0.6,
                  initial + event.clientY - start,
                ),
              ),
            );
          const end = () => {
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", end);
            target.removeEventListener("pointercancel", end);
          };
          target.addEventListener("pointermove", move);
          target.addEventListener("pointerup", end);
          target.addEventListener("pointercancel", end);
        }}
      >
        <span />{" "}
        <span className="editor-position">
          Ln {position.line}, Col {position.column}
        </span>
      </div>
    </div>
  );
}
