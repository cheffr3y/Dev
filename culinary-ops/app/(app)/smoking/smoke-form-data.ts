export type Payload = Record<string, unknown>;
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const num = (f: FormData, k: string) =>
  str(f, k) === "" ? null : Number(str(f, k));
export function measure(f: FormData, key: string) {
  const n = num(f, `${key}Qty`);
  return n === null ? null : { quantity: n, unit: str(f, `${key}Unit`) };
}
