import path from 'path'

/** Safe folder name under `calendar/<name>/` from profile display name. */
export function sanitizeProfileDirName(name: string, profileId: number): string {
    const base = (name || '').trim() || `profile-${profileId}`
    const cleaned = base
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
    return cleaned.slice(0, 120) || `profile-${profileId}`
}

const OUTPUT_FILENAME = 'calendar-data.json'

export function calendarJsonPath(profileDirName: string): {
    dir: string
    filePath: string
} {
    const dir = path.join(process.cwd(), 'calendar', profileDirName)
    return { dir, filePath: path.join(dir, OUTPUT_FILENAME) }
}

/** Normalize webcal → https; trim. */
export function normalizeCalendarUrl(raw: string): string {
    let u = raw.trim()
    if (u.toLowerCase().startsWith('webcal://')) {
        u = `https://${u.slice('webcal://'.length)}`
    }
    return u
}

/**
 * Restrict outbound fetches to Google Calendar hosts (SSRF mitigation).
 */
export function isAllowedGoogleCalendarUrl(urlString: string): boolean {
    let url: URL
    try {
        url = new URL(urlString)
    } catch {
        return false
    }
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'calendar.google.com'
}

/**
 * Minimal VEVENT extraction (Google Calendar iCal); folds long lines per RFC 5545.
 */
export function parseIcsToEventSummaries(icsText: string): {
    events: Array<{
        uid?: string
        summary?: string
        dtstart?: string
        dtend?: string
        description?: string
        location?: string
    }>
    rawPreview: string
} {
    const unfolded: string[] = []
    const lines = icsText.replace(/\r\n/g, '\n').split('\n')
    let carry = ''
    for (const line of lines) {
        if (line.length === 0) continue
        if (/^[ \t]/.test(line) && carry) {
            carry += line.slice(1)
        } else {
            if (carry) unfolded.push(carry)
            carry = line
        }
    }
    if (carry) unfolded.push(carry)

    const text = unfolded.join('\n')
    const events: Array<{
        uid?: string
        summary?: string
        dtstart?: string
        dtend?: string
        description?: string
        location?: string
    }> = []
    const pickField = (chunk: string, key: string): string | undefined => {
        const upper = key.toUpperCase()
        for (const line of chunk.split(/\n/)) {
            const u = line.toUpperCase()
            if (u.startsWith(`${upper}:`) || u.startsWith(`${upper};`)) {
                const idx = line.indexOf(':')
                if (idx === -1) continue
                return unescapeIcsText(line.slice(idx + 1).trim())
            }
        }
        return undefined
    }

    const parts = text.split(/BEGIN:VEVENT/gi)
    for (let i = 1; i < parts.length; i++) {
        const chunk = parts[i].split(/END:VEVENT/i)[0]
        events.push({
            uid: pickField(chunk, 'UID'),
            summary: pickField(chunk, 'SUMMARY'),
            dtstart: pickField(chunk, 'DTSTART'),
            dtend: pickField(chunk, 'DTEND'),
            description: pickField(chunk, 'DESCRIPTION'),
            location: pickField(chunk, 'LOCATION'),
        })
    }

    const rawPreview = icsText.length > 8000 ? `${icsText.slice(0, 8000)}…` : icsText
    return { events, rawPreview }
}

function unescapeIcsText(s: string): string {
    return s
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
}
