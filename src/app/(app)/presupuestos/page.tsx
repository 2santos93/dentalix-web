"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { UnscheduledPlansView } from "@/components/treatment-plans/unscheduled-plans-view";
import * as Tabs from "@radix-ui/react-tabs";
import { PendingFollowUpView } from "@/components/treatment-plans/pending-follow-up-view";

// «Presupuestos por seguir» (DX-040). Mismo guard de sesión que la caja: la
// vista pinta su cabecera, y un rol sin acceso que llegue por URL ve el aviso
// de la propia vista (la API responde 403).
const copy = {
  checkingSession: "Verificando sesión…",
};

export default function PresupuestosPage() {
  const router = useRouter();
  const [tab, setTab] = useState("presented");
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace("/login");
    }
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <Tabs.Root
      value={tab}
      onValueChange={setTab}
      className="flex flex-col gap-6"
    >
      <Tabs.List
        aria-label="Seguimiento de presupuestos"
        className="flex h-auto flex-wrap gap-2 border-b border-border pb-3"
      >
        <Tabs.Trigger
          value="presented"
          className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-muted data-[state=active]:bg-surface-2 data-[state=active]:text-ink"
        >
          Presentado sin aceptar
        </Tabs.Trigger>
        <Tabs.Trigger
          value="accepted"
          className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-muted data-[state=active]:bg-surface-2 data-[state=active]:text-ink"
        >
          Aceptado sin agendar
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="presented">
        <PendingFollowUpView token={accessToken} />
      </Tabs.Content>
      <Tabs.Content value="accepted">
        <UnscheduledPlansView token={accessToken} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
