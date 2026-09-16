import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Tailwind `content` globs are resolved against cwd in dev (repo root). Config uses
// __dirname-anchored paths in tailwind.config.cjs so scans always hit frontend/src.
export default {
    plugins: {
        tailwindcss: {
            config: path.join(__dirname, 'tailwind.config.cjs'),
        },
        autoprefixer: {},
    },
}
