import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

type CleanupRecord = {
  signature: string;
  cleanup: () => void;
};

type PanelRule = {
  selector: string;
  ruleKey: string;
  minLeft: number;
  minRight: number;
};

const TABLE_STORAGE_PREFIX = "kikit:layout:table";
const PANEL_STORAGE_PREFIX = "kikit:layout:panel";
const MIN_TABLE_COLUMN_WIDTH = 72;
const MOBILE_LAYOUT_QUERY = "(max-width: 900px)";

const PANEL_RULES: PanelRule[] = [
  { selector: ".section-layout", ruleKey: "section-layout", minLeft: 240, minRight: 420 },
  { selector: ".settings-grid", ruleKey: "settings-grid", minLeft: 220, minRight: 320 },
  { selector: ".split", ruleKey: "split", minLeft: 260, minRight: 260 },
  { selector: ".detail-columns", ruleKey: "detail-columns", minLeft: 280, minRight: 280 },
  { selector: ".explorer-layout", ruleKey: "explorer-layout", minLeft: 520, minRight: 340 },
  { selector: ".editor-layout", ruleKey: "editor-layout", minLeft: 520, minRight: 360 },
];

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hashValue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function buildRouteKey(location: string) {
  const normalized = location.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  return normalized || "root";
}

function isHTMLElement(value: Element | ChildNode | null | undefined): value is HTMLElement {
  return value instanceof HTMLElement;
}

