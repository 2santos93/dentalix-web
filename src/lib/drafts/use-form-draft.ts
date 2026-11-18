'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newIdempotencyKey } from '@/lib/api/idempotency-key';
import { onReconnect } from '@/lib/offline/connectivity';
import { draftOwnerOf } from './draft-key';
import type { DraftForm, DraftScope, DraftStore } from './draft-store';
import { getDraftStore } from './drafts-runtime';

/** Espera tras el último cambio antes de guardar el borrador. */
export const DRAFT_DEBOUNCE_MS = 800;

/** Lo que se guarda: el valor del formulario y la clave del intento de envío. */
interface DraftEnvelope<T> {
  v: 1;
  value: T;
  idempotencyKey: string;
}

export interface UseFormDraftOptions<T> {
  token: string;
  patientId: string;
  form: DraftForm;
  /** Separa borradores del mismo formulario (la cita de la evolución, el plan del tratamiento). */
  variant?: string | null;
  /** El valor actual del formulario (serializable a JSON). */
  value: T;
  /**
   * El valor «sin cambios» del formulario: si `value` vuelve a él, no hay
   * borrador. Por defecto, el primer valor que se ve con `enabled`.
   */
  baseline?: T;
  /**
   * Alternativa a `baseline`: `true` si el valor no tiene nada que merezca
   * guardarse (p. ej. solo la plantilla sugerida, sin escribir nada).
   */
  isEmpty?: (value: T) => boolean;
  /** Solo guarda y comprueba con el formulario abierto. */
  enabled?: boolean;
  debounceMs?: number;
  /** Solo tests. */
  store?: DraftStore | null;
}

export interface FormDraft<T> {
  /** Hay un borrador que se puede recuperar (ya descifrado). */
  pending: { savedAt: number } | null;
  /** Hay un borrador, pero sin conexión no se puede descifrar todavía. */
  locked: { savedAt: number } | null;
  /** Devuelve el borrador para rellenar el formulario (NO envía nada) y reutiliza su clave de envío. */
  restore(): T | null;
  /** Borra el borrador guardado. */
  discard(): void;
  /** Tras guardar en la historia: borra el borrador y no vuelve a guardar el valor actual. */
  clear(): Promise<void>;
  /** La clave del intento actual (`Idempotency-Key`). */
  idempotencyKey: string;
  getIdempotencyKey(): string;
  /** Clave nueva para el próximo envío (tras un éxito o un 422 de clave reutilizada). */
  renewKey(): void;
  /** Guarda ya el valor actual (sin red). `true` si quedó en el equipo. */
  saveNow(): Promise<boolean>;
}

/**
 * Borrador local de un formulario clínico (DX-574). Guarda con debounce lo
 * que difiere del valor inicial, cifrado y por usuario+clínica+paciente. Al
 * abrir el formulario mira si hay uno y lo ofrece (`pending`); mientras no se
 * decide (Recuperar o Descartar) no se sobrescribe. Recuperar solo devuelve
 * el valor: nunca envía.
 */
