/**
 * Puente entre la paleta de comandos y la Agenda (A4): «Nueva cita» abre el
 * formulario de la Agenda sin que esta tenga ruta propia para él.
 */
/** Evento que escucha la Agenda montada para abrir «Nueva cita» sin navegar. */
export const NEW_APPOINTMENT_EVENT = 'dentalix:new-appointment';
/** `/agenda?nueva=cita` abre «Nueva cita» al montar. */
export const NEW_APPOINTMENT_PARAM = 'nueva';
