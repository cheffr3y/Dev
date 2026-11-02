export type InspectorAddress = { kind: "recipe" | "item"; id: string };

export function inspectorStack(params: Pick<URLSearchParams, "getAll">): InspectorAddress[] {
  return params.getAll("inspect").flatMap(value => {
    const match = /^(recipe|item):(.+)$/.exec(value);
    return match ? [{ kind: match[1] as InspectorAddress["kind"], id: match[2] }] : [];
  });
}

/** Patch only owned keys so filters, document selection and anchors survive. */
export function patchUrl(href: string, values: Record<string, string | string[] | null>): string {
  const url = new URL(href);
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.delete(key);
    for (const item of Array.isArray(value) ? value : value === null ? [] : [value]) {
      if (item) url.searchParams.append(key, item);
    }
  }
  return url.pathname + url.search + url.hash;
}
