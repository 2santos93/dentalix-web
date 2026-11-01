// A route-group boundary cannot catch unmatched URLs such as /no-existe.
// Reuse the public fallback at the root, per Next's not-found convention.
export { default } from './(public)/not-found';
