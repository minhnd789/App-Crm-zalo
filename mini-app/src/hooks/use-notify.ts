import { useMemo } from "react";
import { useSnackbar } from "zmp-ui";
import { errorMessage } from "@/api";

/** Hiển thị thông báo bằng Snackbar của zmp-ui */
export function useNotify() {
  const { openSnackbar } = useSnackbar();
  return useMemo(
    () => ({
      success: (text: string) => openSnackbar({ text, type: "success", duration: 2500 }),
      info: (text: string) => openSnackbar({ text, type: "info", duration: 2500 }),
      error: (err: unknown) =>
        openSnackbar({ text: typeof err === "string" ? err : errorMessage(err), type: "error", duration: 3500 }),
    }),
    [openSnackbar],
  );
}
