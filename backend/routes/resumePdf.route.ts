import '../pdf/ensureReactGlobal'
import { Router } from 'express'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { setupPdfFonts } from '../pdf/setupPdfFonts'
import { resolveBackgroundImageSrc } from '../pdf/assetPaths'
import ResumePdfDocument from '../pdf/ResumePdfDocument'
import type { TResume } from '../types/resumePdf'

const router = Router()

const MAX_JSON_STRING_UNWRAP = 6
const MAX_RESUME_UNWRAP_DEPTH = 10

function flattenBodyData(body: Record<string, unknown>): Record<string, unknown> {
    const inner = body.data
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        return { ...body, ...(inner as Record<string, unknown>) }
    }
    return body
}

/** LLMs and some HTTP clients send JSON wrapped in ```json ... ``` fences. */
function stripJsonFences(s: string): string {
    let t = s.trim()
    if (t.startsWith('```')) {
        t = t.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    }
    return t.trim()
}

/** Strict parse, then slice from first `{` to last `}` (handles trailing prose / bad delimiters). */
function parseJsonFlexible(s: string): unknown | null {
    const t = stripJsonFences(s)
    if (!t) return null
    try {
        return JSON.parse(t)
    } catch {
        const start = t.indexOf('{')
        const end = t.lastIndexOf('}')
        if (start === -1 || end <= start) return null
        try {
            return JSON.parse(t.slice(start, end + 1))
        } catch {
            return null
        }
    }
}

/** Double-encoded bodies: JSON string that parses to another JSON string, etc. */
function deepUnwrapStringifiedJson(raw: unknown): unknown {
    let v: unknown = raw
    for (let i = 0; i < MAX_JSON_STRING_UNWRAP; i++) {
        if (typeof v !== 'string') break
        const next = parseJsonFlexible(v)
        if (next == null) break
        v = next
    }
    return v
}

function coerceNonEmptyName(v: unknown): string | null {
    if (v == null) return null
    if (typeof v === 'string') {
        const t = v.trim()
        return t !== '' ? t : null
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
        return String(v)
    }
    return null
}

function inferNameFromContactFields(o: Record<string, unknown>): string | null {
    const linkedin = o.linkedin
    if (typeof linkedin === 'string' && linkedin.includes('linkedin.com')) {
        const m = linkedin.match(/\/in\/([^/?#]+)/i)
        if (m?.[1]) {
            try {
                return decodeURIComponent(m[1]).replace(/-/g, ' ').trim() || null
            } catch {
                return m[1].replace(/-/g, ' ').trim() || null
            }
        }
    }
    const email = o.email
    if (typeof email === 'string' && email.includes('@')) {
        const local = email.split('@')[0].replace(/[._]+/g, ' ').trim()
        return local !== '' ? local : null
    }
    return null
}

function hasResumeLikeFields(o: Record<string, unknown>): boolean {
    return (
        (Array.isArray(o.experience) && o.experience.length > 0) ||
        (Array.isArray(o.skills) && o.skills.length > 0) ||
        (typeof o.summary === 'string' && o.summary.trim() !== '') ||
        (typeof o.title === 'string' && o.title.trim() !== '') ||
        (Array.isArray(o.education) && o.education.length > 0) ||
        coerceNonEmptyName(o.name) != null
    )
}

function mergeDisplayName(
    resume: Record<string, unknown>,
    body: Record<string, unknown>
): Record<string, unknown> {
    const existing = coerceNonEmptyName(resume.name)
    if (existing) {
        return { ...resume, name: existing }
    }
    const fromBody =
        coerceNonEmptyName(body.name) ??
        coerceNonEmptyName(body.profileName) ??
        coerceNonEmptyName(body.candidateName) ??
        coerceNonEmptyName(body.fullName)
    if (fromBody) {
        return { ...resume, name: fromBody }
    }
    const prof = body.profile
    if (prof && typeof prof === 'object' && !Array.isArray(prof)) {
        const pn = coerceNonEmptyName((prof as Record<string, unknown>).name)
        if (pn) return { ...resume, name: pn }
    }
    return resume
}

const CONTACT_KEYS = ['location', 'phone', 'email', 'linkedin', 'tech'] as const

function contactFieldMissing(v: unknown): boolean {
    if (v == null) return true
    if (typeof v !== 'string') return false
    const t = v.trim()
    return t === '' || t === 'undefined'
}

function pickContactString(source: Record<string, unknown>, key: string): string | undefined {
    const v = source[key]
    if (v == null) return undefined
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v !== 'string') return undefined
    const t = v.trim()
    if (t === '' || t === 'undefined') return undefined
    return t
}

/** LLM resume JSON often omits contact info; merge from POST body or nested `profile`. */
function mergeContactFromBody(
    resume: Record<string, unknown>,
    body: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...resume }
    const prof =
        body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile)
            ? (body.profile as Record<string, unknown>)
            : null

    for (const key of CONTACT_KEYS) {
        if (!contactFieldMissing(out[key])) continue
        const fromBody = pickContactString(body, key)
        const fromProf = prof ? pickContactString(prof, key) : undefined
        const chosen = fromBody ?? fromProf
        if (chosen !== undefined) out[key] = chosen
    }
    return out
}

