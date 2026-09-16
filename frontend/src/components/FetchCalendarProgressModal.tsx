import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from 'antd'
import {
    CalendarOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    CloudSyncOutlined,
    LoadingOutlined,
    WarningFilled,
} from '@ant-design/icons'
import { useThemeMode } from '@/components/ThemeContext'

export type FetchCalendarProfileRow = {
    id: number
    name: string
    status: 'pending' | 'active' | 'success' | 'warning' | 'error'
    detail?: string
}

export type FetchCalendarModalPhase = 'fetching' | 'refreshing' | 'complete'

export type FetchCalendarProgressSnapshot = {
    open: boolean
    phase: FetchCalendarModalPhase
    profiles: FetchCalendarProfileRow[]
    totals: {
        success: number
        failed: number
        warnings: number
        events: number
        scheduleRows: number
    }
}

export type FetchCalendarProgressModalProps = {
    snapshot: FetchCalendarProgressSnapshot
    onClose: () => void
}

function statusIcon(status: FetchCalendarProfileRow['status']): JSX.Element {
    switch (status) {
        case 'active':
            return (
                <LoadingOutlined
                    spin
                    className="text-base text-sky-500"
                    aria-hidden
                />
            )
        case 'success':
            return (
                <CheckCircleFilled
                    className="text-base text-emerald-500"
                    aria-hidden
                />
            )
        case 'warning':
            return (
                <WarningFilled className="text-base text-amber-500" aria-hidden />
            )
        case 'error':
            return (
                <CloseCircleFilled className="text-base text-rose-500" aria-hidden />
            )
        default:
            return (
                <span
                    className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300/90 ring-2 ring-slate-200/80"
                    aria-hidden
                />
            )
    }
}

const PROFILE_SLOT_H = 44
const PROFILE_SLOT_GAP = 6
const PROFILE_SLOT_STEP = PROFILE_SLOT_H + PROFILE_SLOT_GAP
const PROFILE_CAROUSEL_H =
    PROFILE_SLOT_H * 3 + PROFILE_SLOT_GAP * 2

type ProfileSlotVariant = 'prev' | 'current' | 'next'

type ProfileCarouselFrame = {
    centerIdx: number
    prev: FetchCalendarProfileRow | null
    current: FetchCalendarProfileRow | null
    next: FetchCalendarProfileRow | null
}

function resolveCenterIdx(
    profiles: FetchCalendarProfileRow[],
    phase: FetchCalendarModalPhase
): number {
    if (profiles.length === 0) return 0
    if (phase === 'refreshing') return profiles.length - 1

    const activeIdx = profiles.findIndex((p) => p.status === 'active')
    if (activeIdx >= 0) return activeIdx

    const firstPending = profiles.findIndex((p) => p.status === 'pending')
    if (firstPending >= 0) return firstPending

    return profiles.length - 1
}

function frameAt(
    profiles: FetchCalendarProfileRow[],
    centerIdx: number
): ProfileCarouselFrame {
    const clamped = Math.max(0, Math.min(centerIdx, profiles.length - 1))
    return {
        centerIdx: clamped,
        prev: clamped > 0 ? profiles[clamped - 1] : null,
        current: profiles[clamped] ?? null,
        next: clamped < profiles.length - 1 ? profiles[clamped + 1] : null,
    }
}

function ProfileProgressRow({
    row,
    variant,
    isDark,
}: {
    row: FetchCalendarProfileRow
    variant: ProfileSlotVariant
    isDark: boolean
}): JSX.Element {
    const isCurrent = variant === 'current'

    return (
        <div
            role="listitem"
            className={`flex h-11 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-[opacity,background-color,box-shadow] duration-300 ${
                isCurrent
                    ? isDark
                        ? 'bg-sky-950/50 opacity-100 ring-1 ring-sky-500/30'
                        : 'bg-sky-50 opacity-100 ring-1 ring-sky-200/80'
                    : isDark
                      ? 'opacity-40'
                      : 'opacity-45'
            }`}
        >
            <span className="flex w-5 shrink-0 justify-center">
                {statusIcon(row.status)}
            </span>
            <span
                className={`min-w-0 flex-1 truncate font-medium ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                }`}
            >
                {row.name}
            </span>
            {row.detail != null && row.detail !== '' && (
                <span
                    className={`max-w-[42%] truncate text-xs ${
                        row.status === 'error'
                            ? 'text-rose-500'
                            : row.status === 'warning'
                              ? 'text-amber-600'
                              : isDark
                                ? 'text-slate-500'
                                : 'text-slate-500'
                    }`}
                    title={row.detail}
                >
                    {row.detail}
                </span>
            )}
        </div>
    )
}

