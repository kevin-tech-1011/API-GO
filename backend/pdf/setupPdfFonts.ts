import fs from 'fs'
import path from 'path'
import { Font } from '@react-pdf/renderer'

let registered = false

/** Register fonts from `frontend/public` so Node PDF matches the web app. */
export function setupPdfFonts(): void {
    if (registered) return
    registered = true

    const publicDir = path.join(process.cwd(), 'frontend', 'public')

    const tryRegister = (family: string, segments: string[]) => {
        const filePath = path.join(publicDir, ...segments)
        if (!fs.existsSync(filePath)) return
        // Must be a real filesystem path, not `file://`. `@react-pdf/font` uses `fetch()`
        // for anything `is-url` considers a URL, and Node's fetch often fails on file: URLs.
        Font.register({ family, src: path.resolve(filePath) })
    }

    tryRegister('Calibri Regular', ['fonts', 'calibri', 'calibri-regular.ttf'])
    tryRegister('Calibri Bold', ['fonts', 'calibri', 'calibri-bold.ttf'])
    tryRegister('Arial Rounded MT Bold', ['fonts', 'arial-rounded-mt-bold', 'arialroundedmtbold.ttf'])
    tryRegister('Speaker Pro Heavy', ['fonts', 'speaker-pro', 'SpeakPro-Heavy.ttf'])
}
