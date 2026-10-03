"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => logoutAction())}
    >
      {isPending ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
    </Button>
  );
}