function FetchingProfileCarousel({
    profiles,
    phase,
    isDark,
}: {
    profiles: FetchCalendarProfileRow[]
    phase: FetchCalendarModalPhase
    isDark: boolean
}): JSX.Element {
    const centerIdx = useMemo(
        () => resolveCenterIdx(profiles, phase),
        [profiles, phase]
    )

    const [frame, setFrame] = useState<ProfileCarouselFrame>(() =>
        frameAt(profiles, centerIdx)
    )
    const [slideUp, setSlideUp] = useState(false)
    const lastCenterRef = useRef(centerIdx)
    const animatingRef = useRef(false)
    const profilesRef = useRef(profiles)
    profilesRef.current = profiles

    useEffect(() => {
        if (animatingRef.current) return

        const prevCenter = lastCenterRef.current
        if (centerIdx > prevCenter && phase === 'fetching') {
            animatingRef.current = true
            setSlideUp(true)
            const timer = window.setTimeout(() => {
                setFrame(frameAt(profilesRef.current, centerIdx))
                setSlideUp(false)
                lastCenterRef.current = centerIdx
                animatingRef.current = false
            }, 300)
            return () => {
                window.clearTimeout(timer)
                animatingRef.current = false
                setSlideUp(false)
            }
        }

        lastCenterRef.current = centerIdx
        setFrame(frameAt(profiles, centerIdx))
    }, [centerIdx, phase, profiles])

    const slots: [
        FetchCalendarProfileRow | null,
        FetchCalendarProfileRow | null,
        FetchCalendarProfileRow | null,
    ] = [frame.prev, frame.current, frame.next]

    const slotVariants: ProfileSlotVariant[] = ['prev', 'current', 'next']

    return (
        <div
            role="list"
            className={`overflow-hidden rounded-xl border p-2.5 ${
                isDark
                    ? 'border-slate-700/80 bg-slate-950/40'
                    : 'border-slate-200/90 bg-white/70'
            }`}
            style={{ height: PROFILE_CAROUSEL_H + 20 }}
            aria-label="Profile sync progress"
        >
            <div
                className="flex flex-col gap-1.5"
                style={{
                    transform: slideUp
                        ? `translateY(-${PROFILE_SLOT_STEP}px)`
                        : 'translateY(0)',
                    transition: slideUp
                        ? 'transform 300ms ease-out'
                        : 'none',
                }}
            >
                {slots.map((row, slotIdx) =>
                    row != null ? (
                        <ProfileProgressRow
                            key={row.id}
                            row={row}
                            variant={slotVariants[slotIdx]}
                            isDark={isDark}
                        />
                    ) : (
                        <div
                            key={`empty-${slotIdx}`}
                            className="h-11 shrink-0"
                            aria-hidden
                        />
                    )
                )}
            </div>
        </div>
    )
}

