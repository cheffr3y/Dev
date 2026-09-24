"use server";
import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/session";
import {
  confirmProduction,
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
  const user = await requireActiveUser("MANAGER");
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
