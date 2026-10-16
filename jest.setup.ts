import '@testing-library/jest-dom';

// jsdom doesn't implement the Pointer Events capture API. sonner's toast
// (swipe-to-dismiss) calls these on pointerdown even for a plain click, so
// without this shim any test that interacts with a toast throws
// `setPointerCapture is not a function`. This is a stub for a missing DOM
// API, not a timing workaround.
// Solo con DOM: los tests de servidor (`@jest-environment node`, p. ej. el de
// `proxy.ts`) no tienen `Element`.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
}

// jsdom no implementa ResizeObserver. `Table` lo usa para saber si su marco se
// desplaza de lado (y solo entonces hacerlo enfocable), así que sin este stub
// cualquier test que pinte una tabla revienta con `ResizeObserver is not
// defined`. Otro stub de API del DOM que falta, no un parche de tiempos: en
// jsdom nada cambia de tamaño, y la medición inicial del efecto ya corre.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