function PleaseWaitIllustration({ isDark }: { isDark: boolean }): JSX.Element {
    const stroke = isDark ? '#64748b' : '#94a3b8'
    const accent = isDark ? '#38bdf8' : '#0ea5e9'
    const accentSoft = isDark ? '#6366f1' : '#818cf8'

    return (
        <div
            className="fetch-cal-please-wait-art mb-5 flex flex-col items-center"
            aria-hidden
        >
            <svg
                width="120"
                height="88"
                viewBox="0 0 120 88"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-sm"
            >
                <circle
                    cx="60"
                    cy="44"
                    r="34"
                    className="fetch-cal-please-wait-orbit"
                    stroke={isDark ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.2)'}
                    strokeWidth="1.5"
                    strokeDasharray="6 10"
                />
                <circle
                    cx="60"
                    cy="44"
                    r="24"
                    stroke={isDark ? 'rgba(99,102,241,0.22)' : 'rgba(129,140,248,0.25)'}
                    strokeWidth="1"
                    strokeDasharray="4 8"
                    className="fetch-cal-please-wait-orbit"
                    style={{
                        animationDirection: 'reverse',
                        animationDuration: '6.5s',
                    }}
                />
                <rect
                    x="34"
                    y="22"
                    width="52"
                    height="44"
                    rx="10"
                    fill={isDark ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.95)'}
                    stroke={stroke}
                    strokeWidth="1.2"
                />
                <rect
                    x="34"
                    y="22"
                    width="52"
                    height="12"
                    rx="10"
                    fill={`url(#fetch-cal-wait-header-${isDark ? 'd' : 'l'})`}
                />
                <rect x="42" y="42" width="18" height="4" rx="2" fill={accent} opacity="0.85" />
                <rect
                    x="42"
                    y="50"
                    width="36"
                    height="3"
                    rx="1.5"
                    fill={stroke}
                    opacity="0.45"
                />
                <rect
                    x="42"
                    y="57"
                    width="28"
                    height="3"
                    rx="1.5"
                    fill={stroke}
                    opacity="0.3"
                />
                <circle cx="72" cy="52" r="7" fill={accentSoft} opacity="0.35" />
                <path
                    d="M69 52 L71.5 54.5 L76 49"
                    stroke={accent}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <defs>
                    <linearGradient
                        id={`fetch-cal-wait-header-${isDark ? 'd' : 'l'}`}
                        x1="34"
                        y1="22"
                        x2="86"
                        y2="34"
                        gradientUnits="userSpaceOnUse"
                    >
                        <stop stopColor={accent} />
                        <stop offset="1" stopColor={accentSoft} />
                    </linearGradient>
                </defs>
            </svg>
            <p
                className={`fetch-cal-please-wait-label m-0 mt-3 text-[11px] font-semibold uppercase tracking-[0.28em] ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
            >
                Please wait
            </p>
            <p
                className={`m-0 mt-1.5 max-w-[16rem] text-center text-xs leading-relaxed ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
            >
                Syncing calendars — this may take a moment
            </p>
        </div>
    )
}

function AnimatedFetchProgress({
    percent,
    isDark,
}: {
    percent: number
    isDark: boolean
}): JSX.Element {
    const clamped = Math.max(0, Math.min(100, percent))

    return (
        <div
            className="fetch-cal-animated-progress !mb-1"
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Calendar fetch progress"
        >
            <div
                className={`fetch-cal-animated-progress__track ${
                    isDark ? 'fetch-cal-animated-progress__track--dark' : ''
                }`}
            >
                <div
                    className="fetch-cal-animated-progress__fill"
                    style={{ width: `${clamped}%` }}
                />
            </div>
        </div>
    )
}

function CompletionCheckReveal({
    isDark,
    onFinished,
}: {
    isDark: boolean
    onFinished: () => void
}): JSX.Element {
    const [phase, setPhase] = useState<'in' | 'out'>('in')
    const finishedRef = useRef(false)

    useEffect(() => {
        finishedRef.current = false
        setPhase('in')
        const outTimer = window.setTimeout(() => setPhase('out'), 1200)
        const doneTimer = window.setTimeout(() => {
            if (!finishedRef.current) {
                finishedRef.current = true
                onFinished()
            }
        }, 1200 + 1350)
        return () => {
            window.clearTimeout(outTimer)
            window.clearTimeout(doneTimer)
        }
    }, [onFinished])

    const animClass =
        phase === 'in' ? 'fetch-cal-check-in' : 'fetch-cal-check-out'

    return (
        <div
            className="relative flex min-h-[min(280px,42vh)] flex-col items-center justify-center py-10"
            role="status"
            aria-live="polite"
            aria-label="Calendar sync completed"
        >
            <div
                className={`flex flex-col items-center gap-3 ${animClass}`}
            >
                <div
                    className={`flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-xl ring-4 ${
                        isDark
                            ? 'shadow-emerald-900/40 ring-emerald-400/25'
                            : 'shadow-emerald-500/35 ring-emerald-400/20'
                    }`}
                >
                    <CheckCircleFilled
                        className="text-[3rem] text-white"
                        aria-hidden
                    />
                </div>
                <p
                    className={`fetch-cal-completed-label m-0 text-lg font-semibold tracking-wide ${
                        isDark ? 'text-emerald-300' : 'text-emerald-600'
                    }`}
                >
                    Completed
                </p>
            </div>
        </div>
    )
}

const MODAL_EXIT_MS = 850

export const FetchCalendarProgressModal = ({
    snapshot,
    onClose,
}: FetchCalendarProgressModalProps): JSX.Element | null => {
    const { isDark } = useThemeMode()
    const { open, phase, profiles, totals } = snapshot
    const [modalExiting, setModalExiting] = useState(false)
    const exitTimerRef = useRef<number | null>(null)

    useEffect(() => {
        if (open) setModalExiting(false)
    }, [open])

    useEffect(() => {
        return () => {
            if (exitTimerRef.current != null) {
                window.clearTimeout(exitTimerRef.current)
            }
        }
    }, [])

    const totalProfiles = profiles.length
    const doneProfiles = profiles.filter(
        (p) =>
            p.status === 'success' ||
            p.status === 'warning' ||
            p.status === 'error'
    ).length
    const activeProfile = profiles.find((p) => p.status === 'active')

    const percent = useMemo(() => {
        if (phase === 'complete') return 100
        if (phase === 'refreshing') return 96
        if (totalProfiles === 0) return 8
        const fetchSlice = 88
        const base = 6
        return Math.min(
            94,
            Math.round(base + (doneProfiles / totalProfiles) * fetchSlice)
        )
    }, [doneProfiles, phase, totalProfiles])

    const phaseLabel = useMemo(() => {
        if (phase === 'complete') return 'All steps complete'
        if (phase === 'refreshing') return 'Refreshing calendar & schedule views…'
        if (activeProfile) {
            return `Syncing ${activeProfile.name}…`
        }
        return 'Preparing calendar sync…'
    }, [activeProfile, phase])

    const complete = phase === 'complete'
    const busy = phase === 'fetching' || phase === 'refreshing'
    const modalLocked = busy || complete || modalExiting

    const handleCheckFinished = useCallback(() => {
        setModalExiting(true)
        if (exitTimerRef.current != null) {
            window.clearTimeout(exitTimerRef.current)
        }
        exitTimerRef.current = window.setTimeout(() => {
            exitTimerRef.current = null
            onClose()
            setModalExiting(false)
        }, MODAL_EXIT_MS)
    }, [onClose])

    if (!open) return null

    const shell = isDark
        ? 'border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950'
        : 'border border-sky-100/90 bg-gradient-to-br from-white via-sky-50/40 to-indigo-50/30'

    return (
        <Modal
            open={open}
            title={null}
            footer={null}
            closable={!modalLocked}
            maskClosable={!modalLocked}
            keyboard={!modalLocked}
            centered
            width={520}
            destroyOnClose
            onCancel={modalLocked ? undefined : onClose}
            className="fetch-calendar-progress-modal"
            rootClassName={
                modalExiting ? 'fetch-cal-progress-modal-exit' : undefined
            }
            styles={{
                body: { padding: 0 },
                content: {
                    padding: 0,
                    overflow: 'hidden',
                    borderRadius: 20,
                    boxShadow: isDark
                        ? '0 24px 80px rgba(0,0,0,0.55)'
                        : '0 24px 64px rgba(14,116,214,0.18), 0 8px 24px rgba(15,23,42,0.08)',
                },
            }}
        >
            <div
                className={`relative overflow-hidden px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-8 ${shell}`}
            >
                <div
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-sky-400/25 to-indigo-500/10 blur-3xl"
                    aria-hidden
                />
                <div
                    className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-gradient-to-tr from-violet-400/15 to-sky-300/10 blur-3xl"
                    aria-hidden
                />

                {complete ? (
                    <CompletionCheckReveal
                        isDark={isDark}
                        onFinished={handleCheckFinished}
                    />
                ) : (
                    <div className="relative">
                        <PleaseWaitIllustration isDark={isDark} />

                        <div className="mb-5 flex items-start gap-3">
                            <span
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-600/30 ${
                                    busy ? 'animate-pulse' : ''
                                }`}
                            >
                                {phase === 'refreshing' ? (
                                    <CloudSyncOutlined className="text-lg" />
                                ) : (
                                    <CalendarOutlined className="text-lg" />
                                )}
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <h2
                                    className={`m-0 text-lg font-semibold tracking-tight ${
                                        isDark ? 'text-white' : 'text-slate-900'
                                    }`}
                                >
                                    Fetching calendar data
                                </h2>
                                <p
                                    className={`m-0 mt-1 text-sm ${
                                        isDark ? 'text-slate-400' : 'text-slate-600'
                                    }`}
                                >
                                    {phaseLabel}
                                </p>
                            </div>
                        </div>

                        <AnimatedFetchProgress
                            percent={percent}
                            isDark={isDark}
                        />
                        <div
                            className={`mb-4 flex justify-between text-[11px] font-medium uppercase tracking-wide ${
                                isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                        >
                            <span>Step {phase === 'refreshing' ? 3 : 2} of 3</span>
                            <span>{percent}%</span>
                        </div>

                        <FetchingProfileCarousel
                            profiles={profiles}
                            phase={phase}
                            isDark={isDark}
                        />

                        <div
                            className={`mt-4 flex flex-wrap gap-3 text-xs ${
                                isDark ? 'text-slate-500' : 'text-slate-500'
                            }`}
                        >
                            <span>
                                <strong
                                    className={
                                        isDark ? 'text-slate-300' : 'text-slate-700'
                                    }
                                >
                                    {doneProfiles}
                                </strong>
                                /{totalProfiles} profiles
                            </span>
                            {totals.events > 0 && (
                                <span>
                                    <strong
                                        className={
                                            isDark ? 'text-slate-300' : 'text-slate-700'
                                        }
                                    >
                                        {totals.events}
                                    </strong>{' '}
                                    events
                                </span>
                            )}
                            {totals.scheduleRows > 0 && (
                                <span>
                                    <strong
                                        className={
                                            isDark ? 'text-slate-300' : 'text-slate-700'
                                        }
                                    >
                                        {totals.scheduleRows}
                                    </strong>{' '}
                                    schedule rows
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    )
}
