"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: LoginFormState = { error: null };

const fieldClass = cn(
  "h-9 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs",
  "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={fieldClass}
          placeholder="name@example.org"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={fieldClass}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
