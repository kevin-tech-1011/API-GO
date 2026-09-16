
export const USER_ROLES = {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    BIDDER: 'BIDDER',
    USER: 'USER',
    GUEST: 'GUEST',
}

/** Roles assignable from the Users page Role column. */
export const ASSIGNABLE_USER_ROLES = [
    USER_ROLES.ADMIN,
    USER_ROLES.MANAGER,
    USER_ROLES.USER,
] as const

/** Roles that can manage users and see all tenants' data (admin UI). */
export const ADMIN_ACCESS_ROLES = [USER_ROLES.ADMIN, USER_ROLES.MANAGER]

/**
 * Stored at the start of `histories.requirements` for calendar OpenAI imports.
 * Excluded from History + Schedule list APIs; shown only on Calendar Schedule Table (`calendarImport=1`).
 */
export const CALENDAR_IMPORT_REQUIREMENTS_TAG = '[calendar-import]' as const

/** Allowed pipeline labels for history `statusStages` (multi-select). */
export const HISTORY_INTERVIEW_STATUS_OPTIONS = [
    'Intro Interview',
    'Assessment',
    'Tech Interview-1',
    'Tech Interview-2',
    'Offer',
    'Finished',
] as const
