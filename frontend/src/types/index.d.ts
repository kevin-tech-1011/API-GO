/**
 * A row of the manager-editable “Profile user” list. `id` is the value stored on
 * `TProfile.profileUserIndex` (slot 0 is the original “Lemon”).
 */
export type TProfileUser = {
    id: number
    name: string
}

export type TProfile = {
    id?: number
    name: string
    title: string
    phone: string
    email: string
    location: string
    street?: string | null
    race?: string | null
    experience: string
    education: string
    linkedin: string
    tech: string
    showLinkedin?: boolean
    userId: number
    bidderId: number
    guestId: number
    templateId: number
    backgroundId: number
    showLinkedin: boolean
    /** When false, hidden from non-MANAGER in profile & history lists. */
    show?: boolean
    /** `TProfileUser.id` of the assigned profile user; unset when null/undefined. */
    profileUserIndex?: number | null
    /** External calendar link; managers set from Profiles list. */
    calendarUrl?: string | null
    createdAt?: string
    updatedAt?: string
    user?: {
        email: string
    }
}

export type THistory = {
    id?: number
    company: string
    position: string
    link: string
    requirements: string
    resume: string
    /** FK to `profiles.id`; may be null for legacy rows. */
    profileId?: number | null
    userId: number
    templateId: number
    backgroundId: number
    /** Selected interview pipeline stages (multi-select). */
    statusStages?: string[]
    /** Per-status meeting details from Schedule (timezone, time, link). Keys are pipeline labels. */
    scheduleMeetingsByStatus?: Record<
        string,
        {
            timezone: string
            meetingTime: string
            meetingLink: string
        }
    >
    user?: {
        email: string
    }
    profile?: {
        id?: number
        name: string
        /** `TProfileUser.id`; null/undefined = unassigned. */
        profileUserIndex?: number | null
    }
    createdAt?: string
}

export type TSkills = {
    category: string
    list: string[]
}

export type TExperience = {
    company: string
    summary: string
    description: string[]
    position: string
    startDate: string
    endDate: string
    skills: string[]
}

export type TEducation = {
    degree: string
    field: string
    startDate: string
    endDate: string
    school: string
}

export type TResume = {
    name: string
    phone: string
    title: string
    email: string
    location: string
    summary: string
    linkedin: string
    tech: string
    skills: TSkills[]
    experience: TExperience[]
    education: TEducation[]
    additionalInfo?: object
}

export type TUser = {
    id: number
    email: string
    active: boolean
    role: 'ADMIN' | 'MANAGER' | 'BIDDER' | 'USER' | 'GUEST'
    note: string
    path: boolean
}
