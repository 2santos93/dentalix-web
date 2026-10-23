"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Lock, Printer, UserX } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  getFamilyAccountStatement,
  type FamilyAccountStatement,
} from "@/lib/account-statement/account-statement-api";
import { FamilyAccountStatementDocument } from "./family-account-statement-document";
import { SectionError } from "@/components/errors/section-error";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

const copy = {
  toolbar: "Acciones del documento",
  print: "Imprimir o guardar como PDF",
  back: "Volver a la ficha",
  loading: "Preparando el estado de cuenta familiar…",
  loadError: "No pudimos cargar el estado de cuenta familiar.",
  notFoundTitle: "No encontramos este paciente.",
  notFoundHint:
    "Puede que se haya retirado o que el enlace no sea de esta clínica.",
  forbiddenTitle: "Tu rol no tiene acceso al estado de cuenta.",
  forbiddenHint: "Es un dato financiero: lo ven administración y recepción.",
  documentTitle: (name: string) => `Estado de cuenta familiar · ${name}`,
};

/**
 * Vista imprimible del estado de cuenta familiar (DX-203), fuera del shell,
 * igual que la individual: abre el diálogo de impresión una vez (de ahí se
 * imprime o se guarda como PDF).
 */
export function FamilyAccountStatementPrintView({
  token,
  patientId,
  allowed = true,
}: {
  token: string;
  patientId: string;
  allowed?: boolean;
}) {
  const [data, setData] = useState<FamilyAccountStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const forbidden = !allowed || deniedByApi;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getFamilyAccountStatement(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  const backHref = `/patients/${encodeURIComponent(patientId)}?tab=account-statement`;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface-2 print:bg-white">
      {data ? (
        <title>
          {copy.documentTitle(`${data.payer.firstName} ${data.payer.lastName}`)}
        </title>
      ) : null}
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={backHref}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()} disabled={!data}>
          <Printer aria-hidden />
          {copy.print}
        </Button>
      </div>
      <main className="flex-1 sm:px-4 sm:py-8 print:p-0">
        {data ? (
          <div className="mx-auto max-w-[210mm] shadow-sm print:shadow-none">
            <FamilyAccountStatementDocument statement={data} />
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<Lock aria-hidden />}
              title={copy.forbiddenTitle}
              description={copy.forbiddenHint}
            />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<UserX aria-hidden />}
              title={copy.notFoundTitle}
              description={copy.notFoundHint}
            />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <SectionError
              description={error}
              onRetry={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <p role="status" className="px-4 py-8 text-center text-sm text-muted">
            {copy.loading}
          </p>
        )}
      </main>
    </div>
  );
}
