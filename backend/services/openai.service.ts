import '../config/env'
import OpenAI from 'openai'
import { TProfile } from '../types'
import { getOpenAiApiKey } from '../config/env'
import moment from 'moment'

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is missing or empty. Set it in the project .env file and restart the server.'
    )
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

/** Keys the LLM schema omits; always copy from DB profile into the resume JSON string. */
const PROFILE_FIELDS_FOR_RESUME_JSON = [
  'name',
  'phone',
  'email',
  'location',
  'linkedin',
  'tech',
  'street',
] as const

/**
 * The model is instructed to output only title/summary/skills/experience/education/additionalInfo.
 * Merge stable contact / identity fields from the profile so consumers (PDF, history) get a full row.
 */
export function mergeResumeJsonWithProfileContact(
  contentJson: string,
  profile: Record<string, unknown>
): string {
  try {
    const parsed = JSON.parse(contentJson) as Record<string, unknown>
    for (const key of PROFILE_FIELDS_FOR_RESUME_JSON) {
      const v = profile[key]
      if (v == null) continue
      parsed[key] = typeof v === 'string' ? v : String(v)
    }
    return JSON.stringify(parsed)
  } catch {
    return contentJson
  }
}

export async function generateResumeContent(
  profile: TProfile,
  jobDescription: string,
  additionalInfo: string
) {
  const start = Date.now()
  const messages = [
    {
      role: 'system' as const,
      content: `
              Please create a FULL-OPTIMIZED resume specifically tailored to the job description provided.
              You must ensure the resume is 100% "Fully-Accomplishment with quantified metrics", 100% "Recruiter-friendly", 100% "ATS-friendly", and maintain all employee history without any omissions or alterations. The technical stacks and experiences must be precisely matched to the job description requirements. All output must be realistic, senior-level, role-specific, and highly polished. Eliminate all vague buzzwords such as "worked", "helped", "made", "led", "involved", "responsible for", or "contributed to". Remove any accessories or unnecessary descriptors in professional and role titles (keep high-level role titles and company-specific positions clean and impactful). Ensure every detail is specifically tailored to the job description. If the profile has multiple roles at the same company, threat them as separate entries in the experience section. All dates preseneted in the profile should be reflected in the experience section. All dates must follow MMM YYYY format.
              Set additionalInfo as null if there's no additional questions.
              Here's the JSON structure you need to generate:              
              {
                "title": "Professional title as string. Don't include any technical stacks or experiences in the title. Keep it short and impactful.",
                "summary": "Professional summary paragraph as string. Write a powerful, 3-4 sentences of professional summary that hooks a recruiter in under 10 seconds. Prioritize impact, clarity, and value. Use keywords from the job description and don't use personal pronouns (I, we, my). Eliminate all vague buzzwords such as "worked", "helped", "made", "led", "involved", "responsible for", or "contributed to". Markup as bold unique strengths, soft & hard skills, quantifiable achievements, and years of experience. Indicate years of work experience and if it's over 8 years, indicate as 8+. Emphasize alignment with the job description and company values.",
                "skills": [
                  {
                    "category": "Skill category name as string (e.g., 'Backend', 'Frontend', 'DevOps'). Include at least 3-5 categories.",
                    "list": "Array of strings. List 8-12 relevant skills for this category based on the job description."
                  }
                ],
                "experience": [
                  {
                    "company": "Company name as string.",
                    "position": "Job position title as string",
                    "startDate": "Start date as string in MMM YYYY format",
                    "endDate": "End date as string in MMM YYYY format (or 'Present' if current)",
                    "description": "Array of strings. Each string is a tailored bullet point with quantified accomplishments. Each bullet must be 100+ characters.
                    Rules: Use no personal pronouns (I, we, my), markup as bold technical skills, unique strengths, soft & hard skills and quantifiable archievements and mark them, include 9+ bullets for latest role and 6-8 for other roles. Each bullet must: (1) start with a unique action verb, (2) mention a realistic project name, (3) include actual technologies used, (4) show measurable business impact, (5) describe a specific technical challenge. No duplicate action verbs across the entire resume. Do not fabricate—all projects must be plausible.",
                    "skills": "Array of strings. List all technologies and skills used in this role.",
                    "summary": "One-sentence summary as string. Markup as bold key accomplishments, impact, and quantifiable results. Focus on what was achieved, not tasks performed." 
                  }
                ],
                "education": [
                  {
                    "startDate": "Start date as string in MMM YYYY format",
                    "endDate": "End date as string in MMM YYYY format",
                    "degree": "Degree name as string (e.g., 'Bachelor's degree')",
                    "field": "Field of study as string (e.g., 'Computer Science')",
                    "school": "School or university name as string"
                  }
                ],
                "additionalInfo": {
                  ["Question from additional questions as string"]: "Answer to the question as string. Write 2 ~ 3 sentences that fit to the question and job requirements."
                }
              }

              Ensure the final output reads as a perfect blend of clear information and genuine human expression.
            `,
    },
    {
      role: 'user' as const,
      content: `
              Profile: ${JSON.stringify(profile)}
              Job Description: ${jobDescription}
              Additional Questions: ${additionalInfo}
            `,
    },
  ]

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.4-nano',
      messages,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('No content received from OpenAI')
    }
    return mergeResumeJsonWithProfileContact(
      content,
      profile as unknown as Record<string, unknown>
    )
  } catch (error) {
    console.error('[OpenAI] generateResumeContent failed', error)
    throw error
  } finally {
    const duration = Date.now() - start
    console.info(`[OpenAI] generateResumeContent took ${duration}ms`)
  }
}

