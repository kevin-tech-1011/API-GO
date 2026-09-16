import {
    App,
    Button,
    Form,
    Input,
    Popconfirm,
    Popover,
    Select,
    Switch,
    Table,
    TableProps,
    Tooltip,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TProfile } from '../types'
import { deleteProfile, listProfiles, updateProfile } from '../actions/profiles'
import {
    CalendarOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    SolutionOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../components/AuthContext'
import { isAdminAccessRole, USER_ROLES } from '../types/constants'
import PageShell from '@/components/PageShell'
import { TABLE_PAGINATION_COMFORT_CLASSNAME } from '@/constants/tablePagination'
import { useThemeMode } from '@/components/ThemeContext'
import { useProfileUsers } from '@/components/ProfileUsersContext'
import ProfileUserSelect, {
    PROFILE_USER_NONE as PROFILE_USER_INDEX_NONE,
} from '@/components/ProfileUserSelect'

/** Profile owner filter — first option in Select (“All”). */
const PROFILE_OWNER_FILTER_ALL = '__all_owners__' as const

type ProfileOwnerFilterValue = typeof PROFILE_OWNER_FILTER_ALL | string
const PROFILE_NAME_FILTER_ALL = '__all_names__' as const
type ProfileNameFilterValue = typeof PROFILE_NAME_FILTER_ALL | string

const PROFILE_USER_FILTER_ALL = 'all' as const

type ProfileUserFilterValue =
    | typeof PROFILE_USER_FILTER_ALL
    | typeof PROFILE_USER_INDEX_NONE
    | number

type ProfileCalendarUrlButtonProps = {
    doc: TProfile
    onSaved: () => void
}

/** Manager-only: hover Tooltip + click Popover (Ant pattern for interactive overlays in tables). */
const ProfileCalendarUrlButton = ({
    doc,
    onSaved,
}: ProfileCalendarUrlButtonProps) => {
    const { message } = App.useApp()
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form] = Form.useForm<{ calendarUrl: string }>()

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        if (next) {
            const existing =
                doc.calendarUrl != null &&
                String(doc.calendarUrl).trim() !== ''
                    ? String(doc.calendarUrl).trim()
                    : ''
            form.setFieldsValue({ calendarUrl: existing })
        } else {
            form.resetFields()
        }
    }

    const save = async () => {
        if (!doc.id) return
        try {
            const { calendarUrl } = await form.validateFields()
            const trimmed =
                typeof calendarUrl === 'string' ? calendarUrl.trim() : ''
            setSaving(true)
            await updateProfile({
                ...doc,
                calendarUrl: trimmed === '' ? null : trimmed,
            })
            message.success(
                trimmed === ''
                    ? 'Calendar URL cleared'
                    : 'Calendar URL saved'
            )
            setOpen(false)
            form.resetFields()
            onSaved()
        } catch (err: unknown) {
            if (
                err &&
                typeof err === 'object' &&
                'errorFields' in err &&
                Array.isArray((err as { errorFields?: unknown }).errorFields)
            ) {
                return
            }
            message.error('Unable to save calendar URL')
        } finally {
            setSaving(false)
        }
    }

    const popoverContent = (
        <div className="w-[min(100vw-2rem,20rem)] pt-0.5">
            <p className="mb-3 text-xs leading-relaxed text-slate-600">
                Add or edit the calendar URL stored on this profile in the
                database. Save writes the value; leave the field empty and save
                to clear it.
            </p>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item
                    name="calendarUrl"
                    label="Calendar URL"
                    className="!mb-3"
                    rules={[
                        {
                            validator: async (_, value) => {
                                const s =
                                    typeof value === 'string'
                                        ? value.trim()
                                        : ''
                                if (s === '') return
                                try {
                                    void new URL(s)
                                } catch {
                                    throw new Error(
                                        'Enter a valid URL (e.g. https://…)'
                                    )
                                }
                            },
                        },
                    ]}
                >
                    <Input
                        allowClear
                        placeholder="https://calendar.google.com/…"
                        autoComplete="off"
                    />
                </Form.Item>
            </Form>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
                <Button
                    size="small"
                    onClick={() => handleOpenChange(false)}
                    disabled={saving}
                >
                    Cancel
                </Button>
                <Button
                    type="primary"
                    size="small"
                    loading={saving}
                    onClick={() => void save()}
                >
                    Save
                </Button>
            </div>
        </div>
    )

    return (
        <Popover
            trigger="click"
            placement="leftTop"
            title="Calendar URL"
            open={open}
            onOpenChange={handleOpenChange}
            content={popoverContent}
            getPopupContainer={() => document.body}
        >
            <Tooltip
                title="Calendar URL"
                mouseEnterDelay={0.35}
            >
                <Button
                    icon={<CalendarOutlined />}
                    color="primary"
                    variant="outlined"
                    size="small"
                    aria-haspopup="true"
                    aria-expanded={open}
                    aria-label="Add or edit calendar URL"
                />
            </Tooltip>
        </Popover>
    )
}

