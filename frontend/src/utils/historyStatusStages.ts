import type { THistory } from '../types'
import { INTERVIEW_STATUS_OPTIONS } from '../types/constants'

const allowedStatusSet = new Set<string>(INTERVIEW_STATUS_OPTIONS)

export function parseStatusStages(record: THistory): string[] {
    const raw = record.statusStages
    if (Array.isArray(raw)) {
        return raw.filter(
            (x): x is string =>
                typeof x === 'string' && allowedStatusSet.has(x)
        )
    }
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw) as unknown
            if (Array.isArray(p)) {
                return p.filter(
                    (x): x is string =>
                        typeof x === 'string' && allowedStatusSet.has(x)
                )
            }
        } catch {
            return []
        }
    }
    return []
}

/** Most advanced selected stage (last in pipeline order), or null if none. */
export function getLatestStatusStage(record: THistory): string | null {
    const stages = parseStatusStages(record)
    for (let i = INTERVIEW_STATUS_OPTIONS.length - 1; i >= 0; i--) {
        const label = INTERVIEW_STATUS_OPTIONS[i]!
        if (stages.includes(label)) return label
    }
    return null
}
