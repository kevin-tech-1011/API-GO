import fs from 'fs'
import path from 'path'

export function resolveBackgroundImageSrc(backgroundId: number): string | null {
    const safeId = Number.isFinite(backgroundId) ? Math.floor(backgroundId) : 0
    const filePath = path.join(
        process.cwd(),
        'frontend',
        'public',
        'resume-background',
        `pattern${safeId}.jpg`
    )
    if (!fs.existsSync(filePath)) return null
    // Absolute path (not `file://`) so `@react-pdf/image` uses fs, not fetch.
    return path.resolve(filePath)
}
