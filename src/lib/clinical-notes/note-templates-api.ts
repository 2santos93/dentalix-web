import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-170: la API documenta las respuestas con @ApiProperty, así que los tipos
// salen tal cual del contrato generado.
export type NoteTemplate = components['schemas']['ClinicalNoteTemplateDto'];
export type NoteTemplatePrompt = components['schemas']['ClinicalNoteTemplatePromptDto'];
export type NotePromptType = NoteTemplatePrompt['type'];
export type CreateNoteTemplateInput = components['schemas']['CreateClinicalNoteTemplateDto'];
export type UpdateNoteTemplateInput = components['schemas']['UpdateClinicalNoteTemplateDto'];

/** Crear, editar, desactivar y cargar ejemplos: solo ADMIN (como la API). */
export function canManageNoteTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * `GET /clinical-note-templates`: por defecto solo las activas (el selector de
 * «Nueva evolución»); `includeInactive` para Ajustes.
 */
export async function listNoteTemplates(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<NoteTemplate[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<NoteTemplate[]>(`/clinical-note-templates${query}`, { token });
}

export async function createNoteTemplate(
  token: string,
  input: CreateNoteTemplateInput,
): Promise<NoteTemplate> {
  return apiFetch<NoteTemplate>('/clinical-note-templates', {
    method: 'POST',
    body: input,
    token,
  });
}

export async function updateNoteTemplate(
  token: string,
  id: string,
  input: UpdateNoteTemplateInput,
): Promise<NoteTemplate> {
  return apiFetch<NoteTemplate>(`/clinical-note-templates/${id}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/**
 * «Cargar plantillas de ejemplo»: crea las que la clínica aún no tiene (por
 * nombre) y devuelve SOLO las creadas; repetirlo no duplica nada.
 */
export async function loadSampleNoteTemplates(token: string): Promise<NoteTemplate[]> {
  return apiFetch<NoteTemplate[]>('/clinical-note-templates/samples', {
    method: 'POST',
    token,
  });
}
