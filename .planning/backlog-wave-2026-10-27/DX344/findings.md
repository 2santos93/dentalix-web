# Hallazgos DX344

- `loading` eliminaba `preview`, desmontando la casilla y textarea cada recomprobación de 400 ms.
- El resultado se identificaba solo por medicamentos; el cambio de paciente podía reutilizar datos y confirmación. Ahora el formulario tiene key por paciente; el token forma parte de la comprobación, sin borrar el borrador cuando se renueva.
- El estado pendiente se deriva desde la primera edición (incluido debounce/retry/token) y no habilita emitir hasta completar la petición actual.
- La región viva monta siempre, conserva texto idéntico para respuestas idénticas y queda separada de controles. No se anuncian los estados transitorios de cada tecla.
- `FormField` permite id de hint. El motivo referencia hint o error según estado.
- Ruling del coordinador autoriza `submitHint` opcional de FormModal y test de regresión. El motivo de bloqueo queda visible junto al footer y asociado a la acción.
- Axe real detectó contraste preexistente 4,36:1 en fuente/código sobre fondo danger/5. Corrección local a text-ink, sin cambiar los tokens globales.
- DB exclusiva dx344_20261027_test, sobre PG compartido :55521; API :3218/web :3148. Sin resets de otras bases ni parada del contenedor.
