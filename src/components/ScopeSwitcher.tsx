import { ChevronDown } from "lucide-react";

// A breadcrumb for a database, catalog, or schema: the name goes to that level,
// the chevron switches to a sibling. The menu is a native select, so it looks
// native in the desktop shells too.
export function ScopeSwitcher({
  label,
  value,
  options,
  defaultOption,
  placeholder,
  title,
  onOpen,
  onChange,
}: {
  label: string;
  value?: string;
  options?: string[];
  defaultOption?: string;
  placeholder?: string;
  title?: string;
  onOpen: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <span className="scope-switcher" title={title}>
      {value ? (
        <button onClick={onOpen}>{value}</button>
      ) : (
        <span className="muted">{placeholder ?? label}</span>
      )}
      <span className="scope-switcher-menu">
        <ChevronDown size={12} aria-hidden="true" />
        <select
          aria-label={`Switch ${label.toLowerCase()}`}
          value={value ?? ""}
          disabled={!options?.length}
          onChange={(event) => onChange(event.target.value)}
        >
          {!value && (
            <option value="" disabled>
              {placeholder ?? label}
            </option>
          )}
          {value && !options?.includes(value) && <option value={value}>{value}</option>}
          {options?.map((name) => (
            <option key={name} value={name}>
              {name === defaultOption ? `${name} (default)` : name}
            </option>
          ))}
        </select>
      </span>
    </span>
  );
}