function readStoredArray(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredArray(key: string, value: number[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function readStoredNumber(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function getTableHeaderCells(table: HTMLTableElement) {
  const headerRow = table.tHead?.rows[0] ?? table.rows[0] ?? null;
  if (!headerRow) {
    return [];
  }

  return Array.from(headerRow.cells).filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
  );
}

function getTableHeaderLabels(table: HTMLTableElement) {
  return getTableHeaderCells(table).map((cell, index) => {
    const label =
      collapseWhitespace(cell.getAttribute("data-resize-label") ?? "") ||
      collapseWhitespace(cell.textContent ?? "");

    return label || `column-${index + 1}`;
  });
}

function getTableSignature(table: HTMLTableElement) {
  const labels = getTableHeaderLabels(table);
  return `${labels.length}:${labels.join("|")}`;
}

function getTableStorageKey(routeKey: string, table: HTMLTableElement, occurrence: number) {
  const manualKey = collapseWhitespace(table.dataset.resizeKey ?? "");
  if (manualKey) {
    return `${TABLE_STORAGE_PREFIX}:${routeKey}:${manualKey}`;
  }

  return `${TABLE_STORAGE_PREFIX}:${routeKey}:table:${hashValue(getTableSignature(table))}:${occurrence}`;
}

function getPanelStorageKey(
  routeKey: string,
  element: HTMLElement,
  ruleKey: string,
  occurrence: number,
) {
  const manualKey = collapseWhitespace(element.dataset.layoutKey ?? "");
  if (manualKey) {
    return `${PANEL_STORAGE_PREFIX}:${routeKey}:${manualKey}`;
  }

  return `${PANEL_STORAGE_PREFIX}:${routeKey}:${ruleKey}:${occurrence}`;
}

function clampWidth(value: number, minWidth: number, maxWidth?: number) {
  const normalized = Math.max(minWidth, Math.round(value));
  return typeof maxWidth === "number" && Number.isFinite(maxWidth)
    ? Math.min(normalized, Math.max(minWidth, Math.round(maxWidth)))
    : normalized;
}

function getContainerWidth(element: HTMLElement) {
  return Math.round(element.getBoundingClientRect().width);
}

function getTableViewportWidth(table: HTMLTableElement) {
  const wrapper = table.closest(".table-wrap");
  if (wrapper instanceof HTMLElement) {
    return wrapper.clientWidth;
  }

  return table.parentElement instanceof HTMLElement ? table.parentElement.clientWidth : table.clientWidth;
}

function measureTableWidths(headerCells: HTMLTableCellElement[]) {
  return headerCells.map((cell) =>
    clampWidth(cell.getBoundingClientRect().width || MIN_TABLE_COLUMN_WIDTH, MIN_TABLE_COLUMN_WIDTH),
  );
}

function getGapPx(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const gapValue = styles.columnGap && styles.columnGap !== "normal" ? styles.columnGap : styles.gap;
  const parsed = Number.parseFloat(gapValue);
  return Number.isFinite(parsed) ? parsed : 16;
}

function enhanceTable(table: HTMLTableElement, storageKey: string) {
  const headerCells = getTableHeaderCells(table);
  if (!headerCells.length) {
    return null;
  }

  if (headerCells.some((cell) => cell.colSpan > 1 || cell.rowSpan > 1)) {
    return null;
  }

  const existingWidths = readStoredArray(storageKey);
  let widths =
    existingWidths && existingWidths.length === headerCells.length
      ? existingWidths.map((value, index) =>
          clampWidth(typeof value === "number" ? value : MIN_TABLE_COLUMN_WIDTH, MIN_TABLE_COLUMN_WIDTH),
        )
      : measureTableWidths(headerCells);

  const colgroup = document.createElement("colgroup");
  colgroup.dataset.resizableColgroup = "true";
  const columns = headerCells.map(() => document.createElement("col"));

  for (const column of columns) {
    colgroup.append(column);
  }

  table.insertBefore(colgroup, table.firstChild);
  table.classList.add("table-resizable");

  const handles = headerCells.map((cell, index) => {
    cell.classList.add("table-resizable-header");

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "table-resize-handle";
    handle.tabIndex = -1;
    handle.setAttribute("aria-hidden", "true");
    handle.title = `${collapseWhitespace(cell.textContent ?? `column ${index + 1}`) || `column ${index + 1}`} 너비 조절`;
    cell.append(handle);
    return handle;
  });

  const applyWidths = (nextWidths: number[]) => {
    widths = nextWidths.map((value) => clampWidth(value, MIN_TABLE_COLUMN_WIDTH));

    columns.forEach((column, index) => {
      const width = widths[index] ?? MIN_TABLE_COLUMN_WIDTH;
      column.style.width = `${width}px`;
      column.style.minWidth = `${width}px`;
    });

    const totalWidth = widths.reduce((sum, value) => sum + value, 0);
    const viewportWidth = getTableViewportWidth(table);
    table.style.setProperty("--resizable-table-width", `${Math.max(totalWidth, viewportWidth)}px`);
  };

  const saveWidths = () => {
    writeStoredArray(storageKey, widths);
  };

  const startResize = (event: PointerEvent, columnIndex: number) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = widths[columnIndex] ?? headerCells[columnIndex]?.getBoundingClientRect().width ?? MIN_TABLE_COLUMN_WIDTH;

    document.body.classList.add("layout-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidths = [...widths];
      nextWidths[columnIndex] = clampWidth(
        startWidth + (moveEvent.clientX - startX),
        MIN_TABLE_COLUMN_WIDTH,
      );
      applyWidths(nextWidths);
    };

    const finishResize = () => {
      document.body.classList.remove("layout-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      saveWidths();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  };

  handles.forEach((handle, index) => {
    handle.addEventListener("pointerdown", (event) => startResize(event, index));
    handle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  const resizeObserver = new ResizeObserver(() => {
    applyWidths(widths);
  });
  resizeObserver.observe(table.closest(".table-wrap") instanceof HTMLElement ? (table.closest(".table-wrap") as HTMLElement) : table);

  const initialWidths =
    existingWidths && existingWidths.length === headerCells.length ? widths : measureTableWidths(headerCells);
  applyWidths(initialWidths);

  return () => {
    resizeObserver.disconnect();
    table.classList.remove("table-resizable");
    table.style.removeProperty("--resizable-table-width");
    colgroup.remove();

    headerCells.forEach((cell) => {
      cell.classList.remove("table-resizable-header");
      cell.querySelectorAll(".table-resize-handle").forEach((handle) => handle.remove());
    });
  };
}

function enhancePanel(element: HTMLElement, storageKey: string, rule: PanelRule) {
  const children = Array.from(element.children).filter(isHTMLElement);
  if (children.length < 2) {
    return null;
  }

  const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
  const handle = document.createElement("div");
  handle.className = "layout-resize-handle";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-hidden", "true");

  element.classList.add("layout-resizable");
  element.append(handle);

  const storedWidth = readStoredNumber(storageKey);
  let leftWidth = storedWidth ?? clampWidth(children[0].getBoundingClientRect().width, rule.minLeft);

  const applyLayout = (nextWidth: number, persist = false) => {
    if (mediaQuery.matches) {
      handle.hidden = true;
      element.style.removeProperty("grid-template-columns");
      element.style.removeProperty("--layout-resize-offset");
      return;
    }

    const gapPx = getGapPx(element);
    const containerWidth = getContainerWidth(element);
    const maxLeft = Math.max(rule.minLeft, containerWidth - rule.minRight - gapPx);
    leftWidth = clampWidth(nextWidth, rule.minLeft, maxLeft);

    element.style.gridTemplateColumns = `${leftWidth}px minmax(0, 1fr)`;
    element.style.setProperty("--layout-resize-offset", `${leftWidth + gapPx / 2}px`);
    handle.hidden = false;

    if (persist) {
      writeStoredNumber(storageKey, leftWidth);
    }
  };

  const handleMediaChange = () => {
    applyLayout(leftWidth);
  };

  const startResize = (event: PointerEvent) => {
    if (event.button !== 0 || mediaQuery.matches) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = leftWidth;
    document.body.classList.add("layout-resizing");

    const handleMove = (moveEvent: PointerEvent) => {
      applyLayout(startWidth + (moveEvent.clientX - startX));
    };

    const finishResize = () => {
      document.body.classList.remove("layout-resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      writeStoredNumber(storageKey, leftWidth);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  };

  handle.addEventListener("pointerdown", startResize);

  const resizeObserver = new ResizeObserver(() => {
    applyLayout(leftWidth);
  });
  resizeObserver.observe(element);

  mediaQuery.addEventListener("change", handleMediaChange);
  applyLayout(leftWidth);

  return () => {
    mediaQuery.removeEventListener("change", handleMediaChange);
    resizeObserver.disconnect();
    element.classList.remove("layout-resizable");
    element.style.removeProperty("grid-template-columns");
    element.style.removeProperty("--layout-resize-offset");
    handle.removeEventListener("pointerdown", startResize);
    handle.remove();
  };
}

export function LayoutPersistenceManager(props: { scope: HTMLElement | null }) {
  const [location] = useLocation();
  const tableCleanupRef = useRef(new Map<HTMLTableElement, CleanupRecord>());
  const panelCleanupRef = useRef(new Map<HTMLElement, CleanupRecord>());

  useEffect(() => {
    if (!props.scope) {
      return;
    }

    const scope = props.scope;
    const routeKey = buildRouteKey(location);
    let frameId = 0;

    const syncTables = () => {
      const activeTables = new Set<HTMLTableElement>();
      const occurrenceMap = new Map<string, number>();
      const tables = Array.from(scope.querySelectorAll<HTMLTableElement>("table.table"));

      tables.forEach((table) => {
        const headerCells = getTableHeaderCells(table);
        if (!headerCells.length) {
          return;
        }

        const baseSignature = getTableSignature(table);
        const occurrence = (occurrenceMap.get(baseSignature) ?? 0) + 1;
        occurrenceMap.set(baseSignature, occurrence);

        const signature = `${baseSignature}:${occurrence}`;
        activeTables.add(table);

        const existing = tableCleanupRef.current.get(table);
        const handleCount = table.querySelectorAll(".table-resize-handle").length;
        const hasManagedColgroup = Boolean(table.querySelector('colgroup[data-resizable-colgroup="true"]'));

        if (
          existing &&
          existing.signature === signature &&
          handleCount === headerCells.length &&
          hasManagedColgroup
        ) {
          return;
        }

        existing?.cleanup();
        const cleanup = enhanceTable(table, getTableStorageKey(routeKey, table, occurrence));
        if (cleanup) {
          tableCleanupRef.current.set(table, { signature, cleanup });
        } else {
          tableCleanupRef.current.delete(table);
        }
      });

      Array.from(tableCleanupRef.current.entries()).forEach(([table, record]) => {
        if (!activeTables.has(table) || !table.isConnected) {
          record.cleanup();
          tableCleanupRef.current.delete(table);
        }
      });
    };

    const syncPanels = () => {
      const activePanels = new Set<HTMLElement>();

      PANEL_RULES.forEach((rule) => {
        const occurrenceMap = new Map<string, number>();
        const elements = Array.from(scope.querySelectorAll<HTMLElement>(rule.selector));

        elements.forEach((element) => {
          if (Array.from(element.children).filter(isHTMLElement).length < 2) {
            return;
          }

          const occurrence = (occurrenceMap.get(rule.ruleKey) ?? 0) + 1;
          occurrenceMap.set(rule.ruleKey, occurrence);

          const signature = `${rule.ruleKey}:${occurrence}:${element.children.length}`;
          activePanels.add(element);

          const existing = panelCleanupRef.current.get(element);
          const hasHandle = Boolean(element.querySelector(":scope > .layout-resize-handle"));

          if (existing && existing.signature === signature && hasHandle) {
            return;
          }

          existing?.cleanup();
          const cleanup = enhancePanel(
            element,
            getPanelStorageKey(routeKey, element, rule.ruleKey, occurrence),
            rule,
          );
          if (cleanup) {
            panelCleanupRef.current.set(element, { signature, cleanup });
          } else {
            panelCleanupRef.current.delete(element);
          }
        });
      });

      Array.from(panelCleanupRef.current.entries()).forEach(([element, record]) => {
        if (!activePanels.has(element) || !element.isConnected) {
          record.cleanup();
          panelCleanupRef.current.delete(element);
        }
      });
    };

    const syncAll = () => {
      frameId = 0;
      syncTables();
      syncPanels();
    };

    const scheduleSync = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(syncAll);
    };

    scheduleSync();

    const observer = new MutationObserver(() => {
      scheduleSync();
    });
    observer.observe(scope, { childList: true, subtree: true });

    window.addEventListener("resize", scheduleSync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleSync);

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      Array.from(tableCleanupRef.current.values()).forEach((record) => record.cleanup());
      tableCleanupRef.current.clear();

      Array.from(panelCleanupRef.current.values()).forEach((record) => record.cleanup());
      panelCleanupRef.current.clear();

      document.body.classList.remove("layout-resizing");
    };
  }, [location, props.scope]);

  return null;
}
