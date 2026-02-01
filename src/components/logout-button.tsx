'use client';

import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";

export function LogoutButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      onClick={() =>
        signOut({
          callbackUrl: "/login",
          redirect: true,
        })
      }
    />
  );
}
