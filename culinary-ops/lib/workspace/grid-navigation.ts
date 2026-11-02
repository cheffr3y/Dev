export type GridPosition = { row: string; column: string };
export type GridKey = "Tab" | "Enter" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function gridTarget(cells: GridPosition[], index: number, key: GridKey, shift = false): number | null {
  const current = cells[index];
  if (!current) return null;
  if (key === "Tab") {
    const next = index + (shift ? -1 : 1);
    return cells[next] ? next : null;
  }
  const vertical = ["Enter", "ArrowUp", "ArrowDown"].includes(key);
  const direction = key === "ArrowUp" || key === "ArrowLeft" || (key === "Enter" && shift) ? -1 : 1;
  for (let next = index + direction; next >= 0 && next < cells.length; next += direction) {
    if (vertical ? cells[next].row !== current.row && cells[next].column === current.column : cells[next].row === current.row) return next;
  }
  return null;
}

export type GridInput = HTMLInputElement | HTMLSelectElement;
type NavigationEvent = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; nativeEvent?: { isComposing?: boolean } };

// Preserve text-caret movement inside a value and native select choices. A full
// selection (the normal cell-entry state) uses arrows to navigate immediately.
export function gridNavigation(grid: Element, current: GridInput, event: NavigationEvent) {
  if (event.nativeEvent?.isComposing || event.ctrlKey || event.metaKey) return null;
  if (!["Tab", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return null;
  const arrow = event.key.startsWith("Arrow");
  if (current instanceof HTMLSelectElement && arrow && !event.altKey) return null;
  if (event.altKey && !(current instanceof HTMLSelectElement && arrow)) return null;
  if (current instanceof HTMLInputElement && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    const { selectionStart: start, selectionEnd: end } = current;
    const selectedAll = start === 0 && end === current.value.length;
    if (start !== null && end !== null && !selectedAll &&
        (event.key === "ArrowLeft" ? start !== 0 || end !== 0 : end !== current.value.length || start !== end)) return null;
  }
  const cells = [...grid.querySelectorAll<GridInput>("[data-grid-cell]")].filter(cell =>
    cell.closest("[data-edit-grid], [data-worksheet-grid]") === grid && !cell.matches(":disabled") && !cell.closest("details:not([open])") && cell.getClientRects().length > 0);
  const rows = new Map<Element, string>();
  const positions = cells.map(cell => {
    const tr = cell.closest("tr");
    if (tr && !rows.has(tr)) rows.set(tr, `table-row-${rows.size}`);
    return { row: tr ? rows.get(tr)! : cell.dataset.gridRow ?? "row", column: cell.dataset.gridColumn ?? "" };
  });
  const index = cells.indexOf(current);
  if (index < 0) return null;
  const target = gridTarget(positions, index, event.key as GridKey, event.shiftKey);
  return { target: target === null ? null : cells[target], preventDefault: target !== null || event.key !== "Tab" };
}
