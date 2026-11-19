'use client';
import * as React from 'react';
import { useState } from 'react';
import type { BankAccount, BankMovement } from '@/lib/bank-reconciliation/bank-reconciliation-api';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { FormModal } from '@/components/shared/form-modal';
import { PatientSearchField, type PickedPatient } from '@/components/patients/patient-search-field';
import { RecordPaymentModal } from '@/components/payments/record-payment-modal';

export const registerMovementCopy = {
  title: 'Registrar abono del movimiento',
  description: (amount: string, day: string, reference: string | null) =>
    `Entró ${amount} el ${day}${reference ? ` con la referencia ${reference}` : ''}. Elige de qué paciente es; en el siguiente paso eliges su plan y el abono llega ya escrito.`,
  patient: 'Paciente',
  patientMissing: 'Elige el paciente del abono.',
  continue: 'Continuar',
};
const copy = registerMovementCopy;

interface RegisterMovementPaymentProps {
  token: string;
  /** El movimiento sin abono; `null` = cerrado. */
  movement: BankMovement | null;
  account: BankAccount;
  stamp: SedeStamp;
  onClose: () => void;
  /** El abono quedó guardado: `paymentIds` los que creó la API, `notice` su aviso. */
  onRecorded: (movement: BankMovement, notice: string, paymentIds: string[]) => void;
}

/**
 * DX-571: «Registrar abono» desde un movimiento sin abono. Primero se elige el
 * paciente; luego se abre el MISMO «Registrar abono» del estado de cuenta
 * (plan, saldo migrado, tasa, comprobante, cierre contable…) con el importe,
 * la moneda, el medio de la cuenta, la referencia y el día del movimiento ya
 * escritos. Quien lo abre empareja el abono creado con el movimiento.
 */
export function RegisterMovementPayment({
  token,
  movement,
  account,
  stamp,
  onClose,
  onRecorded,
}: RegisterMovementPaymentProps) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [step, setStep] = useState<'patient' | 'record'>('patient');
  const [patientError, setPatientError] = useState<string | null>(null);
  // Un movimiento nuevo empieza de cero (ajuste durante el render).
  const [prevMovement, setPrevMovement] = useState(movement);
  if (movement !== prevMovement) {
    setPrevMovement(movement);
    setPatient(null);
    setStep('patient');
    setPatientError(null);
  }

  function close() {
    onClose();
  }

  // El medio: el primero de la cuenta que pide referencia (transferencia o pago móvil), o el
  // primero de la cuenta; se puede cambiar en el abono.
  const method = account.paymentMethods.find((m) => m.requiresReference) ?? account.paymentMethods[0] ?? null;

  return (
    <>
      <FormModal
        open={movement !== null && step === 'patient'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={copy.title}
        description={
          movement
            ? copy.description(
                stamp.money(movement.amount, movement.currency),
                stamp.civilDate(movement.bookedOn),
                movement.reference,
              )
            : undefined
        }
        onSubmit={(e) => {
          e.preventDefault();
          if (!patient) {
            setPatientError(copy.patientMissing);
            return;
          }
          setStep('record');
        }}
        submitLabel={copy.continue}
        ownValidation
        touchTargets
      >
        <PatientSearchField
          id="bank-register-patient"
          label={copy.patient}
          token={token}
          value={patient}
          onChange={(next) => {
            setPatient(next);
            setPatientError(null);
          }}
          error={patientError}
        />
      </FormModal>
      <RecordPaymentModal
        open={movement !== null && step === 'record' && patient !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        token={token}
        patientId={patient?.id ?? ''}
        prefill={
          movement
            ? {
                amount: movement.amount,
                currency: movement.currency,
                paymentMethodId: method?.id ?? null,
                reference: movement.reference,
                date: movement.bookedOn,
              }
            : undefined
        }
        onRecorded={(notice, opts) => {
          if (movement) onRecorded(movement, notice, opts?.paymentIds ?? []);
        }}
      />
    </>
  );
}
