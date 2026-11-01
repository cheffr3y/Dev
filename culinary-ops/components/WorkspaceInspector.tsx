"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InspectorContext, type InspectorTarget } from "./InspectorLink";
import { RecipeDossier, type DossierRecipe } from "./RecipeDossier";
import { InlineCell } from "./InlineCell";
import { CatalogCell, catalogColumns } from "./CatalogCells";
import { Button } from "./ui";
import { money, num } from "@/lib/costing";
import type { CatalogItem } from "@/lib/workspace-options";
import { AllergenBadges } from "./AllergenBadges";

type InspectorData = { kind: "item"; canEdit: boolean; item: CatalogItem; vendors: { id: string; name: string }[] } | {
  kind: "recipe"; canEdit: boolean; totalCost: number; allergenKeys: string[];
  recipe: DossierRecipe & {
    items: { id: string; quantity: number; unit: string; note: string | null; groupName: string | null; sortOrder: number; item: CatalogItem }[];
    components: { id: string; childId: string; quantity: number; unit: string; note: string | null; child: { name: string } }[];
  };
};
export function WorkspaceInspector({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<InspectorTarget[]>([]), [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{ key: string; data?: InspectorData; error?: string } | null>(null);
  const [closeError, setCloseError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null), mounted = useRef(true);
  const router = useRouter();
  const target = stack.at(-1), resourceKey = target ? `${target.kind}:${target.id}` : "", key = `${resourceKey}:${revision}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!resourceKey || !target) return;
    const controller = new AbortController();
    fetch(`/api/workspace?${new URLSearchParams(target)}`, { signal: controller.signal }).then(async result => {
      const value = await result.json();
      if (!controller.signal.aborted) setResponse(result.ok ? { key: resourceKey, data: value } : { key: resourceKey, error: value.error || "Unable to open this record." });
    }).catch(error => { if (error.name !== "AbortError") setResponse({ key: resourceKey, error: "Connection interrupted. Retry to open this record." }); });
    return () => controller.abort();
  }, [key, target, resourceKey]);
  useEffect(() => {
    if (!target) return;
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [target]);
  function close() {
    dialog.current?.close(); setStack([]); setCloseError(""); opener.current?.focus({ preventScroll: true });
  }
  function afterSaved() { setRevision(value => value + 1); router.refresh(); }
  function navigate(next: InspectorTarget, element?: HTMLElement) {
    if (dialog.current?.querySelector('[data-unsaved="true"], [aria-busy="true"], [aria-invalid="true"]')) { setCloseError("Save or discard the current edit before opening another record."); return; }
    if (!target) opener.current = element ?? null;
    setCloseError(""); setStack(previous => [...previous, next]);
  }
  function requestClose(back = false) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    let attempts = 0;
    const finish = () => {
      if (!mounted.current) return;
      if (dialog.current?.querySelector('[aria-busy="true"], input[readonly]') && attempts++ < 100) { setTimeout(finish, 100); return; }
      if (dialog.current?.querySelector('[data-unsaved="true"], [aria-busy="true"], [aria-invalid="true"]')) { setCloseError("Some edits have not saved. Retry the edit, use the latest value, or discard and close."); return; }
      setCloseError(""); if (back) setStack(previous => previous.slice(0, -1)); else close();
    };
    setTimeout(finish, 0);
  }
  const data = response?.key === resourceKey ? response.data : null, error = response?.key === resourceKey ? response.error : null;
  return <InspectorContext.Provider value={navigate}>{children}
    {target && <dialog ref={dialog} aria-labelledby="inspector-title" className="workspace-inspector no-print fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-dvh w-full max-w-3xl border-l border-hairline bg-canvas p-0 text-ink shadow-2xl" onCancel={event => { event.preventDefault(); requestClose(); }} onClick={event => { if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) requestClose(); }}>
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-hairline bg-canvas px-5 py-4">
        <div><p className="text-xs text-zinc-500">{target.kind === "item" ? "Ingredient inspector" : "Recipe inspector"}</p><h2 id="inspector-title" className="font-semibold">{data?.kind === "recipe" ? data.recipe.name : data?.kind === "item" ? data.item.name : "Inspect record"}</h2></div>
        <div className="flex gap-2">{stack.length > 1 && <Button variant="secondary" onClick={() => requestClose(true)}>Back</Button>}<Button variant="secondary" onClick={() => requestClose()}>Close inspector</Button></div>
      </div>
      {closeError && <div className="border-b border-red-500 p-4 text-sm"><p role="alert">{closeError}</p><button className="mt-2 text-red-600 underline" onClick={close}>Discard unsaved edits and close</button></div>}
      <div className="space-y-5 p-5">
        {error ? <div role="alert"><p>{error}</p><Button onClick={() => setRevision(value => value + 1)}>Retry</Button></div> : !data ? <p role="status">Loading record…</p> : data.kind === "item" ? <>
          <p className="text-sm text-zinc-500">{data.item.category} · Shared ingredient. Price is per cost unit; pack size is descriptive.</p><AllergenBadges allergens={data.item.allergens} />
          <div key={data.item.id} data-edit-grid className="grid grid-cols-2 gap-4">{catalogColumns.map(([field, label]) => <div key={`${data.item.id}:${field}`}><p className="mb-1 text-xs text-zinc-500">{label}</p>{data.canEdit ? <CatalogCell item={data.item} field={field} vendors={data.vendors} onSaved={afterSaved} /> : <p>{field === "vendorId" ? data.vendors.find(vendor => vendor.id === data.item.vendorId)?.name ?? "—" : data.item[field] ?? "—"}</p>}</div>)}</div>
        </> : <>
          <p className="text-sm text-zinc-500">Standard batch cost <strong className="tabular-nums">{money(data.totalCost, 5)}</strong> · <span className="tabular-nums">{money(data.totalCost / data.recipe.yieldQty, 5)} / {data.recipe.yieldUnit}</span></p>
          {data.canEdit ? <div key={data.recipe.id} data-edit-grid className="grid grid-cols-2 gap-4 rounded border border-hairline p-3"><div><p className="text-xs text-zinc-500">Standard yield quantity</p><InlineCell entity="recipe" id={data.recipe.id} field="yieldQty" value={data.recipe.yieldQty} label="Standard yield quantity" onSaved={afterSaved} /></div><div><p className="text-xs text-zinc-500">Standard yield unit</p><InlineCell entity="recipe" id={data.recipe.id} field="yieldUnit" value={data.recipe.yieldUnit} label="Standard yield unit" onSaved={afterSaved} /></div><p className="col-span-2 text-xs text-zinc-500">Updates the shared recipe and its cost per yield unit. Ingredient quantities stay as entered.</p></div> : <p>Yield: {num(data.recipe.yieldQty)} {data.recipe.yieldUnit}</p>}
          <div className="inspector-dossier"><RecipeDossier recipe={data.recipe} scale={1} allergenKeys={data.allergenKeys} lines={[
            ...data.recipe.items.map(line => ({ ...line, name: line.item.name, category: line.item.category, reference: { kind: "item" as const, id: line.item.id } })),
            ...data.recipe.components.map(line => ({ ...line, name: line.child.name, subRecipe: true, reference: { kind: "recipe" as const, id: line.childId } })),
          ]} /></div>
          <p className="text-xs text-zinc-500">Select an ingredient or sub-recipe in the card to inspect it here.</p>
        </>}
        {data && <Link href={`/${data.kind === "recipe" ? "recipes" : "items"}/${target.id}`} target="_blank" rel="noreferrer" className="inline-block text-sm text-blue-600 underline">Open full details in a new tab ↗</Link>}
      </div>
    </dialog>}
  </InspectorContext.Provider>;
}