export type CalendarEventBrief = {
  summary?: string
  description?: string
  dtstart?: string
  dtend?: string
  uid?: string
}

export type CalendarExtractedRow = {
  company: string
  position: string
  status: string
  meetingTimeIso: string
  location: string
}

type CalendarAiRow = {
  company?: string
  position?: string
  status?: string
  meetingTimeIso?: string
  location?: string
}

export function parseCalendarDtStartToIso(dtstart?: string): string {
  if (dtstart == null || String(dtstart).trim() === '') {
    return new Date().toISOString()
  }
  const s = String(dtstart).trim()
  let m = moment.utc(s, moment.ISO_8601, true)
  if (!m.isValid()) m = moment.utc(s)
  return m.isValid() ? m.toISOString() : new Date().toISOString()
}

function fallbackRow(ev: CalendarEventBrief): CalendarExtractedRow {
  const summary = (ev.summary || '').trim() || 'Event'
  const cleanedSummary = normalizeWhitespace(summary).slice(0, 300)
  const company = inferCompany(cleanedSummary, ev.description)
  const position = inferPosition(cleanedSummary, ev.description)
  const status = inferStatus(cleanedSummary, ev.description)
  const location = inferLocation(ev.description)
  return {
    company,
    position,
    status,
    meetingTimeIso: parseCalendarDtStartToIso(ev.dtstart),
    location,
  }
}

/**
 * Fast deterministic extraction from event summary/description.
 * Keeps output shape stable for the calendar upload route.
 */
export async function extractCalendarScheduleRows(
  events: CalendarEventBrief[]
): Promise<CalendarExtractedRow[]> {
  if (events.length === 0) return []
  const start = Date.now()
  const fallback = events.map((ev) => fallbackRow(ev))
  const aiRows = await extractCalendarScheduleRowsWithOpenAi(events)
  const merged =
    aiRows == null
      ? fallback
      : fallback.map((row, i) => mergeAiRowWithFallback(aiRows[i], row))
  const out = await resolveUnknownCompanies(merged, events)
  console.info(
    `[Calendar] extractCalendarScheduleRows ${events.length} events in ${Date.now() - start}ms`
  )
  return out
}

function mergeAiRowWithFallback(
  ai: CalendarAiRow | undefined,
  fallback: CalendarExtractedRow
): CalendarExtractedRow {
  let company = cleanModelText(ai?.company, 200) || fallback.company
  if (isUnknownCompany(company)) {
    const fromUrl =
      inferCompanyFromUrl(cleanModelText(ai?.location, 300)) ||
      inferCompanyFromUrl(fallback.location)
    if (fromUrl) company = fromUrl
  }
  const position = cleanModelText(ai?.position, 200) || fallback.position
  const status = normalizeStatusLabel(ai?.status) || fallback.status
  const location = cleanModelText(ai?.location, 300) || fallback.location
  const meetingTimeIso = parseCalendarDtStartToIso(ai?.meetingTimeIso || fallback.meetingTimeIso)
  return { company: normalizeCompany(company), position, status, meetingTimeIso, location }
}

