import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import moment from 'moment-timezone'
import { App, DatePicker, Input, Select, Table, Tag, type TableProps } from 'antd'
import { CalendarOutlined, FilterOutlined } from '@ant-design/icons'

import { listHistory } from '@/actions/history'
import { TABLE_PAGINATION_COMFORT_CLASSNAME } from '@/constants/tablePagination'
import { useThemeMode } from '@/components/ThemeContext'
import type { THistory } from '@/types'
import {
    INTERVIEW_STATUS_OPTIONS,
    INTERVIEW_STATUS_TAG_COLORS,
} from '@/types/constants'
import { useProfileUsers } from '@/components/ProfileUsersContext'
import { getLatestStatusStage } from '@/utils/historyStatusStages'
import { normalizeProfileUserIndex } from '@/utils/profileUserIndex'
import { parseScheduleMeetingsFromApi } from '@/utils/scheduleMeetings'

const { RangePicker } = DatePicker

/** Drop Teams invite tails like ": Meeting options …" and long underscore/dash lines. */
function trimCalendarPositionMeetingInviteTail(s: string): string {
    let t = s.trim()
    const mo = t.search(/\s*:\s*Meeting options\b/i)
    if (mo !== -1) t = t.slice(0, mo).trim()
    t = (t.split(/_{4,}/)[0] ?? t).trim()
    t = (t.split(/-{10,}/)[0] ?? t).trim()
    t = (t.split(/={10,}/)[0] ?? t).trim()
    return t.replace(/[:;,\s]+$/g, '').trim()
}

/**
 * Schedule Table Position: allowed characters, then strip meeting-invite boilerplate.
 */
function sanitizeScheduleTablePositionForDisplay(raw: string): string {
    const s = raw
        .normalize('NFKC')
        .replace(/\p{Extended_Pictographic}/gu, '')
    let t = s.replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S}\s]/gu, '')
    t = t.replace(/\s+/g, ' ').trim()
    t = trimCalendarPositionMeetingInviteTail(t)
    return t === '' ? '—' : t
}

/** A `TProfileUser.id`, or all profile users. */
type ProfileUserSlotFilter = 'all' | number

type Row = {
    id: number
    profileName: string
    /** `TProfileUser.id` from the linked profile; `null` = unassigned. */
    profileUserIndex: number | null
    company: string
    position: string
    status: string | null
    meetingTime: string
    /** UTC ms for sorting; missing/invalid meetings sort last. */
    meetingTimeMs: number
}

export type ScheduleImportsPanelProps = {
    /** Increment to refetch rows (e.g. after global calendar clear). */
    reloadToken?: number
}

/**
 * Manager-only: calendar uploads (same `histories` storage as bids, excluded from History + Schedule lists).
 * Shown on Calendar → Schedule Table.
 */
