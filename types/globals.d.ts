/**
 * Ambient declarations for the browser bundle and optional runtime peers.
 * These are type-only shims: the real modules are supplied by the running
 * Harness page (`window.__ModuleLoader__` / the module table) and by the
 * profile's zod installation at runtime.
 */
interface Window {
  __ModuleLoader__: {
    load(config: {
      id: string
      factory: (require: (id: string) => any) => unknown
    }): void
  }
}

declare module 'react' {
  const React: any
  export = React
}

declare module 'zod' {
  const z: any
  export { z }
  export default z
}
