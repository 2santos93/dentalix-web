# DX344 · cierre, ronda 2 (rama loop/DX-344-347-final)

**Salto del pie del diálogo.** La explicación junto a «Emitir» se montaba y desmontaba en cada recomprobación: «Espera a que termine la comprobación…» aparece con cada edición de principio activo, concentración, dosis o frecuencia y desaparece al llegar la respuesta. Medido en Chromium (prod, API real): el diálogo crece 28 px a 1440 (1 línea + gap) y 48 px a 390 (2 líneas). Si el diálogo cabe en la ventana, al estar centrado, el campo que se está escribiendo sube 14 px y vuelve a bajar. Si hace scroll, el pie baja 28 px; el scroll anchoring de Chromium lo compensa, pero Safari no tiene ese comportamiento garantizado.

**Corrección.** `FormModal` reserva el hueco cuando el consumidor pasa `submitHint`, aunque valga `null`: `min-h-10` en móvil y `sm:min-h-5`. Vacío, el párrafo es `aria-hidden` y el botón no lleva `aria-describedby`. Sin la prop no hay hueco, así que los demás formularios no cambian.

**Pruebas.**
- RED/GREEN e2e: `scrollHeight` del diálogo idéntico entre el estado bloqueado y el habilitado, y entre la comprobación pendiente y la resuelta. Falló antes (1584 frente a 1556) y pasa después. Se mide `scrollHeight` y no la caja de «Emitir», porque el scroll anchoring oculta el salto.
- Jest: el hueco se conserva (es el mismo nodo) al pasar de texto a `null` y otra vez a texto; la descripción accesible solo existe con texto; sin la prop no hay hueco. Falló antes y pasa después.

**Evidencias fuera del árbol.** El spec escribía capturas y axe en `.planning/…/DX344` en cada ejecución, CI incluida, y dejaba el árbol sucio. Ahora solo lo hace con `DX344_QA_DIR`, igual que DX347 con `DX347_QA_DIR`. Las comprobaciones se ejecutan siempre.

Capturas 390/1440 claro/oscuro regeneradas tras el cambio: aviso, motivo, explicación y acciones visibles, y axe 0 violaciones en las 4 combinaciones.