/**
 * Accepts: object, JSON string (possibly multi-encoded), history rows `{ resume: "<json>" }`,
 * and single-key wrappers (`content`, `payload`, …).
 */
function extractResumeRecord(
    raw: unknown,
    body: Record<string, unknown>,
    depth = 0
): Record<string, unknown> | null {
    if (depth > MAX_RESUME_UNWRAP_DEPTH) return null
    const v = deepUnwrapStringifiedJson(raw)
    if (v == null) return null
    if (typeof v !== 'object' || Array.isArray(v)) return null
    const o = v as Record<string, unknown>
    const mergedBody = { ...body, ...o }

    if (o.resume != null && o.resume !== o) {
        const inner = extractResumeRecord(o.resume, mergedBody, depth + 1)
        if (inner) {
            return mergeDisplayName(inner, mergedBody)
        }
    }

    if (hasResumeLikeFields(o)) {
        return mergeDisplayName(o, mergedBody)
    }

    for (const k of ['content', 'payload', 'result', 'output'] as const) {
        if (!(k in o) || o[k] == null || o[k] === o) continue
        const inner = extractResumeRecord(o[k], mergedBody, depth + 1)
        if (inner) return inner
    }

    return null
}

function normalizeResume(input: Record<string, unknown>): TResume {
    const str = (v: unknown): string => {
        if (v == null) return ''
        if (typeof v === 'string') return v.trim() === 'undefined' ? '' : v
        if (typeof v === 'number' && Number.isFinite(v)) return String(v)
        return String(v)
    }
    const r = input as unknown as Partial<TResume>
    const base: TResume = {
        name: str(input.name),
        phone: str(input.phone),
        title: str(input.title),
        email: str(input.email),
        location: str(input.location),
        summary: str(input.summary),
        linkedin: str(input.linkedin),
        tech: str(input.tech),
        experience: Array.isArray(r.experience) ? r.experience : [],
        education: Array.isArray(r.education) ? r.education : [],
        skills: Array.isArray(r.skills) ? r.skills : [],
    }
    if (
        input.additionalInfo != null &&
        typeof input.additionalInfo === 'object' &&
        !Array.isArray(input.additionalInfo)
    ) {
        return { ...base, additionalInfo: input.additionalInfo as object }
    }
    return base
}

function finalizeResumeRecord(
    rec: Record<string, unknown>,
    body: Record<string, unknown>
): TResume | null {
    const merged = mergeContactFromBody(mergeDisplayName(rec, body), body)
    let name =
        coerceNonEmptyName(merged.name) ?? inferNameFromContactFields(merged)
    if (!name && hasResumeLikeFields(merged)) {
        name = 'Resume'
    }
    if (!name) return null
    return normalizeResume({ ...merged, name })
}

function parseResumeFromBody(body: Record<string, unknown>): TResume | null {
    const b = flattenBodyData(body)

    if (b.profile && typeof b.profile === 'object' && b.profile !== null) {
        return finalizeResumeRecord(b.profile as Record<string, unknown>, b)
    }

    for (const key of ['resume', 'content', 'resumeText'] as const) {
        const extracted = extractResumeRecord(b[key], b)
        if (extracted) {
            return finalizeResumeRecord(extracted, b)
        }
    }

    if (
        typeof b.name === 'string' &&
        b.name.trim() !== '' &&
        (Array.isArray(b.experience) ||
            typeof b.title === 'string' ||
            Array.isArray(b.education) ||
            Array.isArray(b.skills))
    ) {
        return finalizeResumeRecord(b, b)
    }

    return null
}

/**
 * POST /api/pdf/render
 * Body: `{ data?, resumeText?, resume?, content?, profile?, name?, profileName?, templateId?, backgroundId?, showLinkedin? }`
 * — `resume` / `content` / `resumeText` may be a JSON object or a JSON string (and optional ``` fences).
 * — If the resume JSON has no `name`, set `name` or `profileName` on the body (or use `profile`).
 * — Contact fields (`location`, `phone`, `email`, `linkedin`, `tech`) may be sent on the body or on `profile` when the resume JSON (e.g. LLM output) omits them.
 * Returns `application/pdf` bytes (same documents as the in-browser React-PDF flow).
 */
router.post('/render', async (req, res) => {
    try {
        const body = req.body as Record<string, unknown>
        const profile = parseResumeFromBody(body)
        if (!profile || typeof profile.name !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing resume payload' })
        }

        console.log('profile', profile)

        const templateId = Number(body.templateId ?? 0)
        const backgroundId = Number(body.backgroundId ?? 0)
        const showLinkedin = body.showLinkedin !== false

        setupPdfFonts()
        const backgroundImageSrc = resolveBackgroundImageSrc(backgroundId)

        const element = React.createElement(ResumePdfDocument, {
            profile,
            templateId,
            backgroundImageSrc,
            showLinkedin,
        })

        // `renderToBuffer` types require `<Document />`; our component renders one at runtime.
        const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0])
        const safeName = profile.name.replace(/[^\w\s-]/g, '').trim() || 'resume'
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
        res.send(buffer)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('PDF render failed:', err)
        res.status(500).json({ error: 'PDF render failed', message })
    }
})

export default router
