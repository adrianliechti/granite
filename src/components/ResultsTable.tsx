import {
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Columns3,
  Copy,
  Download,
  Loader2,
  Pin,
  Trash2,
  X,
  PanelRight,
} from "lucide-react";
import type { SQLResponse } from "../types";
import type { ColumnInfo } from "../lib/adapters";
import {
  displayValue,
  editableColumn,
  inputValue,
  parseCellValue,
  valueKind,
  type DataSort,
} from "../lib/data";
import { usePreference } from "../lib/preferences";

interface ResultsTableProps {
  response: SQLResponse | null;
  duration?: number;
  isLoading: boolean;
  tableName?: string;
  preferenceKey?: string;
  columnsInfo?: ColumnInfo[];
  sorting?: DataSort[];
  onSort?: (sorting: DataSort[]) => void;
  onUpdateCell?: (
    row: Record<string, unknown>,
    column: string,
    value: unknown,
  ) => Promise<void>;
  onDeleteRow?: (row: Record<string, unknown>) => Promise<void>;
  rowKey?: (row: Record<string, unknown>) => string;
  footer?: ReactNode;
  busy?: boolean;
  emptyMessage?: string;
}
export function ValueInput({
  value,
  onChange,
  column,
  label,
  multiline = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  column?: ColumnInfo;
  label: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  const kind = valueKind(column?.type ?? "text");
  if (kind === "boolean")
    return (
      <select
        aria-label={label}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      >
        <option value="">Choose…</option>
        <option value="true">true</option>
        <option value="false">false</option>
        <option value="1">1</option>
        <option value="0">0</option>
      </select>
    );
  if (multiline || kind === "json")
    return (
      <textarea
        aria-label={label}
        className="field font-mono resize-y"
        rows={kind === "json" ? 5 : 3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        spellCheck={false}
      />
    );
  return (
    <input
      aria-label={label}
      className="field font-mono"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      spellCheck={false}
      inputMode={kind === "number" ? "decimal" : undefined}
      placeholder={
        kind === "date"
          ? "YYYY-MM-DD"
          : kind === "datetime"
            ? "YYYY-MM-DD HH:mm:ss"
            : undefined
      }
    />
  );
}
function EditableValue({
  value,
  column,
  onSave,
  disabled,
  detail,
  onStatus,
}: {
  value: unknown;
  column?: ColumnInfo;
  onSave?: (value: unknown) => Promise<void>;
  disabled?: boolean;
  detail?: boolean;
  onStatus: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [isNull, setNull] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const canEdit = !!onSave && !disabled && editableColumn(column);
  const begin = () => {
    if (!canEdit) return;
    setDraft(inputValue(value, column));
    setNull(value == null);
    setError("");
    setEditing(true);
  };
  const save = async () => {
    if (!onSave || pending) return;
    setPending(true);
    setError("");
    onStatus("Saving…");
    try {
      await onSave(isNull ? null : parseCellValue(draft, column));
      setEditing(false);
      onStatus("Saved");
    } catch (err) {
      setEditing(false);
      setError(err instanceof Error ? err.message : "Could not save");
      onStatus("Edit failed · stored value restored");
    } finally {
      setPending(false);
    }
  };
  if (editing)
    return (
      <form
        className="cell-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !pending) {
            setEditing(false);
            e.preventDefault();
          }
        }}
      >
        <fieldset disabled={pending}>
          {!isNull && (
            <ValueInput
              label={`Value for ${column?.name ?? "cell"}`}
              value={draft}
              onChange={setDraft}
              column={column}
              multiline={detail}
              autoFocus
            />
          )}
          <div className="flex items-center gap-1 mt-1">
            {column?.nullable !== false && (
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={isNull}
                  onChange={(e) => setNull(e.target.checked)}
                />
                NULL
              </label>
            )}
            <button
              type="submit"
              className="icon-button"
              aria-label="Save value"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel edit"
              onClick={() => setEditing(false)}
            >
              <X size={14} />
            </button>
          </div>
        </fieldset>
      </form>
    );
  return (
    <div className="min-w-0">
      <span
        className={`cell-value ${value == null ? "muted italic" : ""} ${canEdit ? "cursor-text" : ""} ${detail ? "whitespace-pre-wrap break-all" : ""}`}
        title={displayValue(value) || (value == null ? "NULL" : "Empty string")}
        onClick={begin}
      >
        {value == null
          ? "NULL"
          : displayValue(value) || <span className="muted italic">empty</span>}
      </span>
      {error && (
        <div role="alert" className="inline-error whitespace-normal">
          <span>{error}</span>
          <button className="text-button" onClick={begin} disabled={disabled}>
            Retry edit
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss edit error"
            onClick={() => setError("")}
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
function csv(columns: string[], rows: Record<string, unknown>[]) {
  const escape = (value: unknown) =>
    `"${displayValue(value).replaceAll('"', '""')}"`;
  return [
    columns.map(escape).join(","),
    ...rows.map((row) =>
      columns.map((c) => (row[c] == null ? "" : escape(row[c]))).join(","),
    ),
  ].join("\r\n");
}
export function ResultsTable({
  response,
  duration = 0,
  isLoading,
  tableName,
  preferenceKey = "query",
  columnsInfo = [],
  sorting,
  onSort,
  onUpdateCell,
  onDeleteRow,
  rowKey,
  footer,
  busy,
  emptyMessage,
}: ResultsTableProps) {
  const [localSort, setLocalSort] = useState<DataSort[]>([]);
  const [pinned, setPinned] = usePreference<string[]>(
    `grid:${preferenceKey}:pinned`,
    [],
  );
  const [hidden, setHidden] = usePreference<string[]>(
    `grid:${preferenceKey}:hidden`,
    [],
  );
  const [widths, setWidths] = usePreference<Record<string, number>>(
    `grid:${preferenceKey}:widths`,
    {},
  );
  const [status, setStatus] = useState(""),
    [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null),
    [deleteError, setDeleteError] = useState(""),
    [deletePending, setDeletePending] = useState(false);
  const activeSort = sorting ?? localSort;
  const allColumns = response?.columns ?? [];
  const columns = [
    ...pinned.filter((c) => allColumns.includes(c) && !hidden.includes(c)),
    ...allColumns.filter((c) => !hidden.includes(c) && !pinned.includes(c)),
  ];
  const rows = [...(response?.rows ?? [])];
  if (!onSort && activeSort.length)
    rows.sort((a, b) => {
      for (const { id, desc } of activeSort) {
        const x = a[id],
          y = b[id];
        const order =
          x == null
            ? y == null
              ? 0
              : -1
            : y == null
              ? 1
              : typeof x === "number" && typeof y === "number"
                ? x - y
                : displayValue(x).localeCompare(displayValue(y), undefined, {
                    numeric: true,
                  });
        if (order) return desc ? -order : order;
      }
      return 0;
    });
  const keyFor = (row: Record<string, unknown>, index: number) =>
    rowKey?.(row) ?? String(index);
  const width = (name: string) =>
    widths[name] ??
    Math.min(
      300,
      Math.max(
        90,
        Math.max(
          name.length + 5,
          ...(response?.rows ?? [])
            .slice(0, 30)
            .map((row) => Math.min(40, displayValue(row[name]).length)),
        ) *
          7.2 +
          24,
      ),
    );
  const style = (name: string): CSSProperties => ({
    width: width(name),
    minWidth: width(name),
    maxWidth: width(name),
    ...(pinned.includes(name)
      ? {
          position: "sticky",
          left: columns
            .slice(0, columns.indexOf(name))
            .filter((c) => pinned.includes(c))
            .reduce((sum, c) => sum + width(c), 0),
          zIndex: 2,
        }
      : {}),
  });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Clipboard unavailable");
    }
  };
  const sort = (name: string, multi: boolean) => {
    const current = activeSort.find((s) => s.id === name);
    const next = multi ? activeSort.filter((s) => s.id !== name) : [];
    if (!current?.desc) next.push({ id: name, desc: !!current });
    (onSort ?? setLocalSort)(next);
  };
  const cellKeyDown = (
    event: KeyboardEvent<HTMLTableCellElement>,
    row: number,
    col: number,
  ) => {
    if (event.target !== event.currentTarget) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "c") {
      event.preventDefault();
      void copy(displayValue(rows[row][columns[col]]));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const value =
        event.currentTarget.querySelector<HTMLElement>(".cell-value");
      if (onUpdateCell && !busy) value?.click();
      else setSelected(rows[row]);
    }
    const next = (
      {
        ArrowUp: [row - 1, col],
        ArrowDown: [row + 1, col],
        ArrowLeft: [row, col - 1],
        ArrowRight: [row, col + 1],
      } as Record<string, number[]>
    )[event.key];
    if (next) {
      event.preventDefault();
      event.currentTarget
        .closest("table")
        ?.querySelector<HTMLElement>(`[data-cell="${next[0]}:${next[1]}"]`)
        ?.focus();
    }
  };
  const deleteRow = async (row: Record<string, unknown>) => {
    if (!onDeleteRow || deletePending) return;
    setDeletePending(true);
    setDeleteError("");
    setStatus("Deleting…");
    try {
      await onDeleteRow(row);
      setDeleting(null);
      setSelected(null);
      setStatus("Row deleted");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setStatus("Delete failed");
    } finally {
      setDeletePending(false);
    }
  };
  const inspectorRow =
    selected && rowKey
      ? (rows.find((row) => rowKey(row) === rowKey(selected)) ?? selected)
      : selected;
  return (
    <section
      className="results flex flex-col min-h-0 min-w-0 flex-1"
      aria-label={tableName ? `${tableName} results` : "Query results"}
      aria-busy={isLoading || busy}
    >
      {response?.error && (
        <div className="error-banner" role="alert">
          {response.error}
        </div>
      )}
      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 overflow-auto min-w-0">
          {allColumns.length > 0 ? (
            <table
              className="data-grid"
              style={{
                minWidth: "100%",
                width: columns.reduce((sum, c) => sum + width(c), 0) + 76,
              }}
            >
              <caption className="sr-only">
                {onUpdateCell
                  ? "Click a value or press Enter to edit. Escape cancels an edit. "
                  : ""}
                Use arrow keys to move between cells. Copy a cell with Control
                or Command C.
              </caption>
              <thead>
                <tr>
                  {columns.map((name) => {
                    const direction = activeSort.find((s) => s.id === name);
                    return (
                      <th
                        key={name}
                        style={style(name)}
                        aria-sort={
                          direction
                            ? direction.desc
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <div className="flex items-center gap-1">
                          <button
                            className="column-title"
                            onClick={(e) => sort(name, e.shiftKey)}
                            title={`Sort ${name} · Shift-click for multiple columns`}
                          >
                            <span className="truncate">{name}</span>
                            {direction &&
                              (direction.desc ? (
                                <ArrowDown size={12} />
                              ) : (
                                <ArrowUp size={12} />
                              ))}
                          </button>
                          <button
                            className={`icon-button quiet ${pinned.includes(name) ? "active" : ""}`}
                            aria-label={`${pinned.includes(name) ? "Unpin" : "Pin"} ${name}`}
                            onClick={() =>
                              setPinned((current) =>
                                current.includes(name)
                                  ? current.filter((c) => c !== name)
                                  : [...current, name],
                              )
                            }
                          >
                            <Pin size={12} />
                          </button>
                        </div>
                        <div
                          className="column-resize"
                          role="separator"
                          aria-label={`Width of ${name}`}
                          aria-orientation="vertical"
                          aria-valuenow={width(name)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                              e.preventDefault();
                              setWidths((current) => ({
                                ...current,
                                [name]: Math.max(
                                  90,
                                  Math.min(
                                    700,
                                    width(name) +
                                      (e.key === "ArrowRight" ? 20 : -20),
                                  ),
                                ),
                              }));
                            }
                          }}
                          onPointerDown={(e) => {
                            const start = e.clientX,
                              initial = width(name);
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const target = e.currentTarget;
                            const move = (event: PointerEvent) =>
                              setWidths((current) => ({
                                ...current,
                                [name]: Math.max(
                                  90,
                                  Math.min(
                                    700,
                                    initial + event.clientX - start,
                                  ),
                                ),
                              }));
                            const end = () => {
                              target.removeEventListener("pointermove", move);
                              target.removeEventListener("pointerup", end);
                              target.removeEventListener("pointercancel", end);
                            };
                            target.addEventListener("pointermove", move);
                            target.addEventListener("pointerup", end);
                            target.addEventListener("pointercancel", end);
                          }}
                        />
                      </th>
                    );
                  })}
                  <th className="row-actions-heading">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={keyFor(row, index)}>
                    {columns.map((name, colIndex) => (
                      <td
                        key={name}
                        style={style(name)}
                        tabIndex={index === 0 && colIndex === 0 ? 0 : -1}
                        data-cell={`${index}:${colIndex}`}
                        onKeyDown={(event) =>
                          cellKeyDown(event, index, colIndex)
                        }
                        onFocus={(e) => {
                          const table = e.currentTarget.closest("table");
                          table
                            ?.querySelectorAll<HTMLTableCellElement>(
                              'td[tabindex="0"]',
                            )
                            .forEach((cell) => {
                              if (cell !== e.currentTarget) cell.tabIndex = -1;
                            });
                          e.currentTarget.tabIndex = 0;
                        }}
                      >
                        <EditableValue
                          value={row[name]}
                          column={columnsInfo.find((c) => c.name === name)}
                          onSave={
                            onUpdateCell
                              ? (value) => onUpdateCell(row, name, value)
                              : undefined
                          }
                          disabled={busy}
                          onStatus={setStatus}
                        />
                      </td>
                    ))}
                    <td className="row-actions">
                      {deleting === keyFor(row, index) ? (
                        <div className="flex items-center gap-1">
                          <button
                            className="text-button danger"
                            aria-label="Confirm delete"
                            disabled={deletePending || busy}
                            onClick={() => void deleteRow(row)}
                          >
                            Delete?
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Cancel delete"
                            disabled={deletePending}
                            onClick={() => {
                              setDeleting(null);
                              setDeleteError("");
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <button
                            className="icon-button quiet"
                            aria-label="Inspect row"
                            onClick={() => setSelected(row)}
                          >
                            <PanelRight size={14} />
                          </button>
                          {onDeleteRow && (
                            <button
                              className="icon-button quiet"
                              aria-label="Delete row"
                              disabled={busy}
                              onClick={() => {
                                setDeleting(keyFor(row, index));
                                setDeleteError("");
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                      {deleting === keyFor(row, index) && deleteError && (
                        <p className="inline-error" role="alert">
                          {deleteError}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {!rows.length && (
            <div className="empty-state">
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Loading…
                </>
              ) : response?.error ? (
                "Adjust the query or filters and try again."
              ) : response?.rows_affected != null && !allColumns.length ? (
                `${response.rows_affected} row${response.rows_affected === 1 ? "" : "s"} affected`
              ) : (
                (emptyMessage ??
                (response ? "No matching rows" : "Run a query to see results."))
              )}
            </div>
          )}
        </div>
        {inspectorRow && (
          <aside
            className="row-inspector"
            aria-label="Row inspector"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
            }}
          >
            <div className="toolbar justify-between">
              <strong className="font-medium">Row details</strong>
              <div className="flex">
                <button
                  className="icon-button"
                  aria-label="Copy row as JSON"
                  onClick={() =>
                    void copy(JSON.stringify(inspectorRow, null, 2))
                  }
                >
                  <Copy size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Close row inspector"
                  autoFocus
                  onClick={() => setSelected(null)}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-3 space-y-4">
              {allColumns.map((name) => (
                <div key={name}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="font-medium">{name}</span>
                    <span className="muted text-xs">
                      {columnsInfo.find((c) => c.name === name)?.type}
                    </span>
                  </div>
                  <EditableValue
                    value={inspectorRow[name]}
                    column={columnsInfo.find((c) => c.name === name)}
                    detail
                    onSave={
                      onUpdateCell
                        ? (value) => onUpdateCell(inspectorRow, name, value)
                        : undefined
                    }
                    disabled={busy}
                    onStatus={setStatus}
                  />
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
      <div className="results-footer">
        <span className="muted" role="status">
          {isLoading
            ? "Loading…"
            : status ||
              `${rows.length.toLocaleString()} rows${duration ? ` · ${Math.round(duration)} ms` : ""}`}
        </span>
        {allColumns.length > 0 && (
          <>
            <details className="inline-menu">
              <summary className="text-button">
                <Columns3 size={13} />
                Columns
                <ChevronDown size={11} />
              </summary>
              <div className="menu-popover above">
                {allColumns.map((name) => (
                  <label key={name} className="inline-check">
                    <input
                      type="checkbox"
                      checked={!hidden.includes(name)}
                      disabled={!hidden.includes(name) && columns.length === 1}
                      onChange={() =>
                        setHidden((current) =>
                          current.includes(name)
                            ? current.filter((c) => c !== name)
                            : [...current, name],
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </details>
            <button
              className="text-button"
              title="Export the loaded rows"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([csv(allColumns, rows)], {
                    type: "text/csv;charset=utf-8;",
                  }),
                );
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${tableName ?? "results"}.csv`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={13} />
              Export page
            </button>
            <button
              className="icon-button"
              aria-label="Copy rows as TSV"
              onClick={() =>
                void copy(
                  [
                    allColumns.join("\t"),
                    ...rows.map((row) =>
                      allColumns
                        .map((c) =>
                          displayValue(row[c]).replace(/[\t\r\n]/g, " "),
                        )
                        .join("\t"),
                    ),
                  ].join("\n"),
                )
              }
            >
              <Copy size={13} />
            </button>
          </>
        )}
        {response?.truncated && (
          <span className="muted">Result limit reached</span>
        )}
        {footer}
      </div>
    </section>
  );
}
