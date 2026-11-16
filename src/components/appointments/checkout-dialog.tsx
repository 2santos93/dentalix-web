"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { CircleCheck, CircleAlert } from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";
import {
  checkoutItems,
  getCheckoutChecklist,
  type CheckoutChecklist,
  type CheckoutItem,
} from "@/lib/appointments/checkout-checklist";
import { SectionError } from "@/components/errors/section-error";
import { FormModal } from "@/components/shared/form-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "@/components/shared/external-link";
import {
  CheckoutRecallOffer,
  ScheduledRecallText,
  type ScheduledRecall,
} from "./checkout-recall-offer";
import { CheckoutContactField } from "./checkout-contact-field";
import { InlineError } from "@/components/errors/inline-error";
import { notifySuccess } from "@/components/errors/notify";
import { Button } from "@/components/ui/button";
import {
  canRegisterPayments,
  useEffectivePermissions,
} from "@/lib/auth/permissions";
import { getTokenRole } from "@/lib/auth/token-role";
import { useSedeStamp } from "@/lib/locations/sede-stamp";

// DX-202-bis: el modal de cobro (con sus medios, tasas y comprobante) solo se
// descarga cuando alguien pulsa «Cobrar»: la salida se abre muchas veces al día.
const RecordPaymentModal = dynamic(
  () =>
    import("@/components/payments/record-payment-modal").then(
      (m) => m.RecordPaymentModal,
    ),
  { ssr: false },
);

export const checkoutCopy = {
  title: (name: string) => `Salida de ${name}`,
  description:
    "Antes de despedirlo, revisa si falta algo. Puedes completar la cita aunque quede algo pendiente.",
  submit: "Completar la cita",
  /** FE-108: la primaria mientras llega la lista; sin ella no se completa. */
  loading: "Cargando…",
  submitWithPending: (count: number) =>
    `Completar con ${count} pendiente${count === 1 ? "" : "s"}`,
  loadError: "No pudimos comprobar la salida del paciente.",
  completeError: "No pudimos completar la cita. Intenta de nuevo.",
  remindersOff: "Dio de baja los recordatorios.",
  open: "Abrir ficha",
  items: {
    NEXT_VISIT: {
      done: "Tiene próxima cita o recall",
      pending: "Sin próxima cita ni recall",
      tab: "",
    },
    PAYMENT: {
      done: "Sin saldo pendiente",
      pending: "Tiene saldo pendiente hoy",
      tab: "?tab=account-statement",
    },
    PHONE: { done: "Tiene teléfono", pending: "Falta el teléfono", tab: "" },
    EMAIL: { done: "Tiene correo", pending: "Falta el correo", tab: "" },
  } satisfies Record<
    CheckoutItem,
    { done: string; pending: string; tab: string }
  >,
  /** DX-202-bis: con algo vencido, el punto lo dice antes que el pendiente. */
  overdue: "Tiene saldo vencido",
  pendingToday: (amounts: string) => `Pendiente hoy: ${amounts}`,
  overdueDays: (days: number) =>
    `Vencido hace ${days} día${days === 1 ? "" : "s"}`,
  charge: "Cobrar",
  checking: "Comprobando…",
  refreshError: "No pudimos volver a comprobar este punto.",
  retry: "Reintentar",
};

/** Un punto que se está releyendo tras resolverlo aquí, o cuya relectura falló. */
type RowRefresh = { item: CheckoutItem; error: string | null };

/**
 * DX-202: la salida del paciente. Enseña qué falta y se relee al volver a la
 * pestaña. No bloquea: lo que quede pendiente viaja al completar y queda en la
 * auditoría.
 *
 * DX-202-bis: cada punto se resuelve aquí, sin ir a la ficha. «Cobrar» abre el
 * modal de registrar abono del estado de cuenta (sus reglas: fecha no futura en
 * la sede, medios, turno de caja), solo para quien cobra (rol de cobro o
 * PAYMENT_REGISTER, DX-090); el teléfono y el correo se completan en línea con
 * la edición del paciente. El cobro mira el saldo pendiente hoy, no solo el
 * vencido. Tras resolver un punto se relee la lista y solo ese punto enseña que
 * comprueba o que falló, con su reintento.
 *
 * FE-108: sin la lista no se puede completar. Mientras carga, la primaria está
 * ocupada y desactivada; si falla, desaparece y queda «Reintentar» (rung 1).
 * Completar sin ella mandaría `checkoutPending = []`: nada en la auditoría.
 */
