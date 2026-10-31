"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { UnscheduledPlansView } from "@/components/treatment-plans/unscheduled-plans-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FollowUpScopeMarker,
  PendingFollowUpView,
} from "@/components/treatment-plans/pending-follow-up-view";
import { PageHeader } from "@/components/shared/page-header";

// «Presupuestos por seguir» (DX-040). Mismo guard de sesión que la caja. La
// cabecera (título + una línea + alcance) va PRIMERO y las pestañas debajo
// (UX v2: antes las pestañas iban encima del H1). Un rol sin acceso que llegue
// por URL ve el aviso de la propia vista (la API responde 403).
const copy = {
  checkingSession: "Verificando sesión…",
  title: "Presupuestos por seguir",
  description:
    "Presupuestos que esperan la respuesta del paciente o su cita: llámalo o escríbele antes de que se enfríen.",
  tabsLabel: "Seguimiento de presupuestos",
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
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={<FollowUpScopeMarker token={accessToken} />}
      />
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
        <TabsList aria-label={copy.tabsLabel}>
          <TabsTrigger value="presented">Presentado sin aceptar</TabsTrigger>
          <TabsTrigger value="accepted">Aceptado sin agendar</TabsTrigger>
        </TabsList>
        <TabsContent value="presented">
          <PendingFollowUpView token={accessToken} />
        </TabsContent>
        <TabsContent value="accepted">
          <UnscheduledPlansView token={accessToken} />
        </TabsContent>
      </Tabs>
    </>
  );
}