export function useFormDraft<T>(options: UseFormDraftOptions<T>): FormDraft<T> {
  const { token, patientId, form, variant = null, value, enabled = true } = options;
  const debounceMs = options.debounceMs ?? DRAFT_DEBOUNCE_MS;
  const [store] = useState<DraftStore | null>(() => (options.store !== undefined ? options.store : getDraftStore()));
  const owner = draftOwnerOf(token);
  const scope = useMemo<DraftScope | null>(
    () => (owner ? { owner, patientId, form, variant } : null),
    [owner, patientId, form, variant],
  );
  const active = Boolean(store && scope && enabled);

  const serialized = JSON.stringify(value ?? null);
  const baselineSerialized = options.baseline !== undefined ? JSON.stringify(options.baseline) : null;
  // Cada apertura del formulario es una sesión: su primer valor es la base.
  const [session, setSession] = useState(() => ({ enabled, id: 0, firstSeen: enabled ? serialized : null }));
  if (session.enabled !== enabled) {
    setSession({ enabled, id: session.id + 1, firstSeen: enabled ? serialized : null });
  }
  const baseline = baselineSerialized ?? session.firstSeen;
  const isEmpty = options.isEmpty ? options.isEmpty(value) : serialized === baseline;

  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const keyRef = useRef(idempotencyKey);
  const setKey = useCallback((next: string) => {
    keyRef.current = next;
    setIdempotencyKey(next);
  }, []);

  // Lo que se vio al mirar si había borrador, para qué alcance y sesión.
  const [check, setCheck] = useState<{
    key: string;
    pending: { savedAt: number } | null;
    locked: { savedAt: number } | null;
  } | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const payloadRef = useRef<DraftEnvelope<T> | null>(null);
  // Lo último que se guardó (o que no hace falta guardar).
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Valor programado para guardar y aún no guardado (se guarda al cerrar el formulario).
  const dirtyRef = useRef<string | null>(null);
  const valueRef = useRef(serialized);
  useLayoutEffect(() => {
    valueRef.current = serialized;
  });

  const scopeKey = scope ? JSON.stringify([scope.owner, scope.patientId, scope.form, scope.variant]) : null;
  const sessionKey = `${scopeKey}|${session.id}`;
  // `checked`: ya se miró si había borrador (hasta entonces no se guarda nada).
  const checked = active && check?.key === sessionKey;
  const pending = checked ? check.pending : null;
  const locked = checked ? check.locked : null;

  // ¿Hay borrador? Al abrir el formulario, y otra vez al volver la red si no se pudo descifrar.
  useEffect(() => {
    if (!active || !store || !scope) {
      payloadRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      let found: { savedAt: number } | null = null;
      try {
        found = await store.peek(scope);
      } catch {
        found = null;
      }
      if (cancelled) return;
      if (!found) {
        setCheck({ key: sessionKey, pending: null, locked: null });
        // La clave, ya con red: si la red cae después, se puede guardar igual.
        void store.prepare(scope.owner);
        return;
      }
      try {
        const loaded = await store.load<DraftEnvelope<T>>(scope);
        if (cancelled) return;
        const usable = loaded && loaded.payload && loaded.payload.v === 1 ? loaded : null;
        payloadRef.current = usable ? usable.payload : null;
        setCheck({ key: sessionKey, pending: usable ? { savedAt: usable.savedAt } : null, locked: null });
      } catch {
        // Sin clave (sin red o sin sesión): se avisa y se reintenta al volver la red.
        if (cancelled) return;
        setCheck({ key: sessionKey, pending: null, locked: found });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `sessionKey` resume `scope` y la apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, store, sessionKey, checkAttempt]);

  useEffect(() => {
    if (!locked) return;
    return onReconnect(() => setCheckAttempt((n) => n + 1));
  }, [locked]);

  const cancelTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  /** Ya no hay nada pendiente de guardar (se guardó, se descartó o se envió). */
  const settle = useCallback(() => {
    cancelTimer();
    dirtyRef.current = null;
  }, [cancelTimer]);

  const persist = useCallback(
    async (text: string): Promise<boolean> => {
      if (!store || !scope) return false;
      const envelope: DraftEnvelope<T> = { v: 1, value: JSON.parse(text) as T, idempotencyKey: keyRef.current };
      try {
        const saved = await store.save(scope, envelope);
        if (saved) lastSavedRef.current = text;
        return saved;
      } catch {
        return false;
      }
    },
    [store, scope],
  );

  // Guardado con debounce. No mientras haya uno por decidir: no se pisa.
  useEffect(() => {
    if (!active || !checked || pending || locked || !store || !scope) return;
    if (serialized === lastSavedRef.current) return;
    if (isEmpty) {
      // Volvió a como estaba: si se había guardado algo en esta sesión, fuera.
      if (lastSavedRef.current !== null) {
        lastSavedRef.current = serialized;
        void store.remove(scope).catch(() => undefined);
      }
      return;
    }
    cancelTimer();
    dirtyRef.current = serialized;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dirtyRef.current = null;
      void persist(serialized);
    }, debounceMs);
    return cancelTimer;
  }, [active, checked, pending, locked, store, scope, serialized, isEmpty, debounceMs, persist, cancelTimer]);

  // Al ocultar o cerrar la pestaña, lo pendiente se guarda ya (sin esperar al debounce).
  useEffect(() => {
    if (!active) return;
    const flush = () => {
      const text = dirtyRef.current;
      settle();
      if (text !== null) void persist(text);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      // Se cierra el formulario (o se desmonta) antes del debounce: lo último escrito no se pierde.
      flush();
    };
  }, [active, persist, settle]);

  const restore = useCallback((): T | null => {
    const payload = payloadRef.current;
    payloadRef.current = null;
    setCheck((c) => (c ? { ...c, pending: null } : c));
    if (!payload) return null;
    // El envío original pudo llegar al servidor: se reintenta con SU clave.
    if (payload.idempotencyKey) setKey(payload.idempotencyKey);
    // Lo recuperado ya está guardado: no hace falta volver a escribirlo.
    lastSavedRef.current = JSON.stringify(payload.value ?? null);
    return payload.value;
  }, [setKey]);

  const discard = useCallback(() => {
    payloadRef.current = null;
    setCheck((c) => (c ? { ...c, pending: null, locked: null } : c));
    lastSavedRef.current = valueRef.current;
    settle();
    if (store && scope) void store.remove(scope).catch(() => undefined);
  }, [store, scope, settle]);

  const clear = useCallback(async () => {
    settle();
    payloadRef.current = null;
    setCheck((c) => (c ? { ...c, pending: null, locked: null } : c));
    lastSavedRef.current = valueRef.current;
    if (store && scope) await store.remove(scope).catch(() => undefined);
  }, [store, scope, settle]);

  const renewKey = useCallback(() => setKey(newIdempotencyKey()), [setKey]);

  const saveNow = useCallback(async () => {
    settle();
    if (!active) return false;
    // Se pulsó «Guardar» con lo que hay en pantalla: eso es ya el borrador.
    payloadRef.current = null;
    setCheck((c) => (c ? { ...c, pending: null } : c));
    return persist(valueRef.current);
  }, [active, persist, settle]);

  const getIdempotencyKey = useCallback(() => keyRef.current, []);

  return {
    pending,
    locked,
    restore,
    discard,
    clear,
    idempotencyKey,
    getIdempotencyKey,
    renewKey,
    saveNow,
  };
}