function cleanModelText(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') return ''
  return normalizeWhitespace(v).slice(0, maxLen)
}

function normalizeStatusLabel(raw: unknown): string {
  const s = normalizeWhitespace(typeof raw === 'string' ? raw : '').toLowerCase()
  if (!s) return ''
  if (s.includes('offer') || s.includes('hired') || s.includes('accepted')) return 'Offer'
  if (
    s.includes('finished') ||
    s.includes('cancel') ||
    s.includes('reject') ||
    s.includes('declin') ||
    s.includes('withdrawn') ||
    s.includes('closed')
  ) {
    return 'Finished'
  }
  if (
    s.includes('assessment') ||
    s.includes('take-home') ||
    s.includes('take home') ||
    s.includes('coding challenge') ||
    s.includes('online assessment')
  ) {
    return 'Assessment'
  }
  if (
    s.includes('tech interview-2') ||
    s.includes('technical interview-2') ||
    s.includes('final round') ||
    s.includes('onsite') ||
    s.includes('panel') ||
    s.includes('loop')
  ) {
    return 'Tech Interview-2'
  }
  if (
    s.includes('tech interview-1') ||
    s.includes('technical interview') ||
    s.includes('hiring manager') ||
    s.includes('engineering chat')
  ) {
    return 'Tech Interview-1'
  }
  if (s.includes('intro')) return 'Intro Interview'
  return ''
}

async function extractCalendarScheduleRowsWithOpenAi(
  events: CalendarEventBrief[]
): Promise<CalendarAiRow[] | null> {
  try {
    const chunks = chunkEvents(events, 20)
    const all: CalendarAiRow[] = []
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]!
      const rows = await extractCalendarScheduleChunkWithOpenAi(chunk)
      if (!rows || rows.length !== chunk.length) return null
      all.push(...rows)
    }
    return all.length === events.length ? all : null
  } catch (error) {
    console.error('[Calendar] OpenAI extraction failed', error)
    return null
  }
}

function chunkEvents(events: CalendarEventBrief[], size: number): CalendarEventBrief[][] {
  const out: CalendarEventBrief[][] = []
  for (let i = 0; i < events.length; i += size) {
    out.push(events.slice(i, i + size))
  }
  return out
}

async function extractCalendarScheduleChunkWithOpenAi(
  events: CalendarEventBrief[]
): Promise<CalendarAiRow[] | null> {
  const payload = events.map((e) => ({
    summary: normalizeWhitespace(e.summary).slice(0, 500),
    description: normalizeWhitespace(e.description).slice(0, 2000),
    dtstart: normalizeWhitespace(e.dtstart).slice(0, 100),
    dtend: normalizeWhitespace(e.dtend).slice(0, 100),
    uid: normalizeWhitespace(e.uid).slice(0, 200),
  }))

  const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.4-nano',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Extract hiring schedule rows from calendar events.
Return only valid JSON as:
{"rows":[{"company":"","position":"","status":"","meetingTimeIso":"","location":""}]}
Rules:
- Keep rows count equal to input events count, same order.
- status must be one of: Intro Interview, Assessment, Tech Interview-1, Tech Interview-2, Offer, Finished.
- Prefer dtstart converted to ISO string for meetingTimeIso.
- company/position should be concise and realistic, no extra commentary.
- location should be URL if present, else "Remote" or "TBD".
- Never include markdown or code fences.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ events: payload }),
      },
    ],
  })

  const content = response.choices?.[0]?.message?.content
  if (!content) return null
  const parsed = JSON.parse(content) as { rows?: unknown[] }
  if (!Array.isArray(parsed.rows)) return null
  return parsed.rows.map((r) => {
    const o = r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : {}
    return {
      company: typeof o.company === 'string' ? o.company : undefined,
      position: typeof o.position === 'string' ? o.position : undefined,
      status: typeof o.status === 'string' ? o.status : undefined,
      meetingTimeIso: typeof o.meetingTimeIso === 'string' ? o.meetingTimeIso : undefined,
      location: typeof o.location === 'string' ? o.location : undefined,
    }
  })
}

