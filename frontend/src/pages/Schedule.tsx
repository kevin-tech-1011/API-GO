import {
    App,
    Button,
    DatePicker,
    Form,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Table,
    TableProps,
    Tag,
    Tooltip,
    type TablePaginationConfig,
} from 'antd'
import type { Dayjs } from 'dayjs'
import moment from 'moment'
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { listHistory, updateHistory } from '../actions/history'
import type { THistory, TResume } from '../types'
import saveAs from 'file-saver'
import { pdf } from '@react-pdf/renderer'
import ResumeTemplate from '../components/ResumeTemplate'
import {
    CalendarOutlined,
    DownloadOutlined,
    EyeOutlined,
    LinkOutlined,
} from '@ant-design/icons'
import { copyTextToClipboard } from '../utils/clipboard'
import {
    INTERVIEW_STATUS_OPTIONS,
    INTERVIEW_STATUS_TAG_COLORS,
} from '../types/constants'
import PageShell from '@/components/PageShell'
import { TABLE_PAGINATION_COMFORT_CLASSNAME } from '@/constants/tablePagination'
import { getLatestStatusStage, parseStatusStages } from '../utils/historyStatusStages'
import {
    entryToFormValues,
    formValuesToEntry,
    parseScheduleMeetingsFromApi,
} from '../utils/scheduleMeetings'

type ScheduleRow = {
    id: number
    profileName: string
    company: string
    position: string
    edited: string
    meetingTime: string
}

/** Eight IANA zones: seven US regions + United Kingdom (London). */
const USA_UK_TIMEZONE_OPTIONS: { label: string; value: string }[] = [
    { label: 'Eastern Time (US)', value: 'America/New_York' },
    { label: 'Central Time (US)', value: 'America/Chicago' },
    { label: 'Mountain Time (US)', value: 'America/Denver' },
    { label: 'Pacific Time (US)', value: 'America/Los_Angeles' },
    { label: 'Alaska (US)', value: 'America/Anchorage' },
    { label: 'Arizona (US)', value: 'America/Phoenix' },
    { label: 'Hawaii (US)', value: 'Pacific/Honolulu' },
    { label: 'United Kingdom', value: 'Europe/London' },
]

type MeetingFormValues = {
    status: string
    timezone: string
    meetingTime?: Dayjs
    meetingLink?: string
}

