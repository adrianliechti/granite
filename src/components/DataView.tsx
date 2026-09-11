import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Filter,
  Plus,
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Code2,
  Loader2,
} from "lucide-react";
import {
  getAdapter,
  executeQuery,
  executeStatement,
  listColumns,
  parameterPlaceholder,
  primaryKeyPredicate,
  type ColumnInfo,
} from "../lib/adapters";
import {
  buildDataQuery,
  buildInsert,
  editableColumn,
  inputValue,
  emptyFilters,
  operatorLabels,
  operatorsFor,
  parseCellValue,
  type DataFilters,
  type FilterRule,
  type DataSort,
} from "../lib/data";
import { usePreference } from "../lib/preferences";
import type { Connection } from "../types";
import { ResultsTable, ValueInput } from "./ResultsTable";

async function loadRecords(
  connection: string,
  query: string,
  database: string | undefined,
  params: unknown[],
  signal: AbortSignal,
) {
  const start = performance.now();
  const response = await executeQuery(
    connection,
    query,
    database,
    params,
    signal,
  );
  return { response, duration: performance.now() - start };
}

function FilterBar({
  columns,
  initial,
  onApply,
}: {
  columns: ColumnInfo[];
  initial: DataFilters;
  onApply: (filters: DataFilters) => void;
}) {
  const [draft, setDraft] = useState(initial),
    [expanded, setExpanded] = useState(initial.rules.length > 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const update = (id: string, patch: Partial<FilterRule>) =>
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const add = () => {
    const column = columns[0];
    if (column) {
      setExpanded(true);
      setDraft((current) => ({
        ...current,
        rules: [
          ...current.rules,
          {
            id: crypto.randomUUID(),
            column: column.name,
            operator: operatorsFor(column)[0],
            value: "",
            second: "",
          },
        ],
      }));
    }
  };
  return (
    <form
      className="filter-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="toolbar border-0 flex-wrap">
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search text columns"
            placeholder="Search text columns…"
            value={draft.search}
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
          />
        </label>
        <button
          type="button"
          className={`text-button ${expanded ? "active" : ""}`}
          aria-expanded={expanded}
          onClick={() => {
            if (!expanded && !draft.rules.length) add();
            else setExpanded(!expanded);
          }}
        >
          <Filter size={14} />
          Filter
          {initial.rules.length > 0 && (
            <span className="count">{initial.rules.length}</span>
          )}
        </button>
        {(dirty || initial.search || initial.rules.length > 0) && (
          <>
            <button className="text-button" type="submit" disabled={!dirty}>
              Apply
            </button>
            <button
              className="text-button muted"
              type="button"
              onClick={() => {
                setDraft(emptyFilters);
                onApply(emptyFilters);
              }}
            >
              Clear
            </button>
          </>
        )}
        {!dirty && (initial.search || initial.rules.length > 0) && (
          <span className="muted text-xs">Filtered in database</span>
        )}
        {dirty && <span className="muted text-xs">Unapplied changes</span>}
      </div>
      {expanded && (
        <div className="filter-rules">
          <div className="flex items-center gap-3 mb-2">
            <label className="inline-check">
              Match
              <select
                className="inline-select"
                aria-label="Filter match"
                value={draft.match}
                onChange={(e) =>
                  setDraft({ ...draft, match: e.target.value as "all" | "any" })
                }
              >
                <option value="all">all conditions</option>
                <option value="any">any condition</option>
              </select>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={draft.caseSensitive}
                onChange={(e) =>
                  setDraft({ ...draft, caseSensitive: e.target.checked })
                }
              />
              Case sensitive
            </label>
          </div>
          {draft.rules.map((rule, index) => {
            const column = columns.find((c) => c.name === rule.column);
            const noValue = ["null", "notNull", "empty", "notEmpty"].includes(
              rule.operator,
            );
            const list = ["in", "notIn"].includes(rule.operator);
            return (
              <div key={rule.id} className="filter-rule">
                <select
                  className="field"
                  aria-label={`Filter column ${index + 1}`}
                  value={rule.column}
                  onChange={(e) =>
                    update(rule.id, {
                      column: e.target.value,
                      operator: operatorsFor(
                        columns.find((c) => c.name === e.target.value),
                      )[0],
                      value: "",
                      second: "",
                    })
                  }
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="field"
                  aria-label={`Filter operator ${index + 1}`}
                  value={rule.operator}
                  onChange={(e) =>
                    update(rule.id, {
                      operator: e.target.value as FilterRule["operator"],
                    })
                  }
                >
                  {operatorsFor(column).map((op) => (
                    <option key={op} value={op}>
                      {operatorLabels[op]}
                    </option>
                  ))}
                </select>
                {!noValue &&
                  (list ? (
                    <input
                      className="field"
                      aria-label={`Filter value ${index + 1}`}
                      placeholder={'a, b, c or ["a,b", "c"]'}
                      value={rule.value}
                      onChange={(e) =>
                        update(rule.id, { value: e.target.value })
                      }
                    />
                  ) : (
                    <ValueInput
                      label={`Filter value ${index + 1}`}
                      value={rule.value}
                      column={column}
                      onChange={(value) => update(rule.id, { value })}
                    />
                  ))}
                {rule.operator === "between" && (
                  <>
                    <span className="muted">and</span>
                    <ValueInput
                      label={`Filter end value ${index + 1}`}
                      value={rule.second}
                      column={column}
                      onChange={(second) => update(rule.id, { second })}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove filter ${index + 1}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      rules: draft.rules.filter((r) => r.id !== rule.id),
                    })
                  }
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <button type="button" className="text-button mt-1" onClick={add}>
            <Plus size={13} />
            Add condition
          </button>
        </div>
      )}
    </form>
  );
}
function InsertRow({
  columns,
  onInsert,
  onClose,
}: {
  columns: ColumnInfo[];
  onInsert: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<
    Record<string, { mode: string; value: string }>
  >({});
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const update = (
    name: string,
    patch: Partial<{ mode: string; value: string }>,
  ) =>
    setValues((current) => ({
      ...current,
      [name]: {
        ...(current[name] ?? { mode: "default", value: "" }),
        ...patch,
      },
    }));
  const submit = async () => {
    setPending(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const column of columns) {
        const field = values[column.name];
        if (field && field.mode !== "default")
          payload[column.name] =
            field.mode === "null" ? null : parseCellValue(field.value, column);
      }
      await onInsert(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insert failed");
    } finally {
      setPending(false);
    }
  };
  return (
    <aside
      className="row-inspector"
      aria-label="New row"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onClose();
      }}
    >
      <div className="toolbar justify-between">
        <strong className="font-medium">New row</strong>
        <button
          className="icon-button"
          aria-label="Close new row"
          autoFocus
          onClick={onClose}
          disabled={pending}
        >
          <X size={15} />
        </button>
      </div>
      <form
        className="flex flex-col min-h-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset
          disabled={pending}
          className="overflow-auto flex-1 p-3 space-y-3"
        >
          <p className="muted text-xs">Leave generated columns on Default.</p>
          {columns.map((column) => (
            <div key={column.name}>
              <div className="flex justify-between items-center gap-2 mb-1">
                <label
                  htmlFor={`insert-mode-${column.name}`}
                  className="truncate font-medium"
                >
                  {column.name}
                  <span className="muted text-xs ml-2">{column.type}</span>
                </label>
                <select
                  id={`insert-mode-${column.name}`}
                  aria-label={`Value mode for ${column.name}`}
                  className="inline-select"
                  value={values[column.name]?.mode ?? "default"}
                  onChange={(e) =>
                    update(column.name, { mode: e.target.value })
                  }
                >
                  <option value="default">Default</option>
                  <option value="value" disabled={!editableColumn(column)}>
                    Value{!editableColumn(column) ? " · use SQL" : ""}
                  </option>
                  {column.nullable && <option value="null">NULL</option>}
                </select>
              </div>
              {values[column.name]?.mode === "value" && (
                <ValueInput
                  label={`New ${column.name}`}
                  value={values[column.name]?.value ?? ""}
                  column={column}
                  onChange={(value) => update(column.name, { value })}
                />
              )}
            </div>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <div className="toolbar justify-end">
          <button
            className="text-button"
            type="button"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button className="button" disabled={pending}>
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Insert row
          </button>
        </div>
      </form>
    </aside>
  );
}
export function DataView({
  connection,
  database,
  table,
  onOpenSQL,
}: {
  connection: Connection;
  database?: string;
  table: string;
  onOpenSQL: (sql: string) => void;
}) {
  const driver = connection.sql!.driver,
    adapter = getAdapter(driver),
    queryClient = useQueryClient();
  const scope = `${connection.id}:${database ?? ""}:${table}`;
  const [filters, setFilters] = usePreference<DataFilters>(
    `filters:${scope}`,
    emptyFilters,
  );
  const [sorting, setSorting] = usePreference<DataSort[]>(`sort:${scope}`, []);
  const [pageSize, setPageSize] = usePreference("page-size", 100),
    [page, setPage] = useState(0);
  const [inserting, setInserting] = useState(false),
    [busy, setBusy] = useState(false);
  const [countState, setCountState] = useState<{
      key: string;
      count: string;
    } | null>(null),
    [counting, setCounting] = useState(false),
    [countError, setCountError] = useState("");
  const metadata = useQuery({
    queryKey: ["table-columns", connection.id, database, table],
    queryFn: () => listColumns(connection.id, driver, table, database),
    staleTime: 300_000,
  });
  const columns = metadata.data ?? [];
  let query: ReturnType<typeof buildDataQuery> | undefined,
    filterError = "";
  try {
    if (columns.length)
      query = buildDataQuery(
        adapter,
        table,
        columns,
        filters,
        sorting,
        page,
        pageSize,
      );
  } catch (err) {
    filterError = err instanceof Error ? err.message : "Invalid filter";
  }
  const records = useQuery({
    queryKey: [
      "records",
      connection.id,
      database,
      table,
      query?.query,
      query?.params,
    ],
    enabled: !!query,
    queryFn: ({ signal }) =>
      loadRecords(connection.id, query!.query, database, query!.params, signal),
    retry: false,
  });
  const response = records.data?.response,
    hasMore = (response?.rows?.length ?? 0) > pageSize;
  const countKey = JSON.stringify([query?.countQuery, query?.params]);
  const keys = columns.filter((c) => c.primaryKey);
  const error =
    metadata.error?.message || filterError || records.error?.message;
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["records", connection.id, database, table],
    });
  const mutate = async (query: string, params: unknown[]) => {
    setBusy(true);
    try {
      const result = await executeStatement(
        connection.id,
        query,
        database,
        params,
      );
      if (result.rows_affected === 0 && /^UPDATE|^DELETE/.test(query))
        throw new Error("This row no longer exists. Refresh the table.");
      setCountState(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const predicate = (row: Record<string, unknown>, offset = 1) => {
    const typed = { ...row };
    for (const column of keys)
      if (typed[column.name] != null)
        typed[column.name] = parseCellValue(
          inputValue(typed[column.name], column),
          column,
        );
    const key = primaryKeyPredicate(adapter, columns, typed, offset);
    if (!key) throw new Error("The primary key is missing. Refresh the table.");
    return key;
  };
  return (
    <div className="panel flex flex-col min-h-0 flex-1">
      <div className="flex items-center border-b border-(--border)">
        <div className="flex-1 min-w-0">
          <FilterBar
            key={scope}
            columns={columns}
            initial={filters}
            onApply={(next) => {
              setFilters(next);
              setPage(0);
              setCountError("");
            }}
          />
        </div>
        <div className="flex items-center gap-1 pr-2 self-start pt-2">
          <button
            className="icon-button"
            aria-label="Refresh data"
            disabled={records.isFetching || busy}
            onClick={() => {
              setCountState(null);
              void refresh();
            }}
          >
            <RefreshCw
              size={14}
              className={records.isFetching ? "animate-spin" : ""}
            />
          </button>
          <button
            className="icon-button"
            aria-label="Open table SQL"
            disabled={!columns.length}
            onClick={() => onOpenSQL(adapter.selectAllQuery(table, pageSize))}
          >
            <Code2 size={15} />
          </button>
          <button
            className="text-button whitespace-nowrap"
            disabled={!columns.length || busy}
            onClick={() => setInserting(!inserting)}
          >
            <Plus size={14} />
            New row
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 relative">
        <ResultsTable
          preferenceKey={scope}
          tableName={table}
          columnsInfo={columns}
          isLoading={metadata.isPending || records.isFetching}
          busy={busy}
          response={
            error
              ? { ...response, error }
              : response
                ? { ...response, rows: response.rows?.slice(0, pageSize) }
                : null
          }
          duration={records.data?.duration}
          sorting={sorting}
          onSort={(next) => {
            setSorting(next);
            setPage(0);
          }}
          rowKey={
            keys.length
              ? (row) => JSON.stringify(keys.map((c) => row[c.name]))
              : undefined
          }
          onUpdateCell={
            keys.length
              ? async (row, name, value) => {
                  const key = predicate(row, 2);
                  await mutate(
                    `UPDATE ${adapter.quoteIdentifier(table)} SET ${adapter.quoteIdentifier(name)} = ${parameterPlaceholder(
                      driver,
                      1,
                      columns.find((column) => column.name === name),
                    )} WHERE ${key.clause}`,
                    [value, ...key.params],
                  );
                }
              : undefined
          }
          onDeleteRow={
            keys.length
              ? async (row) => {
                  const key = predicate(row);
                  await mutate(
                    `DELETE FROM ${adapter.quoteIdentifier(table)} WHERE ${key.clause}`,
                    key.params,
                  );
                }
              : undefined
          }
          emptyMessage={
            page > 0
              ? "No rows on this page. Go to the previous page or refresh."
              : "No matching rows"
          }
          footer={
            <div className="pagination">
              {!keys.length && columns.length > 0 && (
                <span
                  className="muted hidden xl:inline"
                  title="Editing and deleting require a primary key to identify one row."
                >
                  No primary key
                </span>
              )}
              <button
                className="text-button"
                disabled={!query || counting || !!error}
                title={countError || "Count all matching rows"}
                onClick={async () => {
                  if (!query) return;
                  setCounting(true);
                  setCountError("");
                  try {
                    const result = await executeQuery(
                      connection.id,
                      query.countQuery,
                      database,
                      query.params,
                    );
                    setCountState({
                      key: countKey,
                      count: String(
                        Object.values(result.rows?.[0] ?? {})[0] ?? 0,
                      ),
                    });
                  } catch (err) {
                    setCountError(
                      err instanceof Error ? err.message : "Count failed",
                    );
                  } finally {
                    setCounting(false);
                  }
                }}
              >
                {counting
                  ? "Counting…"
                  : countError
                    ? "Retry count"
                    : countState?.key === countKey
                      ? `${countState.count} total`
                      : "Count rows"}
              </button>
              <label className="inline-check">
                <span className="sr-only">Rows per page</span>
                <select
                  className="inline-select"
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {[25, 50, 100, 250, 500].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </label>
              <span
                className="tabular-nums whitespace-nowrap"
                aria-live="polite"
              >
                {response?.rows?.length
                  ? `${page * pageSize + 1}–${page * pageSize + Math.min(response.rows.length, pageSize)}`
                  : "0"}
              </span>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page === 0 || records.isFetching || busy}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={!hasMore || records.isFetching || busy || !!error}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          }
        />
        {inserting && (
          <InsertRow
            columns={columns}
            onClose={() => setInserting(false)}
            onInsert={async (values) => {
              const insert = buildInsert(adapter, table, columns, values);
              await mutate(insert.query, insert.params);
            }}
          />
        )}
      </div>
      {countError && (
        <div role="alert" className="error-banner">
          Count failed: {countError}
        </div>
      )}
    </div>
  );
}
