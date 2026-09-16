import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
    App,
    DatePicker,
    Select,
    Switch,
    Table,
    type TablePaginationConfig,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
    BarChartOutlined,
    CalendarOutlined,
    UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { Navigate } from 'react-router-dom'
import {
    getBidTimeSeries,
    getProfileHistoryStats,
    type TBidTimeSeriesResponse,
    type TProfileHistoryStat,
} from '../actions/statistics'
import { useAuth } from '../components/AuthContext'
import StatisticsBidLineChart from '@/components/StatisticsBidLineChart'
import { useThemeMode } from '@/components/ThemeContext'
import {
    aggregateBidTimeSeriesByProfileUser,
    chartBucketForStatisticsRange,
    filterBidTimeSeriesByProfileName,
} from '@/utils/statisticsChart'
import { USER_ROLES } from '../types/constants'
import {
    useProfileUsers,
    type TProfileUserOption,
} from '@/components/ProfileUsersContext'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'
import {
    getStatisticsPresetBounds,
    getStatisticsThisWeekBoundsPST,
    STATISTICS_TIMEZONE,
    statisticsRangeSummaryLabel,
    utcIsoRangeToLaDayjsTuple,
    type StatisticsDateRangePreset,
} from '../utils/statisticsDateRange'
import PageShell from '@/components/PageShell'

/** Select value for “show all profiles” (no `profileUserIndex` query param). */
const PROFILE_USER_FILTER_ALL = 'all' as const

/** “By name” mode: all profiles vs one profile name (client filter). */
const PROFILE_NAME_SELECT_ALL = 'all' as const

/** By-user table: index column width; other columns share one width. */
const BY_USER_TABLE_NO_WIDTH = 56
const BY_USER_TABLE_DATA_COL_WIDTH = 200

/** One table row per assigned profile user with ≥1 profile. */
type TStatisticsProfileUserRow = {
    kind: 'user'
    profileUserIndex: number
    /** Sum of `historyCount` for every profile owned by this user in the range. */
    bidCounts: number
    /** Profile names assigned to this slot (deduped, sorted). */
    ownerProfileNames: string[]
}

/** One row per profile when chart is “By name”. */
type TStatisticsProfileNameRow = {
    kind: 'name'
    profileId: number
    profileName: string
    bidCounts: number
    /** Profile user name, or — when unassigned. */
    ownerLabel: string
}

type TStatisticsTableRow = TStatisticsProfileUserRow | TStatisticsProfileNameRow

function aggregateStatsByProfileUser(
    profileRows: TProfileHistoryStat[],
    profileUserOptions: TProfileUserOption[]
): TStatisticsProfileUserRow[] {
    /** profileUserIndex → profileId → name + merged history count */
    const byUser = new Map<
        number,
        Map<number, { name: string; historyCount: number }>
    >()

    for (const r of profileRows) {
        const idx = normalizeProfileUserIndex(r.profileUserIndex)
        if (idx === null) continue
        let profiles = byUser.get(idx)
        if (!profiles) {
            profiles = new Map()
            byUser.set(idx, profiles)
        }
        const pid = r.profileId
        const add = Number(r.historyCount) || 0
        const prev = profiles.get(pid)
        if (!prev) {
            profiles.set(pid, {
                name: r.profileName ?? '',
                historyCount: add,
            })
        } else {
            profiles.set(pid, {
                name: prev.name || r.profileName || '',
                historyCount: prev.historyCount + add,
            })
        }
    }

    const out: TStatisticsProfileUserRow[] = []
    for (const { value } of profileUserOptions) {
        const profiles = byUser.get(value)
        if (!profiles || profiles.size < 1) continue
        let bidCounts = 0
        const names: string[] = []
        for (const { name, historyCount } of profiles.values()) {
            bidCounts += historyCount
            if (name) names.push(name)
        }
        names.sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        )
        out.push({
            kind: 'user',
            profileUserIndex: value,
            bidCounts,
            ownerProfileNames: names,
        })
    }
    return out
}

/** Order for “By name” table: by profile user, unassigned last — rows for one owner stay together. */
function profileUserSortKey(
    profileUserIndex: number | null | undefined
): number {
    return normalizeProfileUserIndex(profileUserIndex) ?? Number.MAX_SAFE_INTEGER
}