export const ScheduleImportsPanel = ({
    reloadToken = 0,
}: ScheduleImportsPanelProps): JSX.Element => {
    const { message } = App.useApp()
    const { isDark } = useThemeMode()
    const { options: profileUserOptions, isKnownIndex } = useProfileUsers()
    const [histories, setHistories] = useState<THistory[]>([])
    const [loading, setLoading] = useState(false)
    const [tablePagination, setTablePagination] = useState({
        current: 1,
        pageSize: 20,
    })
    const [profileNameFilter, setProfileNameFilter] = useState<string | null>(null)
    const [profileUserSlotFilter, setProfileUserSlotFilter] =
        useState<ProfileUserSlotFilter>('all')
    const [companyNameFilter, setCompanyNameFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState<string | null>(null)
    const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
        dayjs().startOf('week'),
        dayjs().endOf('week'),
    ])
    const [datePreset, setDatePreset] = useState<'week' | 'month' | 'custom'>('week')

    /** Fall back to “all” when the selected profile user is deleted. */
    useEffect(() => {
        if (profileUserSlotFilter === 'all') return
        if (profileUserOptions.length === 0) return
        if (!isKnownIndex(profileUserSlotFilter)) setProfileUserSlotFilter('all')
    }, [profileUserSlotFilter, profileUserOptions, isKnownIndex])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { rows } = await listHistory({
                schedule: true,
                calendarImport: true,
                current: 1,
                pageSize: 200,
            })
            setHistories(Array.isArray(rows) ? rows : [])
        } catch {
            message.error('Could not load calendar imports')
            setHistories([])
        } finally {
            setLoading(false)
        }
    }, [message])

    useEffect(() => {
        void load()
    }, [load, reloadToken])

    const historyById = useMemo(
        () => new Map(histories.map((h) => [h.id as number, h])),
        [histories]
    )

    const dataSource: Row[] = useMemo(() => {
        const rows = histories
            .filter((h): h is THistory & { id: number } => h.id != null)
            .map((h) => {
                const latest = getLatestStatusStage(h)
                const map = parseScheduleMeetingsFromApi(
                    h.scheduleMeetingsByStatus
                )
                const entry = latest ? map[latest] : undefined
                const iso = entry?.meetingTime ?? ''
                const tz = entry?.timezone ?? 'America/Los_Angeles'
                let meetingDisplay = '—'
                let meetingTimeMs = Number.POSITIVE_INFINITY
                if (iso) {
                    const m = moment.tz(iso, tz)
                    if (m.isValid()) {
                        meetingTimeMs = m.valueOf()
                        meetingDisplay = `${m.format('YYYY-MM-DD HH:mm')} (${tz})`
                    }
                }
                const profileUserIndex = normalizeProfileUserIndex(
                    h.profile?.profileUserIndex
                )
                return {
                    id: h.id,
                    profileName: h.profile?.name ?? '—',
                    profileUserIndex,
                    company: h.company ?? '—',
                    position: sanitizeScheduleTablePositionForDisplay(
                        h.position != null ? String(h.position) : ''
                    ),
                    status: latest,
                    meetingTime: meetingDisplay,
                    meetingTimeMs,
                }
            })
        return rows.sort((a, b) => b.meetingTimeMs - a.meetingTimeMs)
    }, [histories])

    const filteredDataSource = useMemo(() => {
        const companyNeedle = companyNameFilter.trim().toLowerCase()
        const [start, end] = dateRange ?? [null, null]
        const startMs = start ? start.startOf('day').valueOf() : null
        const endMs = end ? end.endOf('day').valueOf() : null

        return dataSource.filter((row) => {
            if (profileNameFilter != null && row.profileName !== profileNameFilter) {
                return false
            }
            if (
                profileUserSlotFilter !== 'all' &&
                row.profileUserIndex !== profileUserSlotFilter
            ) {
                return false
            }
            if (companyNeedle && !row.company.toLowerCase().includes(companyNeedle)) {
                return false
            }
            if (statusFilter != null && row.status !== statusFilter) {
                return false
            }
            if (startMs != null || endMs != null) {
                if (!Number.isFinite(row.meetingTimeMs)) {
                    return false
                }
                if (startMs != null && row.meetingTimeMs < startMs) {
                    return false
                }
                if (endMs != null && row.meetingTimeMs > endMs) {
                    return false
                }
            }
            return true
        })
    }, [
        companyNameFilter,
        dataSource,
        dateRange,
        profileNameFilter,
        profileUserSlotFilter,
        statusFilter,
    ])

    const profileOptions = useMemo(() => {
        const rowsForNames =
            profileUserSlotFilter === 'all'
                ? dataSource
                : dataSource.filter(
                      (row) => row.profileUserIndex === profileUserSlotFilter
                  )
        const unique = Array.from(
            new Set(
                rowsForNames.map((row) => row.profileName).filter((v) => v !== '—')
            )
        ).sort((a, b) => a.localeCompare(b))
        return unique.map((name) => ({ label: name, value: name }))
    }, [dataSource, profileUserSlotFilter])

    useEffect(() => {
        if (profileNameFilter == null) return
        const allowed = new Set(profileOptions.map((o) => o.value))
        if (!allowed.has(profileNameFilter)) {
            setProfileNameFilter(null)
            setTablePagination((prev) => ({ ...prev, current: 1 }))
        }
    }, [profileNameFilter, profileOptions])

    const setThisWeekRange = useCallback(() => {
        setDatePreset('week')
        setDateRange([dayjs().startOf('week'), dayjs().endOf('week')])
    }, [])

    const setThisMonthRange = useCallback(() => {
        setDatePreset('month')
        setDateRange([dayjs().startOf('month'), dayjs().endOf('month')])
    }, [])

    const columns: TableProps<Row>['columns'] = useMemo(
        () => [
            {
                title: 'No',
                key: 'no',
                width: 72,
                align: 'center',
                render: (_: unknown, __: Row, index: number) => {
                    const current = tablePagination.current
                    const pageSize = tablePagination.pageSize
                    return (current - 1) * pageSize + index + 1
                },
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
                title: 'Status',
                key: 'status',
                width: 200,
                ellipsis: true,
                render: (_: unknown, record: Row) => {
                    const h = historyById.get(record.id)
                    if (!h) return <span className="text-slate-400">—</span>
                    const latest = record.status
                    if (!latest)
                        return <span className="text-slate-400">—</span>
                    const isCalendarImport =
                        typeof h.requirements === 'string' &&
                        h.requirements.startsWith('[calendar-import]')
                    const label =
                        isCalendarImport && latest === 'Intro Interview'
                            ? 'Interview'
                            : latest
                    return (
                        <Tag
                            color={
                                INTERVIEW_STATUS_TAG_COLORS[
                                    latest as keyof typeof INTERVIEW_STATUS_TAG_COLORS
                                ]
                            }
                            className="m-0 max-w-full truncate"
                        >
                            {label}
                        </Tag>
                    )
                },
            },
            {
                title: 'Meeting Time',
                dataIndex: 'meetingTime',
                key: 'meetingTime',
                width: 260,
                ellipsis: true,
            },
        ],
        [historyById, tablePagination]
    )

    const totalRows = dataSource.length
    const filteredRows = filteredDataSource.length
    const datedRows = useMemo(
        () => filteredDataSource.filter((r) => Number.isFinite(r.meetingTimeMs)).length,
        [filteredDataSource]
    )

    return (
        <>
            <div className="mb-[clamp(1rem,2.5vw+0.35rem,2rem)]">
                <div
                    className="statistics-search-shell surface-filters mt-2 sm:mt-4"
                    role="search"
                    aria-label="Schedule import filters"
                >
                    <div className="statistics-search-flex">
                        <div className="statistics-search-part">
                            <div className="statistics-search-part-head text-slate-600">
                                <span className="flex h-[clamp(2rem,4vw,2.25rem)] w-[clamp(2rem,4vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                                    <FilterOutlined className="text-fluid-base" />
                                </span>
                                <div className="min-w-0">
                                    <div className="statistics-filter-title text-sm font-semibold text-slate-800">
                                        Profile / Company
                                    </div>
                                </div>
                            </div>
                            <div className="statistics-search-part-body">
                                <div className="flex w-full min-w-0 flex-col sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2">
                                    <Select<ProfileUserSlotFilter>
                                        value={profileUserSlotFilter}
                                        onChange={(value) => {
                                            setProfileUserSlotFilter(value)
                                            setTablePagination((prev) => ({ ...prev, current: 1 }))
                                        }}
                                        className="statistics-search-select min-h-10 w-full min-w-[180px] sm:flex-1 [&_.ant-select-selector]:!flex [&_.ant-select-selector]:!h-10 [&_.ant-select-selector]:!min-h-10 [&_.ant-select-selector]:!items-center"
                                        options={[
                                            {
                                                label: 'All profile users',
                                                value: 'all',
                                            },
                                            ...profileUserOptions,
                                        ]}
                                        aria-label="Filter by profile user"
                                    />
                                    <Select<string | 'all'>
                                        value={profileNameFilter ?? 'all'}
                                        onChange={(value) => {
                                            setProfileNameFilter(value === 'all' ? null : value)
                                            setTablePagination((prev) => ({ ...prev, current: 1 }))
                                        }}
                                        className="statistics-search-select mt-2 min-h-10 w-full min-w-[180px] sm:mt-0 sm:flex-1 [&_.ant-select-selector]:!flex [&_.ant-select-selector]:!h-10 [&_.ant-select-selector]:!min-h-10 [&_.ant-select-selector]:!items-center"
                                        options={[
                                            { label: 'All Profiles', value: 'all' },
                                            ...profileOptions,
                                        ]}
                                        aria-label="Filter by profile name"
                                    />
                                    <Input
                                        allowClear
                                        placeholder="Company Name"
                                        value={companyNameFilter}
                                        onChange={(e) => {
                                            setCompanyNameFilter(e.target.value)
                                            setTablePagination((prev) => ({ ...prev, current: 1 }))
                                        }}
                                        className="mt-2 min-h-10 w-full min-w-[180px] !h-10 !rounded-xl sm:mt-0 sm:flex-1"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="statistics-search-part">
                            <div className="statistics-search-part-head text-slate-600">
                                <span className="flex h-[clamp(2rem,4vw,2.25rem)] w-[clamp(2rem,4vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                    <FilterOutlined className="text-fluid-base" />
                                </span>
                                <div className="min-w-0">
                                    <div className="statistics-filter-title text-sm font-semibold text-slate-800">
                                        Status
                                    </div>
                                </div>
                            </div>
                            <div className="statistics-search-part-body">
                                <Select<string | 'all'>
                                    value={statusFilter ?? 'all'}
                                    onChange={(value) => {
                                        setStatusFilter(value === 'all' ? null : value)
                                        setTablePagination((prev) => ({ ...prev, current: 1 }))
                                    }}
                                    className="statistics-search-select min-h-10 w-full min-w-[180px] [&_.ant-select-selector]:!flex [&_.ant-select-selector]:!h-10 [&_.ant-select-selector]:!min-h-10 [&_.ant-select-selector]:!items-center"
                                    options={[
                                        { label: 'All Status', value: 'all' },
                                        ...INTERVIEW_STATUS_OPTIONS.map((s) => ({
                                            label: s,
                                            value: s,
                                        })),
                                    ]}
                                    aria-label="Filter by interview status"
                                />
                            </div>
                        </div>

                        <div className="statistics-search-part">
                            <div className="statistics-search-part-head text-slate-600">
                                <span className="flex h-[clamp(2rem,4vw,2.25rem)] w-[clamp(2rem,4vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                                    <CalendarOutlined className="text-fluid-base" />
                                </span>
                                <div className="min-w-0">
                                    <div className="statistics-filter-title text-sm font-semibold text-slate-800">
                                        Date Range
                                    </div>
                                </div>
                            </div>
                            <div className="statistics-search-part-body">
                                <RangePicker
                                    value={dateRange}
                                    onChange={(values) => {
                                        if (!values) {
                                            setDateRange(null)
                                        } else {
                                            setDateRange([values[0], values[1]])
                                        }
                                        setDatePreset('custom')
                                        setTablePagination((prev) => ({ ...prev, current: 1 }))
                                    }}
                                    className={`statistics-date-range-picker !rounded-xl ${
                                        datePreset === 'custom' ? '' : 'hidden'
                                    }`}
                                />
                                <div className="statistics-date-preset-buttons flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        aria-pressed={datePreset === 'week'}
                                        className={[
                                            'inline-flex min-h-[2.25rem] items-center justify-center rounded-full px-3 text-xs font-semibold tracking-tight transition-all duration-200 sm:min-h-[2.375rem] sm:px-3.5 sm:text-[0.8125rem]',
                                            'outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2',
                                            isDark
                                                ? 'focus-visible:ring-offset-slate-950'
                                                : 'focus-visible:ring-offset-white',
                                            datePreset === 'week'
                                                ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/30'
                                                : isDark
                                                  ? 'border border-slate-700/90 bg-slate-900/70 text-slate-300 hover:bg-slate-800/90 hover:text-white'
                                                  : 'border border-sky-200/90 bg-white/90 text-slate-700 hover:border-sky-300 hover:bg-sky-50',
                                        ].join(' ')}
                                        onClick={() => {
                                            setThisWeekRange()
                                            setTablePagination((prev) => ({ ...prev, current: 1 }))
                                        }}
                                    >
                                        This week
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={datePreset === 'month'}
                                        className={[
                                            'inline-flex min-h-[2.25rem] items-center justify-center rounded-full px-3 text-xs font-semibold tracking-tight transition-all duration-200 sm:min-h-[2.375rem] sm:px-3.5 sm:text-[0.8125rem]',
                                            'outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2',
                                            isDark
                                                ? 'focus-visible:ring-offset-slate-950'
                                                : 'focus-visible:ring-offset-white',
                                            datePreset === 'month'
                                                ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/30'
                                                : isDark
                                                  ? 'border border-slate-700/90 bg-slate-900/70 text-slate-300 hover:bg-slate-800/90 hover:text-white'
                                                  : 'border border-sky-200/90 bg-white/90 text-slate-700 hover:border-sky-300 hover:bg-sky-50',
                                        ].join(' ')}
                                        onClick={() => {
                                            setThisMonthRange()
                                            setTablePagination((prev) => ({ ...prev, current: 1 }))
                                        }}
                                    >
                                        This month
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={datePreset === 'custom'}
                                        className={[
                                            'inline-flex min-h-[2.25rem] items-center justify-center rounded-full px-3 text-xs font-semibold tracking-tight transition-all duration-200 sm:min-h-[2.375rem] sm:px-3.5 sm:text-[0.8125rem]',
                                            'outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2',
                                            isDark
                                                ? 'focus-visible:ring-offset-slate-950'
                                                : 'focus-visible:ring-offset-white',
                                            datePreset === 'custom'
                                                ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/30'
                                                : isDark
                                                  ? 'border border-slate-700/90 bg-slate-900/70 text-slate-300 hover:bg-slate-800/90 hover:text-white'
                                                  : 'border border-sky-200/90 bg-white/90 text-slate-700 hover:border-sky-300 hover:bg-sky-50',
                                        ].join(' ')}
                                        onClick={() => {
                                            setDatePreset('custom')
                                            if (!dateRange) {
                                                setDateRange([
                                                    dayjs().startOf('week'),
                                                    dayjs().endOf('week'),
                                                ])
                                            }
                                            setTablePagination((prev) => ({ ...prev, current: 1 }))
                                        }}
                                    >
                                        Customize
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="panel-elevated panel-elevated--table min-w-0">
                <div className="app-table-responsive">
                    <Table<Row>
                        rowKey="id"
                        className="app-data-table app-data-table--comfortable min-w-[min(720px,max(100%,18rem))]"
                        columns={columns}
                        dataSource={filteredDataSource}
                        loading={loading}
                        pagination={{
                            current: tablePagination.current,
                            pageSize: tablePagination.pageSize,
                            showSizeChanger: true,
                            responsive: true,
                            position: ['bottomCenter'],
                            className: TABLE_PAGINATION_COMFORT_CLASSNAME,
                            onChange: (page, pageSize) => {
                                setTablePagination({
                                    current: page,
                                    pageSize: pageSize ?? 20,
                                })
                            },
                        }}
                        scroll={{ x: 'max-content' }}
                        locale={{
                            emptyText:
                                'No matching calendar imports. Change filters, or use Calendar → Fetch Calendar Data (then open Schedule Table).',
                        }}
                    />
                </div>
            </div>
            <div className="surface-summary mt-6">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Schedule import rows
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-[clamp(1.5rem,1.1rem+1.8vw,2rem)] font-bold tabular-nums text-blue-700">
                            {filteredRows.toLocaleString()}
                        </span>
                        <span className="text-fluid-sm text-slate-500">
                            showing of{' '}
                            <strong className="text-slate-700">
                                {totalRows.toLocaleString()}
                            </strong>{' '}
                            imported rows
                        </span>
                    </div>
                </div>
                <div className="text-right text-xs text-slate-500 sm:max-w-md">
                    Rows with valid meeting date/time in current result:{' '}
                    <strong className="text-slate-700">{datedRows.toLocaleString()}</strong>
                </div>
            </div>
        </>
    )
}
