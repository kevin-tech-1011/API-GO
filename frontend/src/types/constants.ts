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

export const ADMIN_ROLES = {
    MANAGER: USER_ROLES.MANAGER,
}

export function isAdminAccessRole(role: string | undefined): boolean {
    return role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER
}

export function isAppUserRole(role: string | undefined): boolean {
    return role === USER_ROLES.USER
}

export const MAX_TEMPLATES = 2

export const RESUME_BACKGROUNDS = [
    { value: 0, label: 'No Background' },
    { value: 1, label: 'Particle Dots' },
    { value: 2, label: 'Dot Flow' },
    { value: 3, label: 'Hexagon' },
]

export const RESUME_TEMPLATES = [
    { value: 1, label: 'Modern' },
    { value: 2, label: 'Classic' },
    { value: 3, label: 'Minimalist' },
]

/** History table pipeline stages (must match backend HISTORY_INTERVIEW_STATUS_OPTIONS). */
export const INTERVIEW_STATUS_OPTIONS = [
    'Intro Interview',
    'Assessment',
    'Tech Interview-1',
    'Tech Interview-2',
    'Offer',
    'Finished',
] as const

/** Ant Design Tag `color` per pipeline stage (left-to-right progression). */
export const INTERVIEW_STATUS_TAG_COLORS: Record<
    (typeof INTERVIEW_STATUS_OPTIONS)[number],
    string
> = {
    'Intro Interview': 'blue',
    Assessment: 'volcano',
    'Tech Interview-1': 'geekblue',
    'Tech Interview-2': 'purple',
    Offer: 'gold',
    Finished: 'green',
}