function normalizeWhitespace(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/\s+/g, ' ').trim()
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function cleanText(s: string | undefined): string {
  return normalizeWhitespace(decodeEntities(stripHtmlTags(s || '')))
}

function inferCompany(summary?: string, description?: string): string {
  const s = cleanText(summary)
    .replace(/^suggested!+\s*/i, '')
    .replace(/^suggested\s*/i, '')
  const d = cleanText(description)
  const hostCompany = inferCompanyFromUrl(d)
  if (hostCompany) return hostCompany
  const summaryCandidates = [
    /interview with\s+([^|,\-@!]+)/i,
    /chat with\s+([^|,\-@!]+)/i,
    /discuss .*? role at\s+([^|,\-@!]+)/i,
    /^([^|]+)\|\s*[^|]+$/i,
    /@\s*([A-Za-z0-9&'. -]{2,80})/i,
  ]
  for (const re of summaryCandidates) {
    const m = s.match(re)
    const c = normalizeWhitespace(m?.[1] || '')
    if (c && !isGenericCompany(c)) return c.slice(0, 200)
  }
  const descCandidates = [
    /\bposition title\b[:\s-]+([^|,\n]+)/i,
    /\bjob title\b[:\s-]+([^|,\n]+)/i,
    /\b(?:at|from)\s+([A-Za-z0-9&'. -]{2,80})\b/i,
  ]
  for (const re of descCandidates) {
    const m = d.match(re)
    const c = normalizeWhitespace(m?.[1] || '')
    if (c && !isGenericCompany(c)) return c.slice(0, 200)
  }
  const fallback = s.split('|')[0]?.split('-')[0]?.trim() || 'Unknown'
  return normalizeWhitespace(fallback).slice(0, 200) || 'Unknown'
}

function isGenericCompany(v: string): boolean {
  return /^(interview|meeting|call|phone screening|recruiter chat)$/i.test(v.trim())
}

function isUnknownCompany(v: string | undefined): boolean {
  const t = normalizeWhitespace(v || '').toLowerCase()
  if (!t) return true
  if (isGenericCompany(t)) return true
  return ['unknown', 'none', 'null', 'n/a', 'na', 'tbd', '-'].includes(t)
}

function normalizeCompany(v: string | undefined): string {
  const t = normalizeWhitespace(v || '')
  if (isUnknownCompany(t)) return 'Unknown'
  return t.slice(0, 200)
}

function inferPosition(summary?: string, description?: string): string {
  const s = cleanText(summary)
  const d = cleanText(description)
  const summaryRoleOnly = s.match(/^(.+?)\s+interview(?:\s*-\s*.*)?$/i)
  const roleFromSummary = normalizeRole(summaryRoleOnly?.[1] || '')
  if (roleFromSummary) return roleFromSummary.slice(0, 200)

  const descRoleOnly = d.match(/\bjob application\s*-\s*([^.,\n]+)/i)
  const roleFromDesc = normalizeRole(descRoleOnly?.[1] || '')
  if (roleFromDesc) return roleFromDesc.slice(0, 200)

  const patterns = [
    /\|\s*([^|]+)$/i,
    /-\s*(senior|staff|lead|principal|sr\.?)?[^|]+engineer[^|]*/i,
    /\b(?:role to discuss|position title|job title)\b[:\s-]+([^|,\n]+)/i,
    /\bfor\s+([^|,\n]+(?:engineer|developer|architect|manager|consultant)[^|,\n]*)/i,
  ]
  for (const re of patterns) {
    const m1 = s.match(re)
    const fromSummary = normalizeWhitespace(m1?.[1] || m1?.[0] || '')
    if (fromSummary && fromSummary.length >= 3) return fromSummary.slice(0, 200)
    const m2 = d.match(re)
    const fromDesc = normalizeWhitespace(m2?.[1] || m2?.[0] || '')
    if (fromDesc && fromDesc.length >= 3) return fromDesc.slice(0, 200)
  }
  if (/recruiter|screen/i.test(`${s} ${d}`)) return 'Recruiter Screen'
  return 'Interview'
}

function inferStatus(summary?: string, description?: string): string {
  const text = `${cleanText(summary)} ${cleanText(description)}`.toLowerCase()
  if (/(offer|accepted|hired)/.test(text)) return 'Offer'
  if (/(cancelled|canceled|rejected|declined|withdrawn|finished|closed)/.test(text))
    return 'Finished'
  if (/(assessment|take[- ]home|homework|coding challenge|oa\b|online assessment)/.test(text))
    return 'Assessment'
  if (/(final round|onsite|panel|loop|interview 2|interview ii|tech interview-2)/.test(text))
    return 'Tech Interview-2'
  if (/(technical interview|engineering chat|hiring manager)/.test(text))
    return 'Tech Interview-1'
  return 'Intro Interview'
}

function inferLocation(description?: string): string {
  const d = cleanText(description)
  const urlMatch = d.match(/https?:\/\/[^\s)<>"]+/i)
  if (urlMatch?.[0]) return urlMatch[0].slice(0, 300)
  if (/(zoom|google meet|teams|web conference|video call|remote)/i.test(d)) {
    return 'Remote'
  }
  return 'TBD'
}

function normalizeRole(raw: string): string {
  const t = normalizeWhitespace(raw)
    .replace(/\b(interview|assessment|screen(?:ing)?|call)\b/gi, '')
    .replace(/\s*-\s*(google meet|zoom|microsoft teams|teams|meet).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return t
}

function inferCompanyFromUrl(text: string): string {
  const urlMatch = text.match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[\/\s]|$)/i)
  if (!urlMatch?.[1]) return ''
  const host = urlMatch[1].toLowerCase()
  if (host.includes('google.com') || host.includes('zoom.us') || host.includes('microsoft.com')) {
    return ''
  }
  const labels = host.split('.')
  if (labels.length === 0) return ''
  let brand = labels[0] || ''
  if (labels.length >= 3 && ['www', 'app', 'api', 'meet'].includes(brand)) {
    brand = labels[1] || brand
  }
  if (!brand) return ''
  // Keep subdomain brand as-is (e.g. people10.freshteam.com -> people10)
  return brand.slice(0, 200)
}

async function resolveUnknownCompanies(
  rows: CalendarExtractedRow[],
  events: CalendarEventBrief[]
): Promise<CalendarExtractedRow[]> {
  const unresolved = rows
    .map((row, index) => ({ row, index, event: events[index] }))
    .filter(({ row }) => isUnknownCompany(row.company))
  if (unresolved.length === 0) return rows

  try {
    const payload = unresolved.map(({ index, row, event }) => ({
      index,
      summary: normalizeWhitespace(event?.summary).slice(0, 400),
      description: normalizeWhitespace(event?.description).slice(0, 1600),
      location: normalizeWhitespace(row.location).slice(0, 300),
    }))

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.4-nano',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Infer company names for hiring schedule rows.
Return valid JSON only:
{"rows":[{"index":0,"company":"people10"}]}
Rules:
- Preserve each index from input.
- If URL contains subdomain (example: people10.freshteam.com), company must be that subdomain ("people10").
- Company should be concise lowercase/brand text only, no explanation.
- If still unknown, return "Unknown".
- Never include markdown/code fences.`,
        },
        { role: 'user', content: JSON.stringify({ rows: payload }) },
      ],
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) return rows
    const parsed = JSON.parse(content) as {
      rows?: Array<{ index?: number; company?: string }>
    }
    if (!Array.isArray(parsed.rows)) return rows

    const map = new Map<number, string>()
    for (const r of parsed.rows) {
      const idx = Number(r?.index)
      if (!Number.isFinite(idx)) continue
      const company = normalizeCompany(r?.company)
      if (!isUnknownCompany(company)) map.set(idx, company)
    }

    return rows.map((row, i) => {
      const company = map.get(i)
      return company ? { ...row, company } : row
    })
  } catch (error) {
    console.error('[Calendar] company recovery failed', error)
    return rows
  }
}