const Home = () => {
    const { message } = App.useApp()
    const { isDark } = useThemeMode()
    const navigate = useNavigate()
    const [profiles, setProfiles] = useState<TProfile[]>([])
    const [loading, setLoading] = useState<boolean>(false)
    const [filterLocation, setFilterLocation] = useState('')
    const [filterOwner, setFilterOwner] = useState<ProfileOwnerFilterValue>(
        PROFILE_OWNER_FILTER_ALL
    )
    const [filterProfileUser, setFilterProfileUser] =
        useState<ProfileUserFilterValue>(PROFILE_USER_FILTER_ALL)
    const [filterProfileName, setFilterProfileName] =
        useState<ProfileNameFilterValue>(PROFILE_NAME_FILTER_ALL)

    const { user } = useAuth()
    const { options: profileUserOptions, isKnownIndex } = useProfileUsers()

    const getProfileList = useCallback(async () => {
        setLoading(true)
        try {
            const resp = await listProfiles()
            setProfiles(Array.isArray(resp) ? resp : [])
        } catch {
            message.error('Unable to load profiles. Please refresh or try again.')
            setProfiles([])
        } finally {
            setLoading(false)
        }
    }, [message])

    useEffect(() => {
        getProfileList()
    }, [getProfileList])

    const profileOwnerSelectOptions = useMemo(() => {
        const locQ = filterLocation.trim().toLowerCase()
        const emails = new Set<string>()
        for (const p of profiles) {
            if (
                filterProfileName !== PROFILE_NAME_FILTER_ALL &&
                String(p.name ?? '').trim() !== String(filterProfileName).trim()
            ) {
                continue
            }
            if (filterProfileUser !== PROFILE_USER_FILTER_ALL) {
                const idx = p.profileUserIndex
                if (filterProfileUser === PROFILE_USER_INDEX_NONE) {
                    if (idx !== null && idx !== undefined) continue
                } else if (idx !== filterProfileUser) {
                    continue
                }
            }
            if (
                locQ !== '' &&
                !String(p.location ?? '').trim().toLowerCase().includes(locQ)
            ) {
                continue
            }
            const e = p.user?.email?.trim()
            if (e) emails.add(e)
        }
        const sorted = [...emails].sort((a, b) => a.localeCompare(b))
        return [
            { label: 'All', value: PROFILE_OWNER_FILTER_ALL },
            ...sorted.map((email) => ({ label: email, value: email })),
        ]
    }, [profiles, filterProfileName, filterProfileUser, filterLocation])

    const profileNameSelectOptions = useMemo(() => {
        const locQ = filterLocation.trim().toLowerCase()
        const names = new Set<string>()
        for (const p of profiles) {
            if (filterOwner !== PROFILE_OWNER_FILTER_ALL) {
                const em = String(p.user?.email ?? '').trim().toLowerCase()
                const ownerNeedle = String(filterOwner).trim().toLowerCase()
                if (em !== ownerNeedle) continue
            }
            if (filterProfileUser !== PROFILE_USER_FILTER_ALL) {
                const idx = p.profileUserIndex
                if (filterProfileUser === PROFILE_USER_INDEX_NONE) {
                    if (idx !== null && idx !== undefined) continue
                } else if (idx !== filterProfileUser) {
                    continue
                }
            }
            if (
                locQ !== '' &&
                !String(p.location ?? '').trim().toLowerCase().includes(locQ)
            ) {
                continue
            }
            const n = String(p.name ?? '').trim()
            if (n) names.add(n)
        }
        const sorted = [...names].sort((a, b) => a.localeCompare(b))
        return [
            { label: 'All', value: PROFILE_NAME_FILTER_ALL },
            ...sorted.map((name) => ({ label: name, value: name })),
        ]
    }, [profiles, filterOwner, filterProfileUser, filterLocation])

    const profileUserSearchSelectOptions = useMemo(() => {
        const locQ = filterLocation.trim().toLowerCase()
        let hasNone = false
        const idxSet = new Set<number>()
        for (const p of profiles) {
            if (filterOwner !== PROFILE_OWNER_FILTER_ALL) {
                const em = String(p.user?.email ?? '').trim().toLowerCase()
                const ownerNeedle = String(filterOwner).trim().toLowerCase()
                if (em !== ownerNeedle) continue
            }
            if (
                filterProfileName !== PROFILE_NAME_FILTER_ALL &&
                String(p.name ?? '').trim() !== String(filterProfileName).trim()
            ) {
                continue
            }
            if (
                locQ !== '' &&
                !String(p.location ?? '').trim().toLowerCase().includes(locQ)
            ) {
                continue
            }
            const idx = p.profileUserIndex
            if (idx === null || idx === undefined) {
                hasNone = true
            } else if (isKnownIndex(idx)) {
                idxSet.add(idx)
            }
        }
        const dynamicUserOptions = profileUserOptions.filter((o) =>
            idxSet.has(o.value)
        )
        return [
            { label: 'All', value: PROFILE_USER_FILTER_ALL },
            ...(hasNone
                ? [{ label: 'None', value: PROFILE_USER_INDEX_NONE }]
                : []),
            ...dynamicUserOptions,
        ]
    }, [
        profiles,
        filterOwner,
        filterProfileName,
        filterLocation,
        profileUserOptions,
        isKnownIndex,
    ])

    const filteredProfiles = useMemo(() => {
        const locQ = filterLocation.trim().toLowerCase()
        const ownerNeedle =
            filterOwner === PROFILE_OWNER_FILTER_ALL
                ? null
                : String(filterOwner).trim().toLowerCase()
        return profiles.filter((p) => {
            if (
                filterProfileName !== PROFILE_NAME_FILTER_ALL &&
                String(p.name ?? '').trim() !== String(filterProfileName).trim()
            ) {
                return false
            }
            if (
                locQ !== '' &&
                !(String(p.location ?? '')
                    .trim()
                    .toLowerCase()
                    .includes(locQ))
            ) {
                return false
            }
            if (ownerNeedle != null && ownerNeedle !== '') {
                const em = String(p.user?.email ?? '')
                    .trim()
                    .toLowerCase()
                if (em !== ownerNeedle) return false
            }
            if (filterProfileUser !== PROFILE_USER_FILTER_ALL) {
                const idx = p.profileUserIndex
                if (filterProfileUser === PROFILE_USER_INDEX_NONE) {
                    if (idx !== null && idx !== undefined) return false
                } else if (idx !== filterProfileUser) {
                    return false
                }
            }
            return true
        })
    }, [
        profiles,
        filterProfileName,
        filterLocation,
        filterOwner,
        filterProfileUser,
    ])

    useEffect(() => {
        if (filterOwner === PROFILE_OWNER_FILTER_ALL) return
        const exists = profileOwnerSelectOptions.some(
            (o) => o.value === filterOwner
        )
        if (!exists) setFilterOwner(PROFILE_OWNER_FILTER_ALL)
    }, [filterOwner, profileOwnerSelectOptions])

    useEffect(() => {
        if (filterProfileName === PROFILE_NAME_FILTER_ALL) return
        const exists = profileNameSelectOptions.some(
            (o) => o.value === filterProfileName
        )
        if (!exists) setFilterProfileName(PROFILE_NAME_FILTER_ALL)
    }, [filterProfileName, profileNameSelectOptions])

    useEffect(() => {
        if (filterProfileUser === PROFILE_USER_FILTER_ALL) return
        const exists = profileUserSearchSelectOptions.some(
            (o) => o.value === filterProfileUser
        )
        if (!exists) setFilterProfileUser(PROFILE_USER_FILTER_ALL)
    }, [filterProfileUser, profileUserSearchSelectOptions])

    const TableActions = (doc: TProfile) => {
        const onDelete = async (id: number | undefined) => {
            if (!id) return
            try {
                await deleteProfile(id)
                message.success('Profile deleted successfully')
                getProfileList()
            } catch {
                message.error('Unable to delete the profile')
            }
        }
        return (
            <div className="flex flex-wrap justify-center gap-[clamp(0.3rem,0.8vw,0.5rem)] sm:gap-2">
                {(isAdminAccessRole(user?.role) || user?.role === 'USER') && (
                    <>
                        <Tooltip title="Delete profile">
                            <Popconfirm
                                title={`Delete ${doc.name}`}
                                description="Are you sure to delete this profile?"
                                onConfirm={() => onDelete(doc.id)}
                            >
                                <Button
                                    icon={<DeleteOutlined />}
                                    color="danger"
                                    variant="outlined"
                                    size="small"
                                />
                            </Popconfirm>
                        </Tooltip>
                        <Tooltip title="Edit profile">
                            <Button
                                icon={<EditOutlined />}
                                color="primary"
                                variant="outlined"
                                size="small"
                                onClick={() => navigate(`/profile/${doc.id}`)}
                            />
                        </Tooltip>
                    </>
                )}
                <Tooltip title="Generate resume">
                    <Button
                        icon={<SolutionOutlined />}
                        color="primary"
                        variant="outlined"
                        size="small"
                        onClick={() => navigate(`/resume/${doc.id}`)}
                    />
                </Tooltip>
                {user?.role === USER_ROLES.MANAGER && (
                    <ProfileCalendarUrlButton
                        doc={doc}
                        onSaved={getProfileList}
                    />
                )}
            </div>
        )
    }

    const columns: TableProps<TProfile>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'key',
            width: 56,
            render: (_: any, _record: TProfile, index: number) => index + 1,
        },
        {
            title: 'Full name',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: 'Phone',
            dataIndex: 'phone',
            key: 'phone',
            ellipsis: true,
        },
        {
            title: 'Location',
            dataIndex: 'location',
            key: 'location',
            ellipsis: true,
        },
        {
            title: 'Street',
            dataIndex: 'street',
            key: 'street',
            ellipsis: true,
        },
        {
            title: 'Race',
            dataIndex: 'race',
            key: 'race',
            ellipsis: true,
        },
        {
            title: 'Profile owner',
            render: (_: any, record: TProfile) => {
                return record.user?.email || 'N/A'
            },
            ellipsis: true,
        },
        ...(user?.role === USER_ROLES.MANAGER
            ? [
                  {
                      title: 'Profile user',
                      key: 'profileUserIndex',
                      width: 160,
                      render: (_: unknown, record: TProfile) => (
                          <ProfileUserSelect
                              className="min-w-[8rem] max-w-[10rem]"
                              manageable
                              onListChange={getProfileList}
                              value={record.profileUserIndex ?? null}
                              ariaLabel={`Profile user for ${record.name}`}
                              onChange={async (profileUserIndex) => {
                                  try {
                                      await updateProfile({
                                          ...record,
                                          profileUserIndex,
                                      })
                                      message.success('Profile user saved')
                                      getProfileList()
                                  } catch {
                                      message.error(
                                          'Unable to update profile user'
                                      )
                                  }
                              }}
                          />
                      ),
                  } as const,
                  {
                      title: 'Show',
                      key: 'show',
                      width: 72,
                      render: (_: unknown, record: TProfile) => (
                          <Switch
                              checked={record.show !== false}
                              onChange={async (checked) => {
                                  try {
                                      await updateProfile({
                                          ...record,
                                          show: checked,
                                      })
                                      message.success('Visibility updated')
                                      getProfileList()
                                  } catch {
                                      message.error(
                                          'Unable to update visibility'
                                      )
                                  }
                              }}
                          />
                      ),
                  } as const,
              ]
            : []),
        {
            title: 'Actions',
            key: 'actions',
            width: user?.role === USER_ROLES.MANAGER ? 180 : 140,
            render: TableActions,
        },
    ]

    const canAdd =
        isAdminAccessRole(user?.role) || user?.role === 'USER'
    const canViewProfilesSearchbar = user?.role === USER_ROLES.MANAGER

    const profilesFilterStripClass = isDark
        ? 'border-b border-[rgb(51_65_85/0.95)] bg-gradient-to-b from-[rgb(30_41_59/0.98)] to-[rgb(15_23_42/0.96)]'
        : 'border-b border-[rgb(226_232_240/0.95)] bg-gradient-to-b from-[rgb(248_250_252/0.98)] to-[rgb(241_245_249/0.92)]'

    const profilesFilterLabelClass = isDark
        ? 'text-[rgb(203_213_225)]'
        : 'text-[rgb(71_85_105)]'

    return (
        <PageShell
            title="Profiles"
            actions={
                canAdd ? (
                    <Link to="/profile/new" className="w-full sm:w-auto">
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            className="w-full sm:w-auto"
                            size="large"
                        >
                            Add profile
                        </Button>
                    </Link>
                ) : undefined
            }
        >
            <div className="panel-elevated panel-elevated--table min-w-0">
                {canViewProfilesSearchbar && (
                    <div className={profilesFilterStripClass}>
                        <Form
                            layout="vertical"
                            requiredMark={false}
                            className="mb-0 [&_.ant-form-item]:mb-0"
                        >
                            <div className="grid grid-cols-1 gap-x-[clamp(0.65rem,1.5vw,1rem)] gap-y-[clamp(0.65rem,1.5vw,0.85rem)] px-[clamp(0.65rem,1.5vw,1rem)] py-[clamp(0.65rem,1.5vw,0.85rem)] sm:grid-cols-2 xl:grid-cols-4">
                                <Form.Item
                                    label={
                                        <span
                                            className={`text-xs font-semibold ${profilesFilterLabelClass}`}
                                        >
                                            Profile owner
                                        </span>
                                    }
                                >
                                    <Select<ProfileOwnerFilterValue>
                                        showSearch
                                        optionFilterProp="label"
                                        size="middle"
                                        className="profiles-filter-select w-full min-w-0 [&_.ant-select-selector]:!rounded-lg"
                                        value={filterOwner}
                                        options={profileOwnerSelectOptions}
                                        onChange={(v) =>
                                            setFilterOwner(
                                                v ?? PROFILE_OWNER_FILTER_ALL
                                            )
                                        }
                                        aria-label="Filter profiles by owner email"
                                        popupMatchSelectWidth={false}
                                    />
                                </Form.Item>
                                <Form.Item
                                    label={
                                        <span
                                            className={`text-xs font-semibold ${profilesFilterLabelClass}`}
                                        >
                                            Profile user
                                        </span>
                                    }
                                >
                                    <Select<ProfileUserFilterValue>
                                        size="middle"
                                        className="profiles-filter-select w-full min-w-0 [&_.ant-select-selector]:!rounded-lg"
                                        value={filterProfileUser}
                                        options={profileUserSearchSelectOptions}
                                        onChange={(v) =>
                                            setFilterProfileUser(
                                                v ?? PROFILE_USER_FILTER_ALL
                                            )
                                        }
                                        aria-label="Filter profiles by profile user slot"
                                        popupMatchSelectWidth={false}
                                    />
                                </Form.Item>
                                <Form.Item
                                    label={
                                        <span
                                            className={`text-xs font-semibold ${profilesFilterLabelClass}`}
                                        >
                                            Profile name
                                        </span>
                                    }
                                >
                                    <Select<ProfileNameFilterValue>
                                        showSearch
                                        optionFilterProp="label"
                                        size="middle"
                                        className="profiles-filter-select w-full min-w-0 [&_.ant-select-selector]:!rounded-lg"
                                        value={filterProfileName}
                                        options={profileNameSelectOptions}
                                        onChange={(v) =>
                                            setFilterProfileName(
                                                v ?? PROFILE_NAME_FILTER_ALL
                                            )
                                        }
                                        aria-label="Filter profiles by profile name"
                                        popupMatchSelectWidth={false}
                                    />
                                </Form.Item>
                                <Form.Item
                                    label={
                                        <span
                                            className={`text-xs font-semibold ${profilesFilterLabelClass}`}
                                        >
                                            Location
                                        </span>
                                    }
                                >
                                    <Input
                                        allowClear
                                        size="middle"
                                        placeholder="Search by location"
                                        value={filterLocation}
                                        onChange={(e) =>
                                            setFilterLocation(e.target.value)
                                        }
                                        aria-label="Filter profiles by location"
                                        className="profiles-filter-input !rounded-lg"
                                    />
                                </Form.Item>
                            </div>
                        </Form>
                    </div>
                )}
                <div className="app-table-responsive">
                    <Table
                        size="small"
                        columns={columns}
                        dataSource={filteredProfiles}
                        className={`app-data-table min-w-[min(720px,max(100%,20rem))] ${
                            canViewProfilesSearchbar
                                ? 'profiles-table-flat-top'
                                : ''
                        }`}
                        rowKey={(record) =>
                            record.id != null && record.id !== undefined
                                ? String(record.id)
                                : `${record.userId ?? 'u'}-${record.email ?? ''}-${record.name ?? ''}`
                        }
                        loading={loading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            responsive: true,
                            position: ['bottomCenter'],
                            className: TABLE_PAGINATION_COMFORT_CLASSNAME,
                        }}
                        scroll={{ x: 'max-content' }}
                    />
                </div>
            </div>
        </PageShell>
    )
}

export default Home
