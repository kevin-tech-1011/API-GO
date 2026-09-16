/**
 * `@react-pdf/reconciler` (and some bundler + CJS interop paths) expect `React` on `globalThis`.
 * Import this module before any `@react-pdf/renderer` import in the same file.
 */
import React from 'react'

const g = globalThis as typeof globalThis & { React?: typeof React }
if (g.React == null) {
    g.React = React
}
