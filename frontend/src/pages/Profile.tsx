import { useEffect, useMemo, useState } from 'react'
import { App, Button, Col, Form, Input, Radio, Row, Checkbox } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'

import { TProfile, TResume } from '@/types'
import { RESUME_BACKGROUNDS, RESUME_TEMPLATES } from '@/types/constants'
import { createProfile, getProfile, updateProfile } from '@/actions/profiles'

import ResumeTemplate from '@/components/ResumeTemplate'
import { PDFViewer } from '@react-pdf/renderer'
import ResumeMock from '@/assets/mock.json'
import PageShell from '@/components/PageShell'

const { Item: FormItem } = Form
const { TextArea } = Input

const Profile = (): JSX.Element => {
    const { message } = App.useApp()
    const [loading, setLoading] = useState<boolean>(false)
    const { id } = useParams()
    const [form] = Form.useForm<TProfile>()
    const showLinkedinOnResume = Form.useWatch('showLinkedin', form)
    const navigate = useNavigate()

    const [backgroundId, setBackgroundId] = useState<number>(0)
    const [templateId, setTemplateId] = useState<number>(1)

    const rules = useMemo<Record<string, any>>(
        () => ({
            name: [
                { required: true, message: 'Full name is required' },
                { min: 2, message: 'Full name must be at least 2 characters' },
            ],
            title: [
                {
                    max: 100,
                    message: 'Professional title must not exceed 100 characters',
                },
            ],
            phone: [{ required: true, message: 'Phone number is required' }],
            email: [
                { required: true, message: 'EMail is required' },
                { type: 'email', message: 'Invalid email format' },
            ],
            location: [
                { required: true, message: 'Location is required' },
                {
                    max: 100,
                    message: 'Location must not exceed 100 characters',
                },
            ],
            street: [
                {
                    max: 200,
                    message: 'Street must not exceed 200 characters',
                },
            ],
            race: [
                {
                    max: 100,
                    message: 'Race must not exceed 100 characters',
                },
            ],
            linkedin: [
                {
                    pattern: /^https?:\/\/(www\.)?linkedin\.com\//,
                    message: 'Invalid LinkedIn URL',
                },
            ],
            experience: [
                { required: true, message: 'Work experience is required' },
                {
                    min: 10,
                    message: 'Work experience must be at least 10 characters',
                },
            ],
            education: [
                { required: true, message: 'Education is required' },
                { min: 10, message: 'Education must be at least 10 characters' },
            ],
        }),
        []
    )

    const backgroundOptions = RESUME_BACKGROUNDS
    const templateOptions = RESUME_TEMPLATES

    const loadProfile = async (profileId: number) => {
        setLoading(true)
        try {
            const profile = await getProfile(profileId)
            if (profile) {
                form.setFieldsValue(profile)
                setTemplateId(profile.templateId || 1)
                setBackgroundId(profile.backgroundId || 0)
            }
        } catch {
            message.error('Failed to load profile')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!id) return
        loadProfile(Number(id))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    const onFinish = async (values: TProfile) => {
        if (loading) return
        setLoading(true)
        try {
            const payload = { ...values, backgroundId, templateId }
            if (!id) {
                await createProfile(payload)
            } else {
                await updateProfile(payload)
            }
            message.success('Profile saved successfully')
        } catch {
            message.error(
                'An error occured while saving profile, Please contact Admin for support'
            )
        } finally {
            setLoading(false)
        }
    }

    const renderBackgroundChoices = () => (
        <Radio.Group
            value={backgroundId}
            onChange={(e) => setBackgroundId(e.target.value as number)}
        >
            <div className="grid grid-cols-2 gap-[clamp(0.45rem,1.8vw,0.85rem)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {backgroundOptions.map((bg) => (
                    <div
                        key={bg.value}
                        className="flex flex-col items-center gap-2"
                    >
                        <Radio value={bg.value} className="!mr-0">
                            <div className="flex h-[clamp(6.5rem,22vw,8rem)] w-[clamp(4.25rem,14vw,6rem)] overflow-hidden rounded-lg border border-sky-200/70 bg-slate-100 shadow-sm">
                                <img
                                    alt={bg.label}
                                    src={`/resume-background/pattern${bg.value}.jpg`}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        </Radio>
                        <span className="max-w-[5.5rem] text-center text-xs text-slate-600">
                            {bg.label}
                        </span>
                    </div>
                ))}
            </div>
        </Radio.Group>
    )

    const renderTemplateChoices = () => (
        <Radio.Group
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value as number)}
        >
            <div className="grid grid-cols-1 gap-[clamp(0.65rem,2vw,1.15rem)] sm:grid-cols-2 lg:grid-cols-3">
                {templateOptions.map((template) => (
                    <div
                        key={template.value}
                        className="flex flex-col items-center gap-2"
                    >
                        <Radio value={template.value} className="!mr-0">
                            <div className="flex h-[clamp(8.5rem,28vw,9.5rem)] w-[clamp(6.5rem,20vw,7.5rem)] items-center justify-center rounded-lg border border-dashed border-sky-200/80 bg-sky-50/40 p-1 text-fluid-xs text-slate-600">
                                {template.label}
                            </div>
                        </Radio>
                        <span className="text-center text-sm text-slate-600">
                            {template.label}
                        </span>
                    </div>
                ))}
            </div>
        </Radio.Group>
    )

    return (
        <PageShell
            className="!pt-4 sm:!pt-6"
            title={id ? 'Edit profile' : 'New profile'}
            subtitle="Details appear on your generated resume and exports."
            actions={
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                    size="large"
                >
                    Back
                </Button>
            }
        >
            <Form
                form={form}
                className="grid grid-cols-1 gap-x-[clamp(1rem,3.5vw,1.75rem)] gap-y-[clamp(0.35rem,1.2vw,0.5rem)] md:grid-cols-2"
                layout="vertical"
                size="large"
                onFinish={onFinish}
                initialValues={{ showLinkedin: true }}
                requiredMark="optional"
            >
                <FormItem label="id" name="id" hidden>
                    <Input />
                </FormItem>

                <FormItem label="Full name" name="name" rules={rules.name}>
                    <Input placeholder="Jane Doe" />
                </FormItem>

                <FormItem
                    label="Professional title"
                    name="title"
                    rules={rules.title}
                >
                    <Input placeholder="e.g. Senior Software Engineer" />
                </FormItem>

                <FormItem label="Phone" name="phone" rules={rules.phone}>
                    <Input type="tel" placeholder="+1 …" />
                </FormItem>

                <FormItem label="Email" name="email" rules={rules.email}>
                    <Input type="email" />
                </FormItem>

                <FormItem label="Location" name="location" rules={rules.location}>
                    <Input placeholder="City, Country" />
                </FormItem>

                <FormItem label="Street" name="street" rules={rules.street}>
                    <Input placeholder="Street address" />
                </FormItem>

                <FormItem label="Race" name="race" rules={rules.race}>
                    <Input placeholder="Race / ethnicity" />
                </FormItem>

                <FormItem label="LinkedIn" name="linkedin" rules={rules.linkedin}>
                    <Input placeholder="https://linkedin.com/in/…" />
                </FormItem>

                <FormItem name="showLinkedin" valuePropName="checked">
                    <Checkbox>Show LinkedIn on resume</Checkbox>
                </FormItem>

                <FormItem
                    label="Work experience"
                    name="experience"
                    className="md:col-span-2"
                    rules={rules.experience}
                >
                    <TextArea rows={4} placeholder="Roles, impact, technologies…" />
                </FormItem>

                <FormItem
                    label="Education"
                    name="education"
                    className="md:col-span-2"
                    rules={rules.education}
                >
                    <TextArea rows={4} />
                </FormItem>

                <Col xs={24} className="md:col-span-2">
                    <Row gutter={[24, 24]}>
                        <Col xs={24} lg={12}>
                            <div className="panel-elevated p-fluid-card">
                                <FormItem
                                    label="Resume background"
                                    name="backgroundId"
                                    className="!mb-0"
                                >
                                    {renderBackgroundChoices()}
                                </FormItem>
                            </div>
                            <div className="panel-elevated mt-[clamp(0.85rem,2vw,1.5rem)] p-fluid-card lg:mt-6">
                                <FormItem
                                    label="Resume template style"
                                    name="templateId"
                                    className="!mb-0"
                                >
                                    {renderTemplateChoices()}
                                </FormItem>
                            </div>
                        </Col>
                        <Col xs={24} lg={12}>
                            <div className="panel-elevated sticky top-[clamp(4rem,12vh,5.5rem)] overflow-hidden p-[clamp(0.35rem,1.2vw,0.85rem)] sm:p-3">
                                <p className="form-section-label mb-2 px-1">
                                    Preview
                                </p>
                                <div className="h-[min(70vh,clamp(17.5rem,48vw,35rem))] min-h-[clamp(16rem,38vh,22rem)] w-full overflow-hidden rounded-xl border border-sky-100/60 bg-slate-100/80 [&_.react-pdf\_\_Document]:min-h-[inherit]">
                                    <PDFViewer
                                        className="h-full w-full min-h-[clamp(15rem,32vh,18rem)]"
                                    >
                                        <ResumeTemplate
                                            profile={ResumeMock as unknown as TResume}
                                            templateId={templateId}
                                            backgroundId={backgroundId}
                                            showLinkedin={
                                                showLinkedinOnResume ?? true
                                            }
                                        />
                                    </PDFViewer>
                                </div>
                            </div>
                        </Col>
                    </Row>
                </Col>

                <FormItem label={null} className="md:col-span-2">
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        size="large"
                        className="mt-2 w-full min-w-[min(100%,10rem)] sm:w-auto"
                    >
                        Save profile
                    </Button>
                </FormItem>
            </Form>
        </PageShell>
    )
}

export default Profile
