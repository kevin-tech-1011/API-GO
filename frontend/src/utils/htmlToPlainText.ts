/**
 * Strip HTML from calendar / ICS descriptions for safe plain-text display
 * (no dangerouslySetInnerHTML).
 */
export function htmlToPlainTextForDisplay(raw: string | null | undefined): string {
    if (raw == null) return ''
    let s = String(raw)
    if (s.trim() === '') return ''

    s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    s = s.replace(/<br\s*\/?>/gi, '\n')
    s = s.replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, '\n')
    s = s.replace(/<[^>]+>/g, ' ')
    s = decodeHtmlEntities(s)
    return s.replace(/[ \t\r\f\v]+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
}

function decodeHtmlEntities(s: string): string {
    let t = s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&#x0*27;/gi, "'")
        .replace(/&#(\d+);/g, (_, num) => {
            const code = Number(num)
            if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
            return String.fromCodePoint(code)
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const code = Number.parseInt(hex, 16)
            if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
            return String.fromCodePoint(code)
        })
    t = t.replace(/&amp;/gi, '&')
    return t
}
