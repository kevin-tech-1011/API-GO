import Template1 from './Template1'
import Template2 from './Template2'
import type { TResume } from '../types/resumePdf'

type Props = {
    profile: TResume
    templateId: number
    backgroundImageSrc: string | null
    showLinkedin: boolean
}

/** Mirrors `frontend/src/components/ResumeTemplate/index.tsx` template switch. */
export default function ResumePdfDocument({
    profile,
    templateId,
    backgroundImageSrc,
    showLinkedin,
}: Props) {
    if (templateId === 2) {
        return (
            <Template2
                profile={profile}
                backgroundImageSrc={backgroundImageSrc}
                showLinkedin={showLinkedin}
            />
        )
    }
    return (
        <Template1
            profile={profile}
            backgroundImageSrc={backgroundImageSrc}
            showLinkedin={showLinkedin}
        />
    )
}
