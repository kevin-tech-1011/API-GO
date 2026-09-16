import type { THistory, TProfile, TResume } from '../types'

import {
    App,
    Button,
    Checkbox,
    Dropdown,
    Form,
    Input,
    Popconfirm,
    Select,
    Space,
    Table,
    TableProps,
    Tag,
    Tooltip,
    type TablePaginationConfig,
} from 'antd'
import type { ColumnType } from 'antd/es/table'
import FormItem from 'antd/es/form/FormItem'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listHistory, deleteHistory, updateHistory } from '../actions/history'
import { listProfiles } from '../actions/profiles'
import moment from 'moment'
import saveAs from 'file-saver'

import ResumeTemplate from '../components/ResumeTemplate'
import {
    DeleteOutlined,
    DownOutlined,
    DownloadOutlined,
    EyeOutlined,
    LinkOutlined,
} from '@ant-design/icons'
import { pdf } from '@react-pdf/renderer'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../components/AuthContext'
import {
    INTERVIEW_STATUS_OPTIONS,
    INTERVIEW_STATUS_TAG_COLORS,
    isAdminAccessRole,
    USER_ROLES,
} from '../types/constants'
import { useProfileUsers } from '@/components/ProfileUsersContext'
import { copyTextToClipboard } from '../utils/clipboard'
import PageShell from '@/components/PageShell'
import { TABLE_PAGINATION_COMFORT_CLASSNAME } from '@/constants/tablePagination'
import { parseStatusStages } from '../utils/historyStatusStages'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'

const HISTORY_FILTER_ALL = '__all__' as const