export function CheckoutDialog({
  token,
  appointmentId,
  patientName,
  onOpenChange,
  onComplete,
}: {
  token: string;
  appointmentId: string;
  patientName: string;
  onOpenChange: (open: boolean) => void;
  onComplete: (pending: CheckoutItem[]) => Promise<boolean>;
}) {
  const [list, setList] = useState<CheckoutChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // DX-015-bis (D16): el recall programado desde aquí, para decir cuándo vence.
  const [scheduled, setScheduled] = useState<ScheduledRecall | null>(null);
  // DX-202-bis: cobrar y completar el contacto sin salir.
  const permissions = useEffectivePermissions();
  const canCharge = canRegisterPayments(getTokenRole(token), permissions);
  const [charging, setCharging] = useState(false);
  const [row, setRow] = useState<RowRefresh | null>(null);
  // El dato guardado aquí cuenta ya, sin esperar a la relectura.
  const [savedContact, setSavedContact] = useState<{
    PHONE?: true;
    EMAIL?: true;
  }>({});
  const stamp = useSedeStamp(token);

  const load = useCallback(() => {
    getCheckoutChecklist(token, appointmentId).then(
      (data) => {
        setList(data);
        setError(null);
      },
      (err: unknown) => setError(apiErrorMessage(err, checkoutCopy.loadError)),
    );
  }, [token, appointmentId]);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  // Relee la lista tras resolver `item` aquí: el resto de puntos sigue a la
  // vista y solo ese dice que comprueba (o que falló, con su reintento).
  const refresh = useCallback(
    (item: CheckoutItem) => {
      setRow({ item, error: null });
      getCheckoutChecklist(token, appointmentId).then(
        (data) => {
          setList(data);
          setRow(null);
        },
        (err: unknown) =>
          setRow({
            item,
            error: apiErrorMessage(err, checkoutCopy.refreshError),
          }),
      );
    },
    [token, appointmentId],
  );

  // «Reintentar» vuelve al esqueleto (y a la primaria ocupada) mientras pide;
  // la relectura al volver a la pestaña no, para no parpadear sobre el error.
  const retry = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  // Programado aquí, el punto queda hecho sin esperar a la relectura.
  const items = list
    ? checkoutItems(list).map((i) =>
        (i.item === "NEXT_VISIT" && scheduled) ||
        ((i.item === "PHONE" || i.item === "EMAIL") && savedContact[i.item])
          ? { ...i, done: true }
          : i,
      )
    : [];
  const pending = items.filter((i) => !i.done).map((i) => i.item);
  const loadError = list ? null : error;
  const failed = loadError !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!list) return;
    setSubmitting(true);
    setSubmitError(null);
    const done = await onComplete(pending);
    setSubmitting(false);
    if (done) onOpenChange(false);
    // DX-538: el botón del aviso no se puede pulsar con el diálogo abierto: se reintenta desde aquí.
    else setSubmitError(checkoutCopy.completeError);
  }

  function paymentDetail(): string | null {
    if (!list?.balance) return null;
    const parts: string[] = [];
    const pending = list.pending ?? [];
    if (pending.length > 0) {
      parts.push(
        checkoutCopy.pendingToday(
          pending.map((a) => stamp.money(a.amount, a.currency)).join(" + "),
        ),
      );
    }
    if (list.balance.hasOverdue && list.balance.overdueDays !== null) {
      parts.push(checkoutCopy.overdueDays(list.balance.overdueDays));
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  function action(item: CheckoutItem, pendingText: string) {
    if (!list) return null;
    if (item === "PHONE" || item === "EMAIL") {
      return (
        <CheckoutContactField
          token={token}
          patientId={list.patientId}
          kind={item === "PHONE" ? "phone" : "email"}
          onSaved={() => {
            setSavedContact((prev) => ({ ...prev, [item]: true }));
            refresh(item);
          }}
        />
      );
    }
    if (item === "PAYMENT" && canCharge) {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          data-testid="checkout-charge"
          onClick={() => setCharging(true)}
        >
          {checkoutCopy.charge}
        </Button>
      );
    }
    return (
      <ExternalLink
        href={`/patients/${list.patientId}${checkoutCopy.items[item].tab}`}
        className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary-text underline-offset-4 hover:underline sm:min-h-6"
      >
        {checkoutCopy.open}
        <span className="sr-only">: {pendingText}</span>
      </ExternalLink>
    );
  }

  return (
    <>
      <FormModal
        open
        onOpenChange={onOpenChange}
        title={checkoutCopy.title(patientName)}
        description={checkoutCopy.description}
        onSubmit={handleSubmit}
        submitLabel={
          !list
            ? checkoutCopy.loading
            : pending.length > 0
              ? checkoutCopy.submitWithPending(pending.length)
              : checkoutCopy.submit
        }
        submitBusy={!list && !failed}
        hideSubmit={failed}
        submitting={submitting}
        error={submitError}
      >
        {loadError !== null ? (
          <SectionError description={loadError} onRetry={retry} />
        ) : !list ? (
          <div role="status" className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
            {items.map(({ item, done }) => {
              const text = checkoutCopy.items[item];
              const Icon = done ? CircleCheck : CircleAlert;
              const pendingText =
                item === "PAYMENT" && list.balance?.hasOverdue
                  ? checkoutCopy.overdue
                  : text.pending;
              const detail =
                item === "PAYMENT" && !done ? paymentDetail() : null;
              const checking = row?.item === item && row.error === null;
              const rowError = row?.item === item ? row.error : null;
              const offerRecall =
                item === "NEXT_VISIT" && !done && list.recallTypes.length > 0;
              return (
                <li
                  key={item}
                  data-testid={`checkout-${item}`}
                  data-done={done}
                  aria-busy={checking || undefined}
                  className="flex flex-col gap-2 px-3 py-2 text-sm text-ink"
                >
                  <span className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:min-h-7">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon
                        aria-hidden
                        className={
                          done
                            ? "size-4 shrink-0 text-success-text"
                            : "size-4 shrink-0 text-warning-text"
                        }
                      />
                      {item === "NEXT_VISIT" && done && scheduled ? (
                        <ScheduledRecallText
                          token={token}
                          scheduled={scheduled}
                        />
                      ) : done ? (
                        text.done
                      ) : (
                        pendingText
                      )}
                    </span>
                    {checking ? (
                      <span
                        role="status"
                        className="shrink-0 text-xs text-muted"
                      >
                        {checkoutCopy.checking}
                      </span>
                    ) : done ? null : (
                      action(item, pendingText)
                    )}
                  </span>
                  {detail ? (
                    <p
                      className="text-xs text-muted tabular-nums"
                      data-testid="checkout-PAYMENT-detail"
                    >
                      {detail}
                    </p>
                  ) : null}
                  {rowError ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <InlineError>{rowError}</InlineError>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => refresh(item)}
                      >
                        {checkoutCopy.retry}
                      </Button>
                    </div>
                  ) : null}
                  {offerRecall ? (
                    <CheckoutRecallOffer
                      token={token}
                      patientId={list.patientId}
                      appointmentId={appointmentId}
                      types={list.recallTypes}
                      onScheduled={(next) => {
                        setScheduled(next);
                        load();
                      }}
                      onStale={load}
                    />
                  ) : null}
                  {item === "NEXT_VISIT" && scheduled?.excluded ? (
                    <p className="text-xs text-muted">{scheduled.excluded}.</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {list?.remindersOptedOut ? (
          <p className="text-xs text-muted">{checkoutCopy.remindersOff}</p>
        ) : null}
      </FormModal>
      {/* Fuera del formulario de la salida: el envío del cobro no debe subir
        por el árbol de React hasta «Completar la cita». */}
      {charging && list ? (
        <RecordPaymentModal
          open
          onOpenChange={setCharging}
          token={token}
          patientId={list.patientId}
          onRecorded={(notice, opts) => {
            setCharging(false);
            notifySuccess(notice, opts);
            refresh("PAYMENT");
          }}
        />
      ) : null}
    </>
  );
}
