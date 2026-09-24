"use server";
import { revalidatePath } from "next/cache";
import { requirePrepUser } from "@/lib/prep-session";
import {
  confirmProduction,
  previewProduction,
  recordPickup,
  closeDay,
  completeTransferCost,
  recordReturn,
  correctTransfer,
} from "@/lib/prep-workflow";
export async function submitPrepOperation(
  kind: string,
  key: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePrepUser("ADMIN");
  try {
    switch (kind) {
      case "CONFIRM":
        await confirmProduction(user.id, key, payload);
        break;
      case "PICKUP":
        await recordPickup(user.id, key, payload);
        break;
      case "CLOSE":
        await closeDay(user.id, key, payload);
        break;
      case "COMPLETE":
        await completeTransferCost(user.id, key, payload);
        break;
      case "RETURN":
        await recordReturn(user.id, key, payload);
        break;
      case "CORRECTION":
        await correctTransfer(user.id, key, payload);
        break;
      default:
        throw new Error("Unknown prep action.");
    }
    revalidatePath("/prep-orders", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to save. Retry with the same operation.",
    };
  }
}

export async function previewPrepProduction(payload: unknown) {
  await requirePrepUser("ADMIN");
  try {
    return { ok: true as const, deliveries: await previewProduction(payload) };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Unable to preview costs.",
    };
  }
}