const History = () => {
    const { message } = App.useApp()
    const { user } = useAuth()
    const { options: profileUserOptions, isKnownIndex } = useProfileUsers()
    const canViewManagerHistoryFilters = user?.role === USER_ROLES.MANAGER
    const [searchParams, setSearchParams] = useSearchParams()

    const [loading, setLoading] = useState(false)
    const [dataSource, setDataSource] = useState<THistory[]>([])
    const [profiles, setProfiles] = useState<TProfile[]>([])
    const [savingStatusId, setSavingStatusId] = useState<number | null>(null)

    const [pagination, setPagination] = useState<TablePaginationConfig>({
        current: 1,
        pageSize: 15,
        total: 100,
    })

    const cnameParam = searchParams.get('cname') || ''
    const pnameParam = searchParams.get('pname') || ''
    const positionParam = searchParams.get('position') || ''
    const profileUserIndexParam = searchParams.get('profileUserIndex') || ''

    const [cnameInput, setCnameInput] = useState(cnameParam)
    const [pnameInput, setPnameInput] = useState(pnameParam)
    const [positionInput, setPositionInput] = useState(positionParam)
    const [profileUserIndexInput, setProfileUserIndexInput] = useState<
        number | null
    >(() => normalizeProfileUserIndex(profileUserIndexParam))

    useEffect(() => {
        setCnameInput(searchParams.get('cname') || '')
        setPnameInput(searchParams.get('pname') || '')
        setPositionInput(searchParams.get('position') || '')
        setProfileUserIndexInput(
            normalizeProfileUserIndex(searchParams.get('profileUserIndex'))
        )
    }, [searchParams])

    /** Drop a slot that no longer exists (deleted, or a stale bookmarked URL). */
    useEffect(() => {
        if (profileUserIndexInput == null) return
        if (profileUserOptions.length === 0) return
        if (!isKnownIndex(profileUserIndexInput)) setProfileUserIndexInput(null)
    }, [profileUserIndexInput, profileUserOptions, isKnownIndex])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const profiles = await listProfiles()
                if (cancelled) return
                setProfiles(Array.isArray(profiles) ? profiles : [])
            } catch {
                if (!cancelled) setProfiles([])
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const profileNameOptions = useMemo(() => {
        const filteredByUser =
            profileUserIndexInput == null
                ? profiles
                : profiles.filter((p) => p.profileUserIndex === profileUserIndexInput)

        const uniqueNames = Array.from(
            new Set(
                filteredByUser
                    .map((p) => String(p.name ?? '').trim())
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b))

        return [
            { label: 'All', value: HISTORY_FILTER_ALL },
            ...uniqueNames.map((name) => ({ label: name, value: name })),
        ]
    }, [profiles, profileUserIndexInput])

    useEffect(() => {
        if (pnameInput === '') return
        const exists = profileNameOptions.some((o) => o.value === pnameInput)
        if (!exists) setPnameInput('')
    }, [profileNameOptions, pnameInput])

    const getHistoryList = async () => {
        const filters: {
            cname?: string
            pname?: string
            position?: string
            profileUserIndex?: number
        } = {}
        // Use URL as source of truth so results match the debounced `pname` / `cname` / `position` params
        // (avoids a race where this effect runs before local state or inputs sync from `searchParams`).
        const cFromUrl = (searchParams.get('cname') || '').trim()
        const pFromUrl = canViewManagerHistoryFilters
            ? (searchParams.get('pname') || '').trim()
            : ''
        const positionFromUrl = (searchParams.get('position') || '').trim()
        const profileUserIndexFromUrl = canViewManagerHistoryFilters
            ? (searchParams.get('profileUserIndex') || '').trim()
            : ''
        if (cFromUrl) filters.cname = cFromUrl
        if (pFromUrl) filters.pname = pFromUrl
        if (positionFromUrl) filters.position = positionFromUrl
        const profileUserIndexFilter = normalizeProfileUserIndex(
            profileUserIndexFromUrl
        )
        if (profileUserIndexFilter != null) {
            filters.profileUserIndex = profileUserIndexFilter
        }

        setLoading(true)
        try {
            const { count, rows } = await listHistory({
                ...filters,
                current: pagination.current,
                pageSize: pagination.pageSize,
            })
            setDataSource(Array.isArray(rows) ? rows : [])
            setPagination((p) => ({ ...p, total: Number(count) || 0 }))
        } catch {
            message.error('Could not load history')
            setDataSource([])
        } finally {
            setLoading(false)
        }
    }

    const updateFilters = useCallback(
        (
            cname: string,
            pname: string,
            position: string,
            profileUserIndex: number | null
        ) => {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                if (cname.trim()) next.set('cname', cname.trim())
                else next.delete('cname')
                if (pname.trim()) next.set('pname', pname.trim())
                else next.delete('pname')
                if (position.trim()) next.set('position', position.trim())
                else next.delete('position')
                if (profileUserIndex == null) next.delete('profileUserIndex')
                else next.set('profileUserIndex', String(profileUserIndex))
                next.delete('current')
                return next
            })
            setPagination((p) => ({ ...p, current: 1 }))
        },
        [setSearchParams]
    )

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            updateFilters(
                cnameInput,
                canViewManagerHistoryFilters ? pnameInput : '',
                positionInput,
                canViewManagerHistoryFilters ? profileUserIndexInput : null
            )
        }, 400)
        return () => clearTimeout(timeoutId)
    }, [
        cnameInput,
        pnameInput,
        positionInput,
        profileUserIndexInput,
        canViewManagerHistoryFilters,
        updateFilters,
    ])

    useEffect(() => {
        getHistoryList()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, pagination.current, pagination.pageSize])

    const onToggleStatusStage = async (
        record: THistory,
        label: (typeof INTERVIEW_STATUS_OPTIONS)[number],
        checked: boolean
    ) => {
        if (!record.id) return
        const current = parseStatusStages(record)
        const next = checked
            ? [...new Set([...current, label])]
            : current.filter((x) => x !== label)
        setSavingStatusId(record.id)
        try {
            const updated = await updateHistory({
                id: record.id,
                statusStages: next,
            })
            setDataSource((rows) =>
                rows.map((r) =>
                    r.id === record.id ? { ...r, ...updated } : r
                )
            )
        } catch {
            message.error('Could not update status')
        } finally {
            setSavingStatusId(null)
        }
    }

    const onDelete = async (id: number | undefined) => {
        if (!id) return
        try {
            await deleteHistory(id)
            message.success('History deleted successfully')
            getHistoryList()
        } catch {
            message.error('Unable to delete the history')
        }
    }
    const profileDisplayName = (record: THistory) =>
        record.profile?.name ||
        (() => {
            try {
                return (JSON.parse(record.resume) as TResume | null)?.name
            } catch {
                return undefined
            }
        })()

    // const profileUserSlotLabel = (record: THistory) => {
    //     const i = record.profile?.profileUserIndex
    //     if (i == null || ![0, 1, 2].includes(i)) return null
    //     return PROFILE_USER_OPTIONS.find((o) => o.value === i)?.label ?? null
    // }

    const onDownloadResume = async (record: THistory) => {
        let resume: TResume
        try {
            resume = JSON.parse(record.resume) as TResume
        } catch {
            message.error('Resume data is not valid')
            return
        }
        const blob = await pdf(
            <ResumeTemplate
                profile={resume}
                templateId={record.templateId}
                backgroundId={record.backgroundId}
            />
        ).toBlob()
        const fileName = `${profileDisplayName(record) || 'resume'}_${record.company || 'company'}.pdf`
        saveAs(blob, fileName)
    }

    const isLink = (link: string) => {
        return link.startsWith('http://') || link.startsWith('https://')
    }

    const columns: TableProps<THistory>['columns'] = [
        {
            title: 'No',
            key: 'id',
            width: 56,
            render: (_: any, record: THistory) => (
                <span>
                    {((pagination.current || 1) - 1) * (pagination.pageSize || 15) +
                        dataSource.indexOf(record) +
                        1}
                </span>
            ),
        },
        {
            title: 'Profile',
            key: 'profileName',
            ellipsis: true,
            render: (_: any, record: THistory) => {
                const n = profileDisplayName(record)
                return (
                    <span
                        className={n ? undefined : 'text-slate-400'}
                    >
                        {n || '—'}
                    </span>
                )
            },
        },
        // {
        //     title: 'Profile user',
        //     key: 'profileUserSlot',
        //     width: 112,
        //     responsive: ['md'],
        //     render: (_: unknown, record: THistory) => {
        //         const L = profileUserSlotLabel(record)
        //         return (
        //             <span
        //                 className={L ? undefined : 'text-slate-400'}
        //                 title={
        //                     L == null
        //                         ? 'No Lemon slot on this profile'
        //                         : undefined
        //                 }
        //             >
        //                 {L ?? 'Unassigned'}
        //             </span>
        //         )
        //     },
        // },
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
        ...(user?.role === USER_ROLES.MANAGER
            ? [
                  {
                      title: 'Status',
                      key: 'statusStages',
                      width: 280,
                      render: (_: unknown, record: THistory) => {
                          const ordered = INTERVIEW_STATUS_OPTIONS.filter(
                              (label) =>
                                  parseStatusStages(record).includes(label)
                          )
                          const busy = savingStatusId === record.id
                          return (
                              <div className="flex flex-col items-center gap-2">
                                  <div className="flex min-h-[22px] flex-wrap justify-center gap-1">
                                      {ordered.length === 0 ? (
                                          <span className="text-slate-400">
                                              —
                                          </span>
                                      ) : (
                                          ordered.map((label) => (
                                              <Tag
                                                  key={label}
                                                  color={
                                                      INTERVIEW_STATUS_TAG_COLORS[
                                                          label
                                                      ]
                                                  }
                                                  className="m-0 max-w-full truncate"
                                              >
                                                  {label}
                                              </Tag>
                                          ))
                                      )}
                                  </div>
                                  <Dropdown
                                      trigger={['click']}
                                      disabled={busy}
                                      popupRender={() => (
                                          <div
                                              className="history-status-popup min-w-[min(100%,16rem)] max-w-[min(100vw-2rem,20rem)] rounded-xl border border-sky-200/80 bg-white/95 p-[clamp(0.65rem,2vw,0.85rem)] shadow-lg shadow-sky-900/10 backdrop-blur-sm"
                                              onMouseDown={(e) =>
                                                  e.preventDefault()
                                              }
                                          >
                                              <Space
                                                  direction="vertical"
                                                  size="small"
                                                  className="w-full"
                                              >
                                                  {INTERVIEW_STATUS_OPTIONS.map(
                                                      (label) => (
                                                          <Checkbox
                                                              key={label}
                                                              checked={parseStatusStages(
                                                                  record
                                                              ).includes(
                                                                  label
                                                              )}
                                                              disabled={busy}
                                                              onChange={(e) =>
                                                                  onToggleStatusStage(
                                                                      record,
                                                                      label,
                                                                      e.target
                                                                          .checked
                                                                  )
                                                              }
                                                          >
                                                              {label}
                                                          </Checkbox>
                                                      )
                                                  )}
                                              </Space>
                                          </div>
                                      )}
                                  >
                                      <Button
                                          size="small"
                                          loading={busy}
                                          icon={<DownOutlined />}
                                          className="self-center"
                                      >
                                          Applied
                                      </Button>
                                  </Dropdown>
                              </div>
                          )
                      },
                  } as ColumnType<THistory>,
              ]
            : []),
        {
            title: 'Edited',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 140,
            render: (_: any, record: THistory) => (
                <span className="whitespace-nowrap text-slate-600">
                    {moment(record.createdAt).format('YYYY-MM-DD HH:mm')}
                </span>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 168,
            render: (_: any, record: THistory) => (
                <div className="flex flex-row flex-wrap justify-center gap-1">
                    <Tooltip title="View job description">
                        <Popconfirm
                            title={`View Job Description for ${record.company} - ${record.position}`}
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
                                                    record.requirements || ''
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
                                        {record.requirements ||
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
                            <Button icon={<EyeOutlined />} type="primary" ghost size="small" />
                        </Popconfirm>
                    </Tooltip>
                    <Tooltip title="Download resume">
                        <Button
                            icon={<DownloadOutlined />}
                            type="primary"
                            ghost
                            size="small"
                            onClick={() => onDownloadResume(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Open job link">
                        <Button
                            icon={<LinkOutlined />}
                            type="primary"
                            ghost
                            size="small"
                            href={record.link}
                            target="_blank"
                            rel="noreferrer"
                            disabled={!isLink(record.link)}
                        />
                    </Tooltip>
                    {isAdminAccessRole(user?.role) && (
                        <Tooltip title="Delete">
                            <Popconfirm
                                title={`Delete ${record.company} - ${record.position}`}
                                description="Are you sure you want to delete this history?"
                                onConfirm={() => onDelete(record.id)}
                            >
                                <Button
                                    icon={<DeleteOutlined />}
                                    color="danger"
                                    variant="outlined"
                                    size="small"
                                />
                            </Popconfirm>
                        </Tooltip>
                    )}
                </div>
            ),
        },
    ]

    return (
        <PageShell
            title="History"
        >
            <div className="panel-elevated panel-elevated--table min-w-0">
                <div className="history-filter-strip">
                    <Form
                        layout="vertical"
                        requiredMark={false}
                        className="mb-0 [&_.ant-form-item]:mb-0"
                    >
                        <div className="grid grid-cols-1 gap-[clamp(0.75rem,2vw,1.25rem)] px-[clamp(0.65rem,1.5vw,1rem)] py-[clamp(0.65rem,1.5vw,0.85rem)] sm:grid-cols-2 xl:grid-cols-4">
                            {canViewManagerHistoryFilters && (
                                <FormItem label="Profile user" className="mb-0">
                                    <Select<number | typeof HISTORY_FILTER_ALL>
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="Filter by profile user"
                                        value={
                                            profileUserIndexInput ??
                                            HISTORY_FILTER_ALL
                                        }
                                        onChange={(value) =>
                                            setProfileUserIndexInput(
                                                value == null ||
                                                    value === HISTORY_FILTER_ALL
                                                    ? null
                                                    : Number(value)
                                            )
                                        }
                                        options={[
                                            {
                                                label: 'All',
                                                value: HISTORY_FILTER_ALL,
                                            },
                                            ...profileUserOptions,
                                        ]}
                                        className="profiles-filter-select w-full min-w-0 [&_.ant-select-selector]:!rounded-lg"
                                    />
                                </FormItem>
                            )}
                            {canViewManagerHistoryFilters && (
                                <FormItem label="Profile name" className="mb-0">
                                    <Select<string>
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="Filter by profile name"
                                        value={pnameInput || HISTORY_FILTER_ALL}
                                        onChange={(value) =>
                                            setPnameInput(
                                                value == null ||
                                                    value === HISTORY_FILTER_ALL
                                                    ? ''
                                                    : value
                                            )
                                        }
                                        options={profileNameOptions}
                                        className="profiles-filter-select w-full min-w-0 [&_.ant-select-selector]:!rounded-lg"
                                    />
                                </FormItem>
                            )}
                            <FormItem label="Company name" className="mb-0">
                                <Input
                                    allowClear
                                    placeholder="Filter by company name"
                                    value={cnameInput}
                                    onChange={(e) => setCnameInput(e.target.value)}
                                    className="profiles-filter-input !rounded-lg"
                                />
                            </FormItem>
                            <FormItem label="Position" className="mb-0">
                                <Input
                                    allowClear
                                    placeholder="Filter by position"
                                    value={positionInput}
                                    onChange={(e) =>
                                        setPositionInput(e.target.value)
                                    }
                                    className="profiles-filter-input !rounded-lg"
                                />
                            </FormItem>
                        </div>
                    </Form>
                </div>
                <div className="app-table-responsive">
                    <Table
                        size="small"
                        columns={columns}
                        dataSource={dataSource}
                        className="app-data-table profiles-table-flat-top min-w-[min(640px,max(100%,18rem))]"
                        rowKey="id"
                        loading={loading}
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

export default History
