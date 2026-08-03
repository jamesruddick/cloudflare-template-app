// Declared by hand rather than via `vite/client`, which pulls in DOM types this package must not have.

interface ImportMetaEnv {
  /** 'development' under the dev server, 'production' for a build, 'test' under vitest. */
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  // Optional: `wrangler deploy` can bundle this entry with esbuild directly, where it is absent.
  readonly env?: ImportMetaEnv;
}