const Schedule = () => {
    const { message } = App.useApp()
    const [histories, setHistories] = useState<THistory[]>([])
    const [loading, setLoading] = useState(false)
    const [pagination, setPagination] = useState<TablePaginationConfig>({
        current: 1,
        pageSize: 15,
        total: 0,
    })

    const [meetingModalOpen, setMeetingModalOpen] = useState(false)
    const [activeHistory, setActiveHistory] = useState<THistory | null>(null)
    const [meetingForm] = Form.useForm<MeetingFormValues>()
    const [submittingMeeting, setSubmittingMeeting] = useState(false)

    /** Draft map for all status keys; synced to server on Save. */
    const meetingsDraftRef = useRef(
        {} as Record<
            string,
            { timezone: string; meetingTime: string; meetingLink: string }
        >
    )
    /** Status key currently shown in the form (for reliable stash on change). */
    const currentStatusKeyRef = useRef<string>('')

    const loadSchedule = useCallback(async () => {
        setLoading(true)
        try {
            const { count, rows }: { count: number; rows: THistory[] } =
                await listHistory({
                    schedule: true,
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                })
            setHistories(rows)
            setPagination((p) => ({ ...p, total: count }))
        } catch {
            setHistories([])
        } finally {
            setLoading(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only page & pageSize; avoid loop when total updates
    }, [pagination.current, pagination.pageSize])

    useEffect(() => {
        loadSchedule()
    }, [loadSchedule])

    const historyById = useMemo(
        () => new Map(histories.map((h) => [h.id as number, h])),
        [histories]
    )

    const dataSource: ScheduleRow[] = useMemo(
        () =>
            histories
                .filter((h): h is THistory & { id: number } => h.id != null)
                .map((h) => {
                    const latest = getLatestStatusStage(h)
                    const map = parseScheduleMeetingsFromApi(
                        h.scheduleMeetingsByStatus
                    )
                    const iso = latest ? map[latest]?.meetingTime : ''
                    let meetingDisplay = '—'
                    if (iso) {
                        const m = moment(iso)
                        meetingDisplay = m.isValid()
                            ? m.format('YYYY-MM-DD HH:mm')
                            : '—'
                    }
                    return {
                        id: h.id,
                        profileName: h.profile?.name ?? '—',
                        company: h.company ?? '—',
                        position: h.position ?? '—',
                        edited: h.createdAt
                            ? moment(h.createdAt).format('YYYY-MM-DD HH:mm')
                            : '—',
                        meetingTime: meetingDisplay,
                    }
                }),
        [histories]
    )

    const openMeetingModal = useCallback(
        (record: ScheduleRow) => {
            const h = historyById.get(record.id)
            if (!h || h.id == null) {
                message.warning('Could not load this schedule row.')
                return
            }
            const checked = INTERVIEW_STATUS_OPTIONS.filter((label) =>
                parseStatusStages(h).includes(label)
            )
            const latest = getLatestStatusStage(h)
            if (checked.length === 0 || !latest) {
                message.warning('No status stages selected for this row.')
                return
            }
            meetingsDraftRef.current = parseScheduleMeetingsFromApi(
                h.scheduleMeetingsByStatus
            )
            currentStatusKeyRef.current = latest
            setActiveHistory(h)
            setMeetingModalOpen(true)
        },
        [historyById, message]
    )

    useLayoutEffect(() => {
        if (!meetingModalOpen || !activeHistory) return
        const latest = currentStatusKeyRef.current
        const initialFields = entryToFormValues(
            meetingsDraftRef.current[latest]
        )
        meetingForm.resetFields()
        meetingForm.setFieldsValue({
            status: latest,
            timezone: initialFields.timezone,
            meetingTime: initialFields.meetingTime,
            meetingLink: initialFields.meetingLink,
        })
    }, [meetingModalOpen, activeHistory, meetingForm])

    const closeMeetingModal = useCallback(() => {
        meetingForm.resetFields()
        setMeetingModalOpen(false)
        setActiveHistory(null)
        currentStatusKeyRef.current = ''
        meetingsDraftRef.current = {}
    }, [meetingForm])

    const handleStatusSelectChange = useCallback(
        (newStatus: string) => {
            const prev = currentStatusKeyRef.current
            if (prev && prev !== newStatus) {
                const vals = meetingForm.getFieldsValue()
                meetingsDraftRef.current[prev] = formValuesToEntry({
                    timezone: vals.timezone,
                    meetingTime: vals.meetingTime,
                    meetingLink: vals.meetingLink,
                })
            }
            currentStatusKeyRef.current = newStatus
            const next = entryToFormValues(meetingsDraftRef.current[newStatus])
            meetingForm.setFieldsValue({
                status: newStatus,
                timezone: next.timezone,
                meetingTime: next.meetingTime,
                meetingLink: next.meetingLink,
            })
        },
        [meetingForm]
    )

    const handleMeetingSubmit = useCallback(async () => {
        if (!activeHistory?.id) return
        try {
            const values = await meetingForm.validateFields()
            meetingsDraftRef.current[values.status] = formValuesToEntry({
                timezone: values.timezone,
                meetingTime: values.meetingTime,
                meetingLink: values.meetingLink,
            })
            setSubmittingMeeting(true)
            const updated = await updateHistory({
                id: activeHistory.id,
                scheduleMeetingsByStatus: { ...meetingsDraftRef.current },
            })
            setHistories((rows) =>
                rows.map((r) =>
                    r.id === updated.id
                        ? { ...r, scheduleMeetingsByStatus: updated.scheduleMeetingsByStatus }
                        : r
                )
            )
            message.success('Meeting details saved.')
            closeMeetingModal()
        } catch (e) {
            if (e && typeof e === 'object' && 'errorFields' in (e as object)) {
                return
            }
            message.error('Could not save meeting details.')
        } finally {
            setSubmittingMeeting(false)
        }
    }, [activeHistory, closeMeetingModal, meetingForm, message])

    const statusSelectOptions = useMemo(() => {
        if (!activeHistory) return []
        return INTERVIEW_STATUS_OPTIONS.filter((label) =>
            parseStatusStages(activeHistory).includes(label)
        ).map((label) => ({ label, value: label }))
    }, [activeHistory])

    const modalPositionTitle = activeHistory?.position?.trim() || 'Position'

    const onDownloadResume = useCallback(async (record: THistory) => {
        try {
            const resume: TResume = JSON.parse(record.resume || '{}')
            const blob = await pdf(
                <ResumeTemplate
                    profile={resume}
                    templateId={record.templateId}
                    backgroundId={record.backgroundId}
                />
            ).toBlob()
            const fileName = `${record.profile?.name || 'resume'}_${record.company || 'company'}.pdf`
            saveAs(blob, fileName)
        } catch {
            message.error('Could not download resume PDF')
        }
    }, [message])

    const isLink = (link: string) =>
        link.startsWith('http://') || link.startsWith('https://')

    const columns: TableProps<ScheduleRow>['columns'] = [
        {
            title: 'No',
            key: 'no',
            width: 56,
            render: (_: unknown, record: ScheduleRow) => (
                <span>
                    {((pagination.current || 1) - 1) * (pagination.pageSize || 15) +
                        dataSource.indexOf(record) +
                        1}
                </span>
            ),
        },
        {
            title: 'Profile',
            dataIndex: 'profileName',
            key: 'profileName',
            ellipsis: true,
        },
        {
            title: 'Company',
            dataIndex: 'company',
            key: 'company',
            ellipsis: true,
        },
        {
            title: 'Position',
            dataIndex: 'position',
            key: 'position',
            ellipsis: true,
        },
        {
            title: 'Edited',
            dataIndex: 'edited',
            key: 'edited',
            width: 140,
            render: (text: string) => (
                <span className="whitespace-nowrap text-slate-600">{text}</span>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            width: 200,
            ellipsis: true,
            render: (_: unknown, record: ScheduleRow) => {
                const h = historyById.get(record.id)
                if (!h) return <span className="text-slate-400">—</span>
                const latest = getLatestStatusStage(h)
                if (!latest)
                    return <span className="text-slate-400">—</span>
                return (
                    <Tag
                        color={
                            INTERVIEW_STATUS_TAG_COLORS[
                                latest as keyof typeof INTERVIEW_STATUS_TAG_COLORS
                            ]
                        }
                        className="m-0 max-w-full truncate"
                    >
                        {latest}
                    </Tag>
                )
            },
        },
        {
            title: 'Meeting Time',
            dataIndex: 'meetingTime',
            key: 'meetingTime',
            width: 200,
            ellipsis: true,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 220,
            render: (_: unknown, record: ScheduleRow) => {
                const h = historyById.get(record.id)
                if (!h) {
                    return <span className="text-slate-400">—</span>
                }
                return (
                    <div className="flex flex-row flex-wrap justify-center gap-1">
                        <Tooltip title="View job description">
                            <Popconfirm
                                title={`View Job Description for ${h.company} - ${h.position}`}
                                description={
                                    <div className="flex flex-col gap-3">
                                        <Button
                                            type="primary"
                                            size="small"
                                            className="self-start"
                                            onClick={async (e) => {
                                                e.stopPropagation()
                                                try {
                                                    await copyTextToClipboard(
                                                        h.requirements || ''
                                                    )
                                                    message.success(
                                                        'Job description copied'
                                                    )
                                                } catch {
                                                    message.error(
                                                        'Could not copy to clipboard'
                                                    )
                                                }
                                            }}
                                        >
                                            Copy JD
                                        </Button>
                                        <span className="block whitespace-pre-wrap break-words text-left text-sm">
                                            {h.requirements ||
                                                'No job description available.'}
                                        </span>
                                    </div>
                                }
                                classNames={{
                                    body: 'max-w-[min(100vw-2rem,48rem)] max-h-[min(70vh,360px)] overflow-auto',
                                }}
                                okText="Close"
                                cancelButtonProps={{ style: { display: 'none' } }}
                            >
                                <Button
                                    icon={<EyeOutlined />}
                                    type="primary"
                                    ghost
                                    size="small"
                                />
                            </Popconfirm>
                        </Tooltip>
                        <Tooltip title="Download resume">
                            <Button
                                icon={<DownloadOutlined />}
                                type="primary"
                                ghost
                                size="small"
                                onClick={() => onDownloadResume(h)}
                            />
                        </Tooltip>
                        <Tooltip title="Open job link">
                            <Button
                                icon={<LinkOutlined />}
                                type="primary"
                                ghost
                                size="small"
                                href={h.link}
                                target="_blank"
                                rel="noreferrer"
                                disabled={!isLink(h.link || '')}
                            />
                        </Tooltip>
                        <Tooltip title="Meeting details">
                            <Button
                                type="primary"
                                size="small"
                                icon={<CalendarOutlined />}
                                onClick={() => openMeetingModal(record)}
                            />
                        </Tooltip>
                    </div>
                )
            },
        },
    ]

    return (
        <PageShell
            title="Schedule"
        >
            <Modal
                title={`Schedule Meeting - ${modalPositionTitle}`}
                open={meetingModalOpen}
                onCancel={closeMeetingModal}
                destroyOnHidden
                width="min(calc(100vw - 2rem), 30rem)"
                classNames={{ body: '!pt-2' }}
                footer={
                    <div className="flex justify-end border-t border-slate-100 pt-4">
                        <Space>
                            <Button onClick={closeMeetingModal}>Cancel</Button>
                            <Button
                                type="primary"
                                loading={submittingMeeting}
                                onClick={handleMeetingSubmit}
                            >
                                Save
                            </Button>
                        </Space>
                    </div>
                }
            >
                <Form form={meetingForm} layout="vertical" className="mt-2">
                    <Form.Item
                        name="status"
                        label="Status"
                        rules={[{ required: true, message: 'Select a status' }]}
                    >
                        <Select
                            placeholder="Select status"
                            options={statusSelectOptions}
                            disabled={statusSelectOptions.length === 0}
                            onChange={handleStatusSelectChange}
                        />
                    </Form.Item>
                    <Form.Item
                        name="timezone"
                        label="Timezone"
                        rules={[{ required: true, message: 'Select a timezone' }]}
                    >
                        <Select
                            placeholder="Select timezone"
                            options={USA_UK_TIMEZONE_OPTIONS}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>
                    <Form.Item
                        name="meetingTime"
                        label="Meeting time"
                        rules={[{ required: true, message: 'Pick date and time' }]}
                    >
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            className="w-full"
                            needConfirm={false}
                        />
                    </Form.Item>
                    <Form.Item
                        name="meetingLink"
                        label="Meeting link"
                        rules={[
                            {
                                validator: async (_, value) => {
                                    const v =
                                        typeof value === 'string'
                                            ? value.trim()
                                            : ''
                                    if (!v) return
                                    const ok = (() => {
                                        try {
                                            new URL(v)
                                            return true
                                        } catch {
                                            return false
                                        }
                                    })()
                                    if (!ok)
                                        throw new Error('Enter a valid URL')
                                },
                            },
                        ]}
                    >
                        <Input
                            allowClear
                            placeholder="https://..."
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <div className="panel-elevated panel-elevated--table min-w-0">
                <div className="app-table-responsive">
                    <Table<ScheduleRow>
                        size="small"
                        columns={columns}
                        dataSource={dataSource}
                        rowKey="id"
                        loading={loading}
                        className="app-data-table min-w-[min(920px,max(100%,22rem))]"
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            ...pagination,
                            onChange: (page, pageSize) => {
                                setPagination({
                                    ...pagination,
                                    current: page,
                                    pageSize: pageSize,
                                })
                            },
                            pageSizeOptions: ['15', '30', '50'],
                            showSizeChanger: true,
                            responsive: true,
                            position: ['bottomCenter'],
                            className: TABLE_PAGINATION_COMFORT_CLASSNAME,
                        }}
                    />
                </div>
            </div>
        </PageShell>
    )
}

export default Schedule
