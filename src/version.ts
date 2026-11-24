declare const __APP_VERSION__: string;

/** App version from package.json, injected at build time (vite.config.ts `define`). */
export const APP_VERSION: string = __APP_VERSION__;
