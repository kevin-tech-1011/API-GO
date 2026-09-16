import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { Spin } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'
import type { TBidTimeSeriesResponse } from '@/actions/statistics'
import { statsProfileDataKey } from '@/utils/statisticsChart'

const MAX_PROFILE_LINES = 14

/** Minimum inclusive span in bucket indices (at least two buckets). */
const MIN_WINDOW_SPAN = 1

const BAR_COLORS = [
    '#0ea5e9',
    '#2563eb',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#0d9488',
    '#059669',
    '#ca8a04',
    '#ea580c',
    '#e11d48',
    '#64748b',
    '#0891b2',
    '#4f46e5',
    '#db2777',
]

type Props = {
    data: TBidTimeSeriesResponse | null
    /** True only before first chart payload (no overlay on drag / refetch). */
    loading: boolean
    isDark: boolean
    /** When profile filter / chart grouping changes, timeline view resets. */
    panResetKey: string
}

type WindowRange = { startIndex: number; endIndex: number }

type DragSession = {
    pointerId: number
    originClientX: number
    originStart: number
    originEnd: number
}

export default function StatisticsBidLineChart({
    data,
    loading,
    isDark,
    panResetKey,
}: Props) {
    const tickColor = isDark ? '#94a3b8' : '#64748b'
    const gridColor = isDark ? 'rgb(51 65 85 / 0.55)' : 'rgb(226 232 240 / 0.9)'
    const tooltipBg = isDark ? 'rgb(15 23 42 / 0.96)' : 'rgb(255 255 255 / 0.98)'
    const tooltipBorder = isDark ? 'rgb(51 65 85 / 0.9)' : 'rgb(186 230 253 / 0.9)'

    const chartWrapRef = useRef<HTMLDivElement>(null)
    const windowRef = useRef<WindowRange | null>(null)
    const dragSessionRef = useRef<DragSession | null>(null)
    const prevLenRef = useRef(0)
    const prevFirstKeyRef = useRef<string | null>(null)
    const prevLastKeyRef = useRef<string | null>(null)

    const rankedProfiles = useMemo(() => {
        if (!data?.profiles?.length || !data?.points?.length) return []
        const totals = data.profiles.map((p) => ({
            ...p,
            total: data.points.reduce(
                (sum, pt) =>
                    sum + Number(pt[statsProfileDataKey(p.profileId)] ?? 0),
                0
            ),
        }))
        totals.sort(
            (a, b) =>
                b.total - a.total ||
                a.profileName.localeCompare(b.profileName, undefined, {
                    sensitivity: 'base',
                })
        )
        const positive = totals.filter((p) => p.total > 0)
        return positive.slice(0, MAX_PROFILE_LINES)
    }, [data])

    const hiddenCount = useMemo(() => {
        if (!data?.profiles?.length || !rankedProfiles.length) return 0
        const shown = new Set(rankedProfiles.map((p) => p.profileId))
        const withBids = data.profiles.filter((p) => {
            const t = data.points.reduce(
                (sum, pt) =>
                    sum + Number(pt[statsProfileDataKey(p.profileId)] ?? 0),
                0
            )
            return t > 0
        })
        return withBids.filter((p) => !shown.has(p.profileId)).length
    }, [data, rankedProfiles])

    const [timelineWindow, setTimelineWindow] = useState<WindowRange | null>(
        null
    )

    useEffect(() => {
        setTimelineWindow(null)
        prevLenRef.current = 0
        prevFirstKeyRef.current = null
        prevLastKeyRef.current = null
    }, [panResetKey])

    useEffect(() => {
        if (!data?.points?.length) return
        setTimelineWindow((w) =>
            w === null
                ? computeInitialVisibleWindow(
                      data.points.length,
                      data.bucket
                  )
                : w
        )
    }, [data?.points, data?.bucket])

    const pointCount = data?.points?.length ?? 0

    const effectiveWindow = useMemo(() => {
        if (!data || !data.points.length) return null
        const n = data.points.length
        const raw =
            timelineWindow ??
            computeInitialVisibleWindow(n, data.bucket)
        return clampWindowToBounds(raw, n, data.bucket)
    }, [data, timelineWindow])

    useEffect(() => {
        windowRef.current = effectiveWindow
    }, [effectiveWindow])

    /** After API loads more past / future buckets, keep the view aligned on the same calendar slice. */
    useEffect(() => {
        if (!data?.points?.length) {
            prevLenRef.current = 0
            prevFirstKeyRef.current = null
            prevLastKeyRef.current = null
            return
        }
        const newLen = data.points.length
        const newFirst = String(data.points[0]?.bucketKey ?? '')
        const newLast = String(data.points[newLen - 1]?.bucketKey ?? '')
        const oldLen = prevLenRef.current
        const oldFirst = prevFirstKeyRef.current
        const oldLast = prevLastKeyRef.current

        if (oldLen > 0 && newLen > oldLen && oldFirst && newFirst < oldFirst) {
            const delta = newLen - oldLen
            setTimelineWindow((w) => {
                if (!w) return w
                return {
                    startIndex: w.startIndex + delta,
                    endIndex: Math.min(newLen - 1, w.endIndex + delta),
                }
            })
        } else if (
            oldLen > 0 &&
            newLen > oldLen &&
            oldLast &&
            newLast > oldLast
        ) {
            setTimelineWindow((w) => {
                if (!w) return w
                if (w.endIndex !== oldLen - 1) return w
                return {
                    startIndex: Math.max(0, w.startIndex),
                    endIndex: newLen - 1,
                }
            })
        }

        prevLenRef.current = newLen
        prevFirstKeyRef.current = newFirst
        prevLastKeyRef.current = newLast
    }, [data?.points])

    const visibleData = useMemo(() => {
        if (!data?.points?.length || !effectiveWindow) return []
        const { startIndex, endIndex } = effectiveWindow
        const s = Math.max(
            0,
            Math.min(startIndex, endIndex, data.points.length - 1)
        )
        const e = Math.min(
            data.points.length - 1,
            Math.max(startIndex, endIndex, s)
        )
        return data.points.slice(s, e + 1)
    }, [data?.points, effectiveWindow])

    const visiblePointCount = visibleData.length

    const applyPanFromClientX = useCallback(
        (clientX: number, session: DragSession) => {
            if (!data?.points?.length) return
            const n = data.points.length
            const span = session.originEnd - session.originStart
            const width =
                chartWrapRef.current?.getBoundingClientRect().width ?? 400
            const pxPerIndex = Math.max(width / Math.max(span + 1, 1), 8)
            const indexShift = Math.round(
                -(clientX - session.originClientX) / pxPerIndex
            )

            const desiredStart = session.originStart + indexShift
            const desiredEnd = session.originEnd + indexShift

            let ns = desiredStart
            let ne = desiredEnd

            if (ns < 0) {
                ne -= ns
                ns = 0
            }
            if (ne > n - 1) {
                const overflow = ne - (n - 1)
                ne -= overflow
                ns -= overflow
            }
            ns = Math.max(0, ns)
            ne = Math.min(n - 1, ne)

            if (ne - ns < MIN_WINDOW_SPAN) {
                ne = Math.min(n - 1, ns + MIN_WINDOW_SPAN)
                if (ne - ns < MIN_WINDOW_SPAN) {
                    ns = Math.max(0, ne - MIN_WINDOW_SPAN)
                }
            }

            const next = clampVisibleWindow(ns, ne, n)
            if (next) setTimelineWindow(next)
        },
        [data]
    )

    const onPointerDownCapture = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0 || !data?.points?.length) return
            const wr = windowRef.current
            if (!wr || data.points.length < 2) return
            e.preventDefault()
            dragSessionRef.current = {
                pointerId: e.pointerId,
                originClientX: e.clientX,
                originStart: wr.startIndex,
                originEnd: wr.endIndex,
            }
            e.currentTarget.setPointerCapture(e.pointerId)
        },
        [data]
    )

    const onPointerMoveCapture = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const session = dragSessionRef.current
            if (!session || e.pointerId !== session.pointerId) return
            applyPanFromClientX(e.clientX, session)
        },
        [applyPanFromClientX]
    )

    const onPointerUpCapture = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const session = dragSessionRef.current
            if (!session || e.pointerId !== session.pointerId) return
            dragSessionRef.current = null
            try {
                e.currentTarget.releasePointerCapture(e.pointerId)
            } catch {
                /* ignore */
            }
        },
        []
    )

    const onPointerCancelCapture = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            dragSessionRef.current = null
            try {
                e.currentTarget.releasePointerCapture(e.pointerId)
            } catch {
                /* ignore */
            }
        },
        []
    )

    if (loading && !data) {
        return (
            <div className="panel-elevated flex min-h-[280px] items-center justify-center p-8">
                <Spin size="large" />
            </div>
        )
    }

    if (!data?.points?.length) {
        return (
            <div className="panel-elevated flex min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
                <BarChartOutlined className="text-3xl text-sky-400/80" />
                <p
                    className={
                        isDark
                            ? 'text-fluid-sm font-medium text-slate-300'
                            : 'text-fluid-sm font-medium text-slate-600'
                    }
                >
                    No time buckets in this range
                </p>
                <p className="max-w-md text-fluid-xs text-slate-500">
                    Adjust the date range or profile user filter.
                </p>
            </div>
        )
    }

    if (!rankedProfiles.length) {
        return (
            <div className="panel-elevated flex min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
                <BarChartOutlined
                    className={
                        isDark ? 'text-3xl text-slate-600' : 'text-3xl text-slate-300'
                    }
                />
                <p
                    className={
                        isDark
                            ? 'text-fluid-sm font-medium text-slate-300'
                            : 'text-fluid-sm font-medium text-slate-600'
                    }
                >
                    No bids in this window
                </p>
                <p className="max-w-md text-fluid-xs text-slate-500">
                    History entries will appear here when profiles receive bids
                    in the selected range.
                </p>
            </div>
        )
    }

    const manyTicks = visiblePointCount > 14
    const xAngle = 0

    return (
        <div className="panel-elevated relative overflow-hidden p-[clamp(0.75rem,2vw,1.25rem)] sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2
                        className={
                            isDark
                                ? 'text-fluid-lg font-semibold tracking-tight text-slate-100'
                                : 'text-fluid-lg font-semibold tracking-tight text-slate-800'
                        }
                    >
                        Bids over time
                    </h2>
                    <p
                        className={
                            isDark
                                ? 'mt-0.5 text-fluid-xs text-slate-400'
                                : 'mt-0.5 text-fluid-xs text-slate-500'
                        }
                    >
                        {data.granularity} · {STATISTICS_TIMEZONE_LABEL}
                    </p>
                    {pointCount > 1 && (
                        <p
                            className={
                                isDark
                                    ? 'mt-1.5 max-w-2xl text-[11px] leading-snug text-slate-500'
                                    : 'mt-1.5 max-w-2xl text-[11px] leading-snug text-slate-500'
                            }
                        >
                            Drag horizontally to pan. The chart loads a wide range
                            in one request; panning does not call the API or show
                            loading.
                        </p>
                    )}
                </div>
                {hiddenCount > 0 && (
                    <p
                        className={
                            isDark
                                ? 'text-fluid-xs text-amber-300/90'
                                : 'text-fluid-xs text-amber-700/90'
                        }
                    >
                        Showing top {MAX_PROFILE_LINES} profiles by volume (
                        {hiddenCount} hidden)
                    </p>
                )}
            </div>
            <div
                ref={chartWrapRef}
                className={`h-[min(420px,max(280px,38vh))] w-full min-h-[260px] cursor-grab select-none active:cursor-grabbing ${pointCount > 1 ? 'touch-none' : ''}`}
                onPointerDownCapture={onPointerDownCapture}
                onPointerMoveCapture={onPointerMoveCapture}
                onPointerUpCapture={onPointerUpCapture}
                onPointerCancelCapture={onPointerCancelCapture}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={visibleData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 12 }}
                        barCategoryGap="14%"
                        maxBarSize={48}
                    >
                        <CartesianGrid
                            strokeDasharray="3 6"
                            stroke={gridColor}
                            vertical={false}
                        />
                        <XAxis
                            dataKey="label"
                            tick={{ fill: tickColor, fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: gridColor }}
                            interval={manyTicks ? 'preserveStartEnd' : 0}
                            angle={xAngle}
                            textAnchor={xAngle ? 'end' : 'middle'}
                            height={xAngle ? 72 : 40}
                        />
                        <YAxis
                            allowDecimals={false}
                            width={40}
                            tick={{ fill: tickColor, fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: gridColor }}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgb(14 165 233 / 0.08)' }}
                            contentStyle={{
                                background: tooltipBg,
                                border: `1px solid ${tooltipBorder}`,
                                borderRadius: 12,
                                fontSize: 12,
                            }}
                            labelStyle={{
                                color: isDark ? '#e2e8f0' : '#334155',
                                fontWeight: 600,
                            }}
                            itemStyle={{ color: isDark ? '#cbd5e1' : '#475569' }}
                        />
                        <Legend
                            wrapperStyle={{
                                fontSize: 11,
                                color: tickColor,
                                paddingTop: 8,
                            }}
                        />
                        {rankedProfiles.map((p, i) => (
                            <Bar
                                key={p.profileId}
                                dataKey={statsProfileDataKey(p.profileId)}
                                name={p.profileName}
                                fill={BAR_COLORS[i % BAR_COLORS.length]}
                                radius={[5, 5, 0, 0]}
                                isAnimationActive={visibleData.length < 40}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

const STATISTICS_TIMEZONE_LABEL = 'Pacific (LA)'

function computeInitialVisibleWindow(
    pointCount: number,
    bucket: 'hour' | 'day' | 'month'
): WindowRange {
    if (pointCount <= 0) {
        return { startIndex: 0, endIndex: 0 }
    }
    if (pointCount === 1) {
        return { startIndex: 0, endIndex: 0 }
    }
    const last = pointCount - 1
    const defaultWidth =
        bucket === 'hour'
            ? Math.min(24, Math.max(8, pointCount))
            : bucket === 'day'
              ? Math.min(21, Math.max(7, Math.min(pointCount, 18)))
              : pointCount
    const span = Math.min(defaultWidth, pointCount)
    const startIndex = Math.max(0, pointCount - span)
    return { startIndex, endIndex: last }
}

function clampVisibleWindow(
    startIndex: number,
    endIndex: number,
    pointCount: number
): WindowRange | null {
    if (pointCount <= 0) return null
    const last = pointCount - 1
    let s = Math.max(0, Math.min(startIndex, endIndex, last))
    let e = Math.min(last, Math.max(startIndex, endIndex, s))
    if (e - s < MIN_WINDOW_SPAN) {
        e = Math.min(last, s + MIN_WINDOW_SPAN)
        if (e - s < MIN_WINDOW_SPAN) {
            s = Math.max(0, e - MIN_WINDOW_SPAN)
        }
    }
    return { startIndex: s, endIndex: e }
}

function clampWindowToBounds(
    w: WindowRange,
    pointCount: number,
    bucket: 'hour' | 'day' | 'month'
): WindowRange {
    if (pointCount <= 0) return { startIndex: 0, endIndex: 0 }
    const last = pointCount - 1
    let s = Math.max(0, Math.min(w.startIndex, last))
    let e = Math.max(0, Math.min(w.endIndex, last))
    if (e < s) {
        return computeInitialVisibleWindow(pointCount, bucket)
    }
    const c = clampVisibleWindow(s, e, pointCount)
    return c ?? { startIndex: 0, endIndex: last }
}
