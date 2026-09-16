import { TResume } from '@/types'
import Template1 from './Template1'
import Template2 from './Template2'

interface TemplateProps {
    backgroundId?: number
    templateId?: number
    profile: TResume | null
    showLinkedin?: boolean
}

const ResumeTemplate: React.FC<TemplateProps> = ({
    backgroundId = 0,
    templateId = 0,
    profile,
    showLinkedin = true,
}) => {
    switch (templateId) {
        case 1:
            return <Template1 profile={profile} backgroundId={backgroundId} showLinkedin={showLinkedin} />
        case 2:
            return <Template2 profile={profile} backgroundId={backgroundId} showLinkedin={showLinkedin} />
        default:
            return <Template1 profile={profile} backgroundId={backgroundId} showLinkedin={showLinkedin} />
    }
}

export default ResumeTemplate
