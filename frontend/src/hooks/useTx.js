import { useState, useCallback } from "react";
import { friendlyError } from "../lib/contract";

export function useTx(notify, refresh) {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (label, fn) => {
      setPending(true);
      try {
        notify(`${label}: submitting…`, "info");
        const tx = await fn();
        notify(`${label}: waiting for confirmation…`, "info");
        await tx.wait();
        notify(`${label}: confirmed ✓`, "success");
        await refresh?.();
        return true;
      } catch (err) {
        notify(`${label} failed — ${friendlyError(err)}`, "error");
        return false;
      } finally {
        setPending(false);
      }
    },
    [notify, refresh]
  );

  return { run, pending };
}
