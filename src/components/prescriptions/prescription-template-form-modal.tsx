'use client';
import * as React from 'react';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createPrescriptionTemplate,
  updatePrescriptionTemplate,
  type PrescriptionTemplate,
} from '@/lib/prescriptions/prescriptions-api';
import {
  draftFromTemplateItem,
  emptyItemDraft,
  templateItemInputFromDraft,
  type ItemDraft,
} from '@/lib/prescriptions/prescription-draft';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { PrescriptionItemFields } from './prescription-item-fields';

const MAX_ITEMS = 10;

const copy = {
  createTitle: 'Nueva plantilla de receta',
  editTitle: 'Editar plantilla de receta',
  description:
    'Solo el principio activo es obligatorio: el resto se completa al emitir. Editar una plantilla no cambia las recetas ya emitidas.',
  nameLabel: 'Nombre',
  namePlaceholder: 'Post-exodoncia',
  notesLabel: 'Indicaciones generales (opcional)',
  addItem: 'Añadir medicamento',
  create: 'Crear plantilla',
  save: 'Guardar cambios',
  genericError: 'No pudimos guardar la plantilla. Intenta de nuevo.',
};

interface PrescriptionTemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin plantilla: alta. Con plantilla: edición. */
  template?: PrescriptionTemplate | null;
  onSaved: (template: PrescriptionTemplate) => void;
}

/** Alta y edición de una plantilla de receta (DX-013, solo ADMIN). */
export function PrescriptionTemplateFormModal({
  open,
  onOpenChange,
  token,
  template,
  onSaved,
}: PrescriptionTemplateFormModalProps) {
  const [name, setName] = useState(template?.name ?? '');
  const [notes, setNotes] = useState(template?.notes ?? '');
  const [items, setItems] = useState<ItemDraft[]>(
    template ? template.items.map(draftFromTemplateItem) : [emptyItemDraft()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blank = name.trim() === '' || items.some((i) => i.activeIngredient.trim() === '');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blank) return;
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        notes: notes.trim(),
        items: items.map(templateItemInputFromDraft),
      };
      const saved = template
        ? await updatePrescriptionTemplate(token, template.id, input)
        : await createPrescriptionTemplate(token, input);
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={template ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={template ? copy.save : copy.create}
      submitting={submitting}
      submitDisabled={blank}
      error={error}
      size="lg"
    >
      <FormField htmlFor="rx-template-name" label={copy.nameLabel}>
        <Input
          id="rx-template-name"
          value={name}
          placeholder={copy.namePlaceholder}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <div className="flex flex-col gap-3">
        {items.map((item, index) => (
          <PrescriptionItemFields
            key={index}
            index={index}
            item={item}
            idPrefix="rx-template-item"
            mode={{ kind: 'template' }}
            onChange={(patch) =>
              setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
            }
            onRemove={
              items.length > 1
                ? () => setItems((prev) => prev.filter((_, i) => i !== index))
                : undefined
            }
          />
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={items.length >= MAX_ITEMS}
        onClick={() => setItems((prev) => [...prev, emptyItemDraft()])}
      >
        <Plus aria-hidden />
        {copy.addItem}
      </Button>
      <FormField htmlFor="rx-template-notes" label={copy.notesLabel}>
        <textarea
          id="rx-template-notes"
          rows={2}
          value={notes}
          maxLength={1000}
          onChange={(e) => setNotes(e.target.value)}
          className={cn(fieldClass, 'h-auto font-[inherit]')}
        />
      </FormField>
    </FormModal>
  );
}
