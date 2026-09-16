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
