// Client-safe half of the password rules (KYT-10): the browser only needs the minimum length
// to disable the button early. The real check runs on the server in src/lib/password.ts, which
// imports node:crypto and must never reach the browser bundle.
export const MIN_PASSWORD_LENGTH = 10;
