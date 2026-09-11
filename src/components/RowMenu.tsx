import { useRef, type ReactNode } from "react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  MenuSeparator,
} from "@headlessui/react";
import { MoreHorizontal } from "lucide-react";

interface RowAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function RowMenu({
  label,
  className,
  children,
  items,
}: {
  label: string;
  className: string;
  children: ReactNode;
  items: (RowAction | null)[];
}) {
  const button = useRef<HTMLButtonElement>(null);
  const open = () => {
    if (button.current?.getAttribute("aria-expanded") !== "true")
      button.current?.click();
  };
  return (
    <Menu
      as="div"
      className={className}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
      onKeyDown={(event) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          event.stopPropagation();
          open();
        }
      }}
    >
      {children}
      <MenuButton
        ref={button}
        className="icon-button row-menu-trigger"
        aria-label={label}
        title={label}
      >
        <MoreHorizontal size={14} />
      </MenuButton>
      <MenuItems
        anchor={{ to: "bottom end", gap: 4, padding: 8 }}
        portal
        modal={false}
        className="context-menu"
        onKeyDown={(event) => event.stopPropagation()}
      >
        {items.map((item, index) =>
          item ? (
            <MenuItem key={item.label} disabled={item.disabled}>
              <button
                className={item.danger ? "danger" : ""}
                onClick={item.onSelect}
              >
                {item.icon}
                {item.label}
              </button>
            </MenuItem>
          ) : (
            <MenuSeparator
              key={`separator-${index}`}
              className="menu-separator"
            />
          ),
        )}
      </MenuItems>
    </Menu>
  );
}
