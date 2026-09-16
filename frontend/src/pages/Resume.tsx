import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    App,
    Button,
    Card,
    Divider,
    Drawer,
    Form,
    Input,
    Radio,
    Spin,
    Checkbox,
} from 'antd'
import type { RadioChangeEvent } from 'antd'
import {
    DownloadOutlined,
    EditOutlined,
    RobotOutlined,
} from '@ant-design/icons'
import { useParams } from 'react-router-dom'

import { TProfile, TResume } from '../types'
import { RESUME_BACKGROUNDS, RESUME_TEMPLATES } from '../types/constants'
import { getProfile, onGenerateResume } from '../actions/profiles'
import { createHistory } from '../actions/history'

import ResumeTemplate from '../components/ResumeTemplate'
import ResumeEditor from '../components/ResumeEditor'
import { PDFViewer, pdf } from '@react-pdf/renderer'
import { saveAs } from 'file-saver'
import PageShell from '@/components/PageShell'

const { Item: FormItem } = Form
const { TextArea } = Input

const Resume = (): JSX.Element => {
    const { message } = App.useApp()
    const { id } = useParams()
    const [form] = Form.useForm<{
        title: string
        company: string
        link?: string
        description: string
        additionalInfo: string
        showLinkedin?: boolean
    }>()
    const [showLinkedin, setShowLinkedin] = useState<boolean>(true)
    const [loading, setLoading] = useState<boolean>(false)
    const [isGenerating, setIsGenerating] = useState<boolean>(false)
    const [profile, setProfile] = useState<TProfile | null>(null)
    const [resume, setResume] = useState<TResume | null>(null)
    const [description, setDescription] = useState<string>('')
    const [additionalInfo, setAdditionalInfo] = useState<string>('')
    const [templateId, setTemplateId] = useState<number>(1)
    const [backgroundId, setBackgroundId] = useState<number>(0)
    const [editorOpen, setEditorOpen] = useState<boolean>(false)
    const [draft, setDraft] = useState<TResume | null>(null)
    const [previewDraft, setPreviewDraft] = useState<TResume | null>(null)

    const rules = useMemo(
        () => ({
            title: [{ required: true, message: 'Please input Job Title' }],
            company: [{ required: true, message: 'Please input Company Name' }],
            link: [{ required: false, message: 'Please input Job Link' }],
            description: [
                { required: false, message: 'Please input Job Description' },
            ],
            additionalInfo: [
                { required: false, message: 'Please input Additional Information' },
            ],
        }),
        []
    )

    const loadProfile = useCallback(
        async (profileId: number) => {
            setLoading(true)
            try {
                const resp = await getProfile(profileId)
                setProfile(resp)
                if (resp?.templateId !== undefined) {
                    setTemplateId(resp.templateId)
                }
                if (resp?.backgroundId !== undefined) {
                    setBackgroundId(resp.backgroundId)
                }

                setShowLinkedin(resp.showLinkedin || false)
                form.setFieldsValue({ showLinkedin: resp.showLinkedin || false })
            } catch {
                message.error('Failed to load profile')
            } finally {
                setLoading(false)
            }
        },
        [form]
    )

    useEffect(() => {
        if (!id) return
        loadProfile(+id)
    }, [id, loadProfile])

    // Keep the in-drawer live preview off the typing hot path (re-render the PDF
    // a short beat after edits settle, not on every keystroke).
    useEffect(() => {
        if (!editorOpen || !draft) return
        const timer = setTimeout(() => setPreviewDraft(draft), 400)
        return () => clearTimeout(timer)
    }, [draft, editorOpen])

    const openEditor = () => {
        if (!resume) return
        // Deep clone so edits stay in the draft until the user applies them.
        const clone: TResume = JSON.parse(JSON.stringify(resume))
        setDraft(clone)
        setPreviewDraft(clone)
        setEditorOpen(true)
    }

    const applyEdits = () => {
        if (draft) {
            setResume(draft)
            message.success('Resume updated')
        }
        setEditorOpen(false)
    }

    const closeEditor = () => setEditorOpen(false)

    const onGenerate = async () => {
        if (description.trim() === '') return
        if (!id) {
            message.error('Invalid request')
            return
        }
        if (isGenerating) return

        setIsGenerating(true)
        try {
            const generatedResume: TResume = await onGenerateResume(
                Number(id),
                description,
                additionalInfo
            )
            setResume({
                ...generatedResume,
                name: profile?.name || '',
                email: profile?.email || '',
                location: profile?.location || '',
                phone: profile?.phone || '',
                linkedin: profile?.linkedin || '',
                tech: profile?.tech || '',
            })
        } catch (e) {
            message.error(
                e instanceof Error ? e.message : 'Failed to generate resume'
            )
        } finally {
            setIsGenerating(false)
        }
    }

    const saveHistory = async (): Promise<boolean> => {
        let information = ''
        Object.entries(resume?.additionalInfo || {}).forEach(
            ([question, answer]) => {
                information += `${question}: ${answer}\n`
            }
        )

        const jobDesc = description ? `Job Description:\n${description}\n` : ''
        const addInfo = information
            ? `Additional Information:\n${information}`
            : ''

        const fullDescription =
            jobDesc +
            (jobDesc && addInfo ? '\n===============================\n' : '') +
            addInfo

        try {
            const { data } = await createHistory({
                company: form.getFieldValue('company'),
                position: form.getFieldValue('title'),
                link: form.getFieldValue('link') || 'N/A',
                requirements: fullDescription,
                resume: JSON.stringify(resume),
                templateId: templateId,
                backgroundId: backgroundId,
                profileId:
                    profile?.id != null && profile.id > 0 ? profile.id : undefined,
                userId: profile?.userId || 0,
            })

            if (data) {
                message.success('Resume saved to history')
                return true
            }
            return false
        } catch {
            message.error('Failed to save history')
            return false
        }
    }

    const downloadPDF = async () => {
        try {
            const fileName = `${profile?.name}.pdf`
            const blob = await pdf(
                <ResumeTemplate
                    profile={resume}
                    templateId={templateId}
                    backgroundId={backgroundId}
                    showLinkedin={showLinkedin}
                />
            ).toBlob()

            saveAs(blob, fileName)
            await saveHistory()

            setResume(null)
            form.resetFields()
            setDescription('')
        } catch {
            message.error('Failed to download PDF')
        }
    }

    const renderProfileHeader = () => (
        <div className="mb-4">
            {loading ? (
                <div className="flex py-8 justify-center">
                    <Spin />
                </div>
            ) : (
                <div className="rounded-fluid border border-sky-200/70 bg-gradient-to-br from-white via-sky-50/25 to-slate-50/80 px-[clamp(0.85rem,2.5vw,1.25rem)] py-[clamp(0.55rem,1.5vw,0.85rem)]">
                    <h2 className="text-fluid-lg font-semibold tracking-tight text-slate-800">
                        {profile?.name}
                    </h2>
                </div>
            )}
        </div>
    )

    const renderJobDetailsForm = () => (
        <div className="mb-4">
            <h3 className="form-section-label mb-3">
                Job information
            </h3>
            <div className="grid grid-cols-1 gap-[clamp(0.55rem,1.8vw,1rem)] sm:grid-cols-2 sm:gap-[clamp(0.75rem,2vw,1.15rem)]">
                <FormItem
                    label="Job title"
                    name="title"
                    rules={rules.title}
                    className="mb-0 sm:col-span-1"
                >
                    <Input placeholder="e.g. Senior Developer" size="large" />
                </FormItem>
                <FormItem
                    label="Company"
                    name="company"
                    rules={rules.company}
                    className="mb-0 sm:col-span-1"
                >
                    <Input placeholder="e.g. TechCorp" size="large" />
                </FormItem>
                <FormItem
                    label="Job link"
                    name="link"
                    className="mb-0 sm:col-span-2"
                    rules={rules.link}
                >
                    <Input placeholder="https://…" size="large" />
                </FormItem>
                <FormItem
                    name="showLinkedin"
                    className="mb-0 sm:col-span-2"
                    valuePropName="checked"
                >
                    <Checkbox
                        checked={showLinkedin}
                        onChange={(e) => {
                            const checked = e.target.checked
                            setShowLinkedin(checked)
                            form.setFieldsValue({ showLinkedin: checked })
                        }}
                    >
                        Show LinkedIn on resume
                    </Checkbox>
                </FormItem>
            </div>
        </div>
    )

    const renderTemplateAndBackgroundOptions = () => (
        <div className="mb-2 grid grid-cols-1 gap-[clamp(0.75rem,2.2vw,1.25rem)] lg:grid-cols-2">
            <div className="rounded-fluid border border-sky-200/65 bg-gradient-to-br from-sky-50/35 to-slate-50/60 p-[clamp(0.75rem,2vw,1.15rem)]">
                <h3 className="mb-[clamp(0.45rem,1.2vw,0.85rem)] text-fluid-sm font-semibold text-slate-700">
                    Resume template
                </h3>
                <Radio.Group
                    value={templateId}
                    onChange={(e: RadioChangeEvent) =>
                        setTemplateId(e.target.value)
                    }
                    className="flex flex-col gap-2"
                >
                    {RESUME_TEMPLATES.map((template) => (
                        <div key={template.value} className="flex items-center">
                            <Radio value={template.value} className="text-slate-700">
                                {template.label}
                            </Radio>
                        </div>
                    ))}
                </Radio.Group>
            </div>
            <div className="max-h-[min(14rem,45vh)] overflow-y-auto rounded-fluid border border-sky-200/65 bg-gradient-to-br from-sky-50/35 to-slate-50/60 p-[clamp(0.75rem,2vw,1.15rem)] lg:max-h-none">
                <h3 className="mb-[clamp(0.45rem,1.2vw,0.85rem)] text-fluid-sm font-semibold text-slate-700">
                    Background style
                </h3>
                <Radio.Group
                    value={backgroundId}
                    onChange={(e: RadioChangeEvent) =>
                        setBackgroundId(e.target.value)
                    }
                    className="flex flex-col gap-2"
                >
                    {RESUME_BACKGROUNDS.map((bg) => (
                        <div key={bg.value} className="flex items-center">
                            <Radio value={bg.value} className="text-slate-700">
                                {bg.label}
                            </Radio>
                        </div>
                    ))}
                </Radio.Group>
            </div>
        </div>
    )

    const renderActionButtons = () => (
        <div className="mt-[clamp(1.25rem,3vw,2rem)] flex flex-col gap-[clamp(0.55rem,1.8vw,1rem)] sm:flex-row sm:items-center sm:gap-4">
            <Button
                icon={<RobotOutlined />}
                onClick={onGenerate}
                loading={isGenerating}
                disabled={description.trim() === ''}
                size="large"
                className="w-full sm:w-auto sm:min-w-[min(100%,12.5rem)]"
            >
                Generate resume
            </Button>
            <Button
                type="primary"
                icon={<DownloadOutlined />}
                htmlType="submit"
                disabled={!resume}
                size="large"
                className="w-full sm:w-auto sm:min-w-[min(100%,12.5rem)]"
            >
                Save & download
            </Button>
        </div>
    )

    const renderResumePreview = () => (
        <Card
            title={
                <span className="text-fluid-sm font-semibold text-slate-800">
                    Resume preview
                </span>
            }
            extra={
                resume ? (
                    <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={openEditor}
                    >
                        Edit
                    </Button>
                ) : null
            }
            className="h-full min-h-[clamp(18rem,45vh,22rem)] border-sky-200/65 shadow-soft"
            classNames={{ body: 'p-[clamp(0.35rem,1.2vw,1rem)] sm:p-4' }}
        >
            <div className="flex h-full min-h-[clamp(16rem,42vh,22rem)] flex-col rounded-fluid bg-slate-50/80 sm:min-h-[clamp(18rem,48vh,24rem)]">
                {resume ? (
                    <PDFViewer className="h-[min(55vh,clamp(15rem,42vw,32rem))] w-full min-h-[clamp(13rem,32vh,17rem)] sm:h-[min(60vh,clamp(16rem,45vw,32rem))]">
                        <ResumeTemplate
                            profile={resume}
                            templateId={templateId}
                            backgroundId={backgroundId}
                            showLinkedin={showLinkedin}
                        />
                    </PDFViewer>
                ) : (
                    <div className="flex flex-1 items-center justify-center py-12">
                        <div className="max-w-xs text-center text-slate-500">
                            <p className="text-base font-medium text-slate-600">
                                No preview yet
                            </p>
                            <p className="mt-2 text-sm leading-relaxed">
                                Paste a job description and generate to see your
                                tailored resume.
                            </p>
                        </div>
                    </div>
                )}

                {resume?.additionalInfo && (
                    <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/90 p-3">
                        <h3 className="text-sm font-semibold text-slate-800">
                            Additional information
                        </h3>
                        <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-sm text-slate-600">
                            {Object.entries(resume.additionalInfo).map(
                                ([question, answer], index) => (
                                    <li key={index}>
                                        <strong className="text-slate-800">
                                            {question}:
                                        </strong>{' '}
                                        {answer}
                                    </li>
                                )
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </Card>
    )

    return (
        <PageShell
            title="Resume generator"
            subtitle="Tailor your resume to a job post with AI, then download a PDF."
            className="!pb-10"
        >
            <div className="grid grid-cols-1 gap-[clamp(1rem,2.8vw,2.5rem)] lg:grid-cols-2 lg:gap-8 xl:gap-10">
                <Card className="panel-elevated border-0 !shadow-none [&_.ant-card-body]:px-[clamp(1rem,3vw,1.75rem)] [&_.ant-card-body]:py-[clamp(1rem,2.5vw,1.5rem)]">
                    <Form
                        form={form}
                        layout="vertical"
                        size="middle"
                        onFinish={downloadPDF}
                    >
                        {renderProfileHeader()}

                        <Divider className="my-4 border-slate-200/80" />

                        {renderJobDetailsForm()}

                        <div className="mb-4">
                            <h3 className="form-section-label mb-2">
                                Job requirements
                            </h3>
                            <FormItem
                                label=""
                                name="description"
                                rules={[{ required: false }]}
                                className="mb-0"
                            >
                                <TextArea
                                    rows={5}
                                    placeholder="Paste the job description here…"
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    className="!rounded-xl"
                                />
                            </FormItem>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                The more detail you paste, the better the match.
                            </p>
                        </div>

                        <div className="mb-4">
                            <h3 className="form-section-label mb-2">
                                Additional notes
                            </h3>
                            <FormItem
                                label=""
                                name="additionalInfo"
                                rules={[{ required: false }]}
                                className="mb-0"
                            >
                                <TextArea
                                    rows={3}
                                    placeholder="Extra context for the AI (optional)…"
                                    value={additionalInfo}
                                    onChange={(e) =>
                                        setAdditionalInfo(e.target.value)
                                    }
                                    className="!rounded-xl"
                                />
                            </FormItem>
                        </div>

                        {renderTemplateAndBackgroundOptions()}

                        {renderActionButtons()}
                    </Form>
                </Card>

                <div className="min-h-0 lg:sticky lg:top-20 lg:self-start">
                    {renderResumePreview()}
                </div>
            </div>

            <Drawer
                title="Edit resume"
                open={editorOpen}
                onClose={closeEditor}
                width="min(1100px, 96vw)"
                destroyOnClose
                styles={{ body: { padding: 0 } }}
                extra={
                    <div className="flex items-center gap-2">
                        <Button onClick={closeEditor}>Cancel</Button>
                        <Button type="primary" onClick={applyEdits}>
                            Apply changes
                        </Button>
                    </div>
                }
            >
                <div className="flex h-full flex-col lg:flex-row">
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:w-1/2">
                        {draft && (
                            <ResumeEditor value={draft} onChange={setDraft} />
                        )}
                    </div>
                    <div className="hidden min-h-0 flex-1 flex-col border-l border-slate-200/70 bg-slate-50/60 p-4 lg:flex lg:w-1/2">
                        <span className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
                            Live preview
                        </span>
                        {previewDraft && (
                            <PDFViewer
                                showToolbar={false}
                                className="h-full w-full flex-1 rounded-lg border border-slate-200/70 bg-white"
                            >
                                <ResumeTemplate
                                    profile={previewDraft}
                                    templateId={templateId}
                                    backgroundId={backgroundId}
                                    showLinkedin={showLinkedin}
                                />
                            </PDFViewer>
                        )}
                    </div>
                </div>
            </Drawer>
        </PageShell>
    )
}

export default Resume
