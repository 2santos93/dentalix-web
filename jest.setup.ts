import '@testing-library/jest-dom';

// jsdom doesn't implement the Pointer Events capture API. sonner's toast
// (swipe-to-dismiss) calls these on pointerdown even for a plain click, so
// without this shim any test that interacts with a toast throws
// `setPointerCapture is not a function`. This is a stub for a missing DOM
// API, not a timing workaround.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