function buildProfileNameTableRows(
    profileRows: TProfileHistoryStat[],
    nameFilter: string | null,
    labelOf: (index: number | null | undefined) => string
): TStatisticsProfileNameRow[] {
    const f = nameFilter?.trim()
    const filtered = f
        ? profileRows.filter(
              (r) =>
                  (r.profileName ?? '').trim().toLowerCase() ===
                  f.toLowerCase()
          )
        : [...profileRows]
    filtered.sort((a, b) => {
        const ka = profileUserSortKey(a.profileUserIndex)
        const kb = profileUserSortKey(b.profileUserIndex)
        if (ka !== kb) return ka - kb
        return (a.profileName || '').localeCompare(
            b.profileName || '',
            undefined,
            { sensitivity: 'base' }
        )
    })
    return filtered.map((r) => ({
        kind: 'name',
        profileId: r.profileId,
        profileName: r.profileName || '',
        bidCounts: Number(r.historyCount) || 0,
        ownerLabel: labelOf(r.profileUserIndex) || '—',
    }))
}

const Statistics = () => {
    const { message } = App.useApp()
    const { user } = useAuth()
    const {
        options: profileUserOptions,
        isKnownIndex,
        labelOf,
    } = useProfileUsers()
    const { isDark } = useThemeMode()
    const isManager =
        String(user?.role ?? '')
            .trim()
            .toUpperCase() === USER_ROLES.MANAGER
    const [loading, setLoading] = useState(false)
    const [rows, setRows] = useState<TProfileHistoryStat[]>([])
    const [timeseries, setTimeseries] = useState<TBidTimeSeriesResponse | null>(
        null
    )
    const [pagination, setPagination] = useState<TablePaginationConfig>({
        current: 1,
        pageSize: 50,
    })
    /** Filter API by profile user; `undefined` = all. */
    const [profileUserIndex, setProfileUserIndex] = useState<
        number | undefined
    >(undefined)
    /** “By name” chart/table: filter rows by profile name; `null` = all. */
    const [profileNameFilter, setProfileNameFilter] = useState<string | null>(
        null
    )
    /**
     * When false (default), the API only loads profiles that have a profile user
     * assigned. When true, also include unassigned profiles.
     */
    const [includeUnassignedProfiles] = useState(false)
    /** When true, bid chart stacks totals by profile user; when false, by profile name. */
    const [chartGroupByProfileUser, setChartGroupByProfileUser] =
        useState(true)
    const [datePreset, setDatePreset] =
        useState<StatisticsDateRangePreset>('week')
    const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)

    useLayoutEffect(() => {
        if (datePreset !== 'custom') return
        dayjs.tz.setDefault(STATISTICS_TIMEZONE)
        return () => {
            dayjs.tz.setDefault()
        }
    }, [datePreset])

    const queryBounds = useMemo(() => {
        if (datePreset === 'custom') {
            if (!customRange?.[0] || !customRange?.[1]) {
                return getStatisticsThisWeekBoundsPST()
            }
            const a = customRange[0].utc().toISOString()
            const b = customRange[1].utc().toISOString()
            if (dayjs.utc(a).valueOf() <= dayjs.utc(b).valueOf()) {
                return { startAt: a, endAt: b }
            }
            return { startAt: b, endAt: a }
        }
        return getStatisticsPresetBounds(datePreset)
    }, [datePreset, customRange])

    useEffect(() => {
        if (chartGroupByProfileUser) {
            setProfileNameFilter(null)
        } else {
            setProfileUserIndex(undefined)
        }
    }, [chartGroupByProfileUser])

    const panResetKey = useMemo(
        () =>
            `${includeUnassignedProfiles ? 'allp' : 'slotted'}-${
                profileUserIndex ?? 'all'
            }-${chartGroupByProfileUser ? 'user' : 'name'}-pn:${
                profileNameFilter ?? 'all'
            }-${datePreset}-${queryBounds.startAt}-${queryBounds.endAt}`,
        [
            includeUnassignedProfiles,
            profileUserIndex,
            chartGroupByProfileUser,
            profileNameFilter,
            datePreset,
            queryBounds.startAt,
            queryBounds.endAt,
        ]
    )

    const chartTimeSeries = useMemo(() => {
        if (!timeseries) return null
        if (chartGroupByProfileUser) {
            return aggregateBidTimeSeriesByProfileUser(
                timeseries,
                profileUserOptions
            )
        }
        const f = profileNameFilter?.trim()
        if (f) {
            return filterBidTimeSeriesByProfileName(timeseries, f)
        }
        return timeseries
    }, [
        timeseries,
        chartGroupByProfileUser,
        profileNameFilter,
        profileUserOptions,
    ])

    const loadStats = useCallback(async () => {
        setLoading(true)

        const common = {
            startAt: queryBounds.startAt,
            endAt: queryBounds.endAt,
            // An index that no longer exists is cleared by the effect below, not here,
            // so this stays independent of the (async) profile user list.
            ...(chartGroupByProfileUser &&
            normalizeProfileUserIndex(profileUserIndex) !== null
                ? { profileUserIndex }
                : {}),
            ...(!includeUnassignedProfiles
                ? { assignedProfileUserOnly: true as const }
                : {}),
        }
        /** Week/month presets always use day buckets so the axis shows dates, not clock times. */
        const bucket =
            datePreset === 'all'
                ? ('month' as const)
                : datePreset === 'week' || datePreset === 'month'
                  ? ('day' as const)
                  : chartBucketForStatisticsRange(
                        queryBounds.startAt,
                        queryBounds.endAt
                    )

        const [tableResult, chartResult] = await Promise.allSettled([
            getProfileHistoryStats(common),
            getBidTimeSeries({ ...common, bucket }),
        ])

        if (tableResult.status === 'fulfilled') {
            const data = tableResult.value
            setRows(Array.isArray(data) ? data : [])
        } else {
            message.error('Could not load statistics. Please try again.')
            setRows([])
        }

        if (chartResult.status === 'fulfilled') {
            setTimeseries(chartResult.value)
        } else {
            setTimeseries(null)
            if (tableResult.status === 'fulfilled') {
                message.warning('Could not load bid chart.')
            }
        }

        setLoading(false)
    }, [
        chartGroupByProfileUser,
        datePreset,
        includeUnassignedProfiles,
        profileUserIndex,
        queryBounds.startAt,
        queryBounds.endAt,
        message,
    ])

    useEffect(() => {
        void loadStats()
    }, [loadStats])

    /** Drop a profile user that was deleted while this page was open. */
    useEffect(() => {
        if (profileUserIndex === undefined) return
        if (profileUserOptions.length === 0) return
        if (!isKnownIndex(profileUserIndex)) setProfileUserIndex(undefined)
    }, [profileUserIndex, profileUserOptions, isKnownIndex])

    const profileNameSelectOptions = useMemo(() => {
        const names = new Set<string>()
        for (const r of rows) {
            const n = r.profileName?.trim()
            if (n) names.add(n)
        }
        return [...names].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        )
    }, [rows])

    const tableRows = useMemo((): TStatisticsTableRow[] => {
        const base = chartGroupByProfileUser
            ? aggregateStatsByProfileUser(rows, profileUserOptions)
            : buildProfileNameTableRows(rows, profileNameFilter, labelOf)
        return base.filter((r) => r.bidCounts > 0)
    }, [
        rows,
        chartGroupByProfileUser,
        profileNameFilter,
        profileUserOptions,
        labelOf,
    ])

    const totalBidsAllProfiles = useMemo(
        () =>
            rows.reduce((sum, r) => sum + (Number(r.historyCount) || 0), 0),
        [rows]
    )

    const totalBidsAssignedInTable = useMemo(
        () => tableRows.reduce((sum, r) => sum + r.bidCounts, 0),
        [tableRows]
    )

    useEffect(() => {
        setPagination((p) => ({ ...p, current: 1 }))
    }, [
        includeUnassignedProfiles,
        profileUserIndex,
        profileNameFilter,
        chartGroupByProfileUser,
        datePreset,
        queryBounds.startAt,
        queryBounds.endAt,
    ])

    const rangeSummary = statisticsRangeSummaryLabel(datePreset)

    const columns: ColumnsType<TStatisticsTableRow> = useMemo(() => {
        const current = pagination.current ?? 1
        const pageSize = pagination.pageSize ?? 50
        const noCol = {
            title: 'No',
            key: 'no',
            width: BY_USER_TABLE_NO_WIDTH,
            render: (_: unknown, __: TStatisticsTableRow, index: number) => (
                <span>{(current - 1) * pageSize + index + 1}</span>
            ),
        }
        const bidCol = {
            title: 'Bid counts',
            key: 'bidCounts',
            width: 120,
            render: (_: unknown, record: TStatisticsTableRow) => {
                const text = record.bidCounts.toLocaleString()
                return <span title={text}>{text}</span>
            },
        }
        const w = BY_USER_TABLE_DATA_COL_WIDTH
        if (chartGroupByProfileUser) {
            return [
                noCol,
                {
                    title: 'Profile user',
                    key: 'profileUserIndex',
                    width: w,
                    ellipsis: true,
                    render: (_: unknown, record: TStatisticsTableRow) => {
                        if (record.kind !== 'user') return null
                        const name = labelOf(record.profileUserIndex)
                        return <span title={name}>{name}</span>
                    },
                },
                {
                    title: 'Bid counts',
                    key: 'bidCounts',
                    width: w,
                    ellipsis: true,
                    render: (_: unknown, record: TStatisticsTableRow) => {
                        if (record.kind !== 'user') return null
                        const text = record.bidCounts.toLocaleString()
                        return <span title={text}>{text}</span>
                    },
                },
                {
                    title: 'Own profiles',
                    key: 'ownProfiles',
                    width: w,
                    ellipsis: true,
                    render: (_: unknown, record: TStatisticsTableRow) => {
                        if (record.kind !== 'user') return null
                        const text = record.ownerProfileNames.join(', ')
                        return <span title={text}>{text}</span>
                    },
                },
            ]
        }
        return [
            noCol,
            {
                title: 'Profile user',
                key: 'profileUser',
                width: 120,
                ellipsis: true,
                render: (_: unknown, record: TStatisticsTableRow) => {
                    if (record.kind !== 'name') return null
                    const text = record.ownerLabel
                    return <span title={text}>{text}</span>
                },
            },
            {
                title: 'Profile name',
                key: 'profileName',
                width: 200,
                ellipsis: true,
                render: (_: unknown, record: TStatisticsTableRow) => {
                    if (record.kind !== 'name') return null
                    const text = record.profileName
                    return <span title={text}>{text}</span>
                },
            },
            bidCol,
        ]
    }, [chartGroupByProfileUser, pagination.current, pagination.pageSize, labelOf])

    if (!isManager) {
        return <Navigate to="/" replace />
    }

    return (
        <PageShell
            title="Statistics"
            className="!pt-4 sm:!pt-6"
        >
            <div className="mb-[clamp(1rem,2.5vw+0.35rem,2rem)]">
                <div
                    className="statistics-search-shell surface-filters mt-2 sm:mt-4"
                    role="search"
                    aria-label="Statistics filters"
                >
                    <div className="statistics-search-flex">
                        {/* Date range (Pacific); UTC ISO sent to API */}
                        <div className="statistics-search-part statistics-search-part--date">
                            <div className="statistics-search-part-head shrink-0 text-slate-600">
                                <span className="flex h-[clamp(2rem,4vw,2.25rem)] w-[clamp(2rem,4vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                                    <CalendarOutlined className="text-fluid-base" />
                                </span>
                                <div className="min-w-0">
                                    <div className="statistics-filter-title text-sm font-semibold text-slate-800">
                                        Date range
                                    </div>
                                    <div className="text-fluid-xs text-slate-500">
                                        America/Los_Angeles (PST/PDT)
                                    </div>
                                </div>
                            </div>
                            <div className="statistics-search-part-body">
                                <div
                                    className="statistics-date-preset-buttons flex flex-wrap gap-2"
                                    role="group"
                                    aria-label="Statistics date range preset"
                                >
                                    {(
                                        [
                                            {
                                                value: 'today' as const,
                                                label: 'Today',
                                            },
                                            {
                                                value: 'week' as const,
                                                label: 'This week',
                                            },
                                            {
                                                value: 'month' as const,
                                                label: 'This month',
                                            },
                                            {
                                                value: 'custom' as const,
                                                label: 'Customize',
                                            },
                                        ] as const
                                    ).map(({ value, label }) => {
                                        const selected = datePreset === value
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={selected}
                                                className={[
                                                    'inline-flex min-h-[2.25rem] items-center justify-center rounded-full px-3 text-xs font-semibold tracking-tight transition-all duration-200 sm:min-h-[2.375rem] sm:px-3.5 sm:text-[0.8125rem]',
                                                    'outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2',
                                                    isDark
                                                        ? 'focus-visible:ring-offset-slate-950'
                                                        : 'focus-visible:ring-offset-white',
                                                    selected
                                                        ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/30'
                                                        : isDark
                                                          ? 'border border-slate-700/90 bg-slate-900/70 text-slate-300 hover:bg-slate-800/90 hover:text-white'
                                                          : 'border border-sky-200/90 bg-white/90 text-slate-700 hover:border-sky-300 hover:bg-sky-50',
                                                ].join(' ')}
                                                onClick={() => {
                                                    if (
                                                        value === 'custom' &&
                                                        datePreset !== 'custom'
                                                    ) {
                                                        const seed =
                                                            getStatisticsPresetBounds(
                                                                datePreset
                                                            )
                                                        setCustomRange(
                                                            utcIsoRangeToLaDayjsTuple(
                                                                seed.startAt,
                                                                seed.endAt
                                                            )
                                                        )
                                                    }
                                                    setDatePreset(value)
                                                }}
                                            >
                                                {label}
                                            </button>
                                        )
                                    })}
                                </div>
                                {datePreset === 'custom' ? (
                                    <DatePicker.RangePicker
                                        showTime={{
                                            format: 'HH:mm',
                                            showSecond: false,
                                        }}
                                        format="YYYY-MM-DD HH:mm"
                                        needConfirm={false}
                                        value={customRange ?? undefined}
                                        onChange={(vals) => {
                                            if (
                                                vals?.[0] &&
                                                vals?.[1] &&
                                                vals[0] &&
                                                vals[1]
                                            ) {
                                                setCustomRange([vals[0], vals[1]])
                                            }
                                        }}
                                        allowEmpty={[false, false]}
                                        className="statistics-date-range-picker w-full min-w-0 max-w-full"
                                        placeholder={['Start', 'End']}
                                        aria-label="Custom date and time range in Pacific"
                                    />
                                ) : null}
                            </div>
                        </div>

                        {/* Profile user (by-user mode) or profile name (by-name mode) */}
                        <div className="statistics-search-part statistics-search-part--profile">
                            <div className="statistics-search-part-head text-slate-600">
                                <span className="flex h-[clamp(2rem,4vw,2.25rem)] w-[clamp(2rem,4vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                                    <UserOutlined className="text-fluid-base" />
                                </span>
                                <div className="min-w-0">
                                    <div className="statistics-filter-title text-sm font-semibold text-slate-800">
                                        {chartGroupByProfileUser
                                            ? 'Profile user'
                                            : 'Profile name'}
                                    </div>
                                </div>
                            </div>
                            <div className="statistics-search-part-body">
                                {chartGroupByProfileUser ? (
                                    <Select
                                        className="statistics-search-select w-full min-w-0 min-h-10 [&_.ant-select-selector]:!flex [&_.ant-select-selector]:!h-10 [&_.ant-select-selector]:!min-h-10 [&_.ant-select-selector]:!items-center"
                                        popupMatchSelectWidth={false}
                                        value={
                                            profileUserIndex === undefined
                                                ? PROFILE_USER_FILTER_ALL
                                                : profileUserIndex
                                        }
                                        onChange={(v) => {
                                            if (
                                                v === PROFILE_USER_FILTER_ALL ||
                                                v === null ||
                                                v === undefined
                                            ) {
                                                setProfileUserIndex(undefined)
                                            } else {
                                                setProfileUserIndex(Number(v))
                                            }
                                        }}
                                        options={[
                                            {
                                                label: 'All',
                                                value: PROFILE_USER_FILTER_ALL,
                                            },
                                            ...profileUserOptions,
                                        ]}
                                        aria-label="Filter by profile user"
                                    />
                                ) : (
                                    <Select
                                        className="statistics-search-select w-full min-w-0 min-h-10 [&_.ant-select-selector]:!flex [&_.ant-select-selector]:!h-10 [&_.ant-select-selector]:!min-h-10 [&_.ant-select-selector]:!items-center"
                                        popupMatchSelectWidth={false}
                                        value={
                                            profileNameFilter ??
                                            PROFILE_NAME_SELECT_ALL
                                        }
                                        onChange={(v) => {
                                            if (
                                                v === PROFILE_NAME_SELECT_ALL ||
                                                v === null ||
                                                v === undefined
                                            ) {
                                                setProfileNameFilter(null)
                                            } else {
                                                setProfileNameFilter(String(v))
                                            }
                                        }}
                                        options={[
                                            {
                                                label: 'All',
                                                value: PROFILE_NAME_SELECT_ALL,
                                            },
                                            ...profileNameSelectOptions.map(
                                                (n) => ({
                                                    label: n,
                                                    value: n,
                                                })
                                            ),
                                        ]}
                                        aria-label="Filter by profile name"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Chart: profile names vs profile user totals */}
                        <div className="statistics-search-part statistics-search-part--chart">
                            <div className="statistics-search-part-head text-slate-600">
                                <span className="flex h-[clamp(2rem,4vw,2.25rem)] w-[clamp(2rem,4vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                    <BarChartOutlined className="text-fluid-base" />
                                </span>
                                <div className="min-w-0">
                                    <div className="statistics-filter-title text-sm font-semibold text-slate-800">
                                        Bid chart
                                    </div>
                                </div>
                            </div>
                            <div className="statistics-search-part-body">
                            <div className="statistics-toggle-row">
                                <span
                                    className={`text-fluid-sm font-medium transition-colors ${
                                        !chartGroupByProfileUser
                                            ? 'text-blue-700'
                                            : 'text-slate-400'
                                    }`}
                                >
                                    By name
                                </span>
                                <Switch
                                    checked={chartGroupByProfileUser}
                                    onChange={setChartGroupByProfileUser}
                                    aria-label="Chart totals by profile user instead of profile name"
                                    className="bg-slate-300 [&_.ant-switch-handle]:before:!bg-white [&.ant-switch-checked]:!bg-blue-600"
                                />
                                <span
                                    className={`text-fluid-sm font-medium transition-colors ${
                                        chartGroupByProfileUser
                                            ? 'text-blue-700'
                                            : 'text-slate-400'
                                    }`}
                                >
                                    By user
                                </span>
                            </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-[clamp(1rem,2.5vw+0.35rem,1.75rem)]">
                <StatisticsBidLineChart
                    data={chartTimeSeries}
                    loading={loading && !timeseries}
                    isDark={isDark}
                    panResetKey={panResetKey}
                />
            </div>

            <div className="panel-elevated panel-elevated--table min-w-0">
                <div className="app-table-responsive">
                <Table<TStatisticsTableRow>
                    rowKey={(r) =>
                        r.kind === 'user'
                            ? `u-${r.profileUserIndex}`
                            : `n-${r.profileId}`
                    }
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={tableRows}
                    pagination={{
                        ...pagination,
                        total: tableRows.length,
                        pageSize: pagination.pageSize ?? 50,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200', '500'],
                        className:
                            '!m-0 border-t border-slate-100/90 bg-slate-50/50 px-3 py-3',
                        onChange: (current, pageSize) =>
                            setPagination((prev) => ({
                                ...prev,
                                current,
                                pageSize,
                            })),
                    }}
                    className="app-data-table min-w-[min(920px,max(100%,22rem))]"
                    tableLayout={
                        chartGroupByProfileUser ? 'fixed' : 'auto'
                    }
                    scroll={{
                        x: chartGroupByProfileUser
                            ? BY_USER_TABLE_NO_WIDTH +
                              3 * BY_USER_TABLE_DATA_COL_WIDTH
                            : 'max-content',
                    }}
                />
                </div>
            </div>

            <div className="surface-summary mt-6">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total bid / history counts ({rangeSummary})
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-[clamp(1.5rem,1.1rem+1.8vw,2rem)] font-bold tabular-nums text-blue-700">
                            {totalBidsAllProfiles.toLocaleString()}
                        </span>
                        <span className="text-fluid-sm text-slate-500">
                            entries across{' '}
                            <strong className="text-slate-700">
                                {rows.length}
                            </strong>{' '}
                            profile
                            {rows.length === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>
                {totalBidsAssignedInTable !== totalBidsAllProfiles ? (
                    <div className="border-t border-slate-200/80 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {chartGroupByProfileUser
                                ? 'Assigned profile users (table)'
                                : profileNameFilter?.trim()
                                  ? 'Filtered profiles (table)'
                                  : 'Table total'}
                        </div>
                        <div className="mt-1 text-[clamp(1.125rem,1rem+0.6vw,1.375rem)] font-semibold tabular-nums text-emerald-700">
                            {totalBidsAssignedInTable.toLocaleString()}{' '}
                            <span className="text-sm font-normal text-slate-500">
                                · {tableRows.length}{' '}
                                {chartGroupByProfileUser
                                    ? `user${
                                          tableRows.length === 1 ? '' : 's'
                                      }`
                                    : `profile${
                                          tableRows.length === 1 ? '' : 's'
                                      }`}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="text-right text-xs text-slate-500 sm:max-w-md">
                        {chartGroupByProfileUser
                            ? 'Table aggregates bid counts by profile user with at least one assigned profile; rows with zero bids in the range are hidden.'
                            : 'Table lists each profile with non-zero bid counts, grouped by profile user (unassigned last) and sorted by profile name within each owner.'}
                    </div>
                )}
            </div>
        </PageShell>
    )
}

export default Statistics
