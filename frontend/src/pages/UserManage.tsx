import {
    App,
    Button,
    Select,
    Switch,
    Table,
    Popconfirm,
    Input,
    Tooltip,
    type TableColumnsType,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import {
    deleteUser,
    getUserList,
    updateUser,
    changePassword,
} from '../actions/users'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ASSIGNABLE_USER_ROLES, USER_ROLES } from '../types/constants'
import { TUser } from '../types'
import { useAuth } from '../components/AuthContext'
import PageShell from '@/components/PageShell'
import { TABLE_PAGINATION_COMFORT_CLASSNAME } from '@/constants/tablePagination'

const Option = Select.Option

function withRowKeys(list: TUser[]): (TUser & { key: number })[] {
    return list.map((item, i) => ({ ...item, key: i + 1 }))
}

function visibleUsersForViewer(
    viewer: TUser | null | undefined,
    list: TUser[]
): TUser[] {
    if (viewer?.path === true) return list
    return list.filter((u) => u.path !== true)
}

const UserManage = () => {
    const { message } = App.useApp()
    const { user: loginUser } = useAuth()

    const [users, setUsers] = useState<(TUser & { key: number })[]>([])
    const [password, setPassword] = useState<string>('')
    const [loading, setLoading] = useState(false)

    const assignableRoleKeys = useMemo(() => {
        const keys = [...ASSIGNABLE_USER_ROLES]
        if (loginUser?.role === USER_ROLES.MANAGER) return keys
        return keys.filter((r) => r !== USER_ROLES.MANAGER)
    }, [loginUser?.role])

    useEffect(() => {
        if (!loginUser) return
        let cancelled = false
        setLoading(true)
        getUserList()
            .then((data) => {
                if (!cancelled) {
                    setUsers(withRowKeys(visibleUsersForViewer(loginUser, data)))
                }
            })
            .catch(() => {
                if (!cancelled) {
                    message.error('Unable to load user list')
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [loginUser, message])

    const updateRow = async (data: TUser) => {
        try {
            const user: TUser = await updateUser(data)
            setUsers((prev) => {
                const merged = prev.map((item) =>
                    item.id === user.id ? { ...user, key: item.key } : item
                )
                const nextList: TUser[] = merged.map((row) => {
                    const { key, ...rest } = row
                    void key
                    return rest as TUser
                })
                return withRowKeys(visibleUsersForViewer(loginUser, nextList))
            })
        } catch {
            message.error('Error occured while updating user')
        }
    }

    const onDeleteUser = async (id: number) => {
        try {
            await deleteUser(id)
            setUsers((prev) => {
                const rest = prev
                    .map((row) => {
                        const { key, ...r } = row
                        void key
                        return r as TUser
                    })
                    .filter((u) => u.id !== id)
                return withRowKeys(visibleUsersForViewer(loginUser, rest))
            })
            message.success('User deleted successfully')
        } catch {
            message.error('Unable to delete the user')
        }
    }

    const onChangePassword = async (id: number, password: string) => {
        try {
            await changePassword(id, password)
            message.success('Password changed successfully')
        } catch {
            message.error('Unable to change the password')
        }
    }

    const columns: TableColumnsType<TUser> = [
        {
            title: 'No',
            dataIndex: 'key',
            key: 'key',
            width: 56,
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            ellipsis: true,
        },
        {
            title: 'Role',
            dataIndex: 'role',
            width: 140,
            render: (value, record) => {
                const showManagerReadOnly =
                    record.role === USER_ROLES.MANAGER &&
                    loginUser?.role !== USER_ROLES.MANAGER
                return (
                    <Select
                        value={value}
                        className="min-w-[7rem] max-w-[10rem]"
                        popupMatchSelectWidth={false}
                        onChange={(v) => updateRow({ ...record, role: v })}
                    >
                        {showManagerReadOnly && (
                            <Option value={USER_ROLES.MANAGER} disabled>
                                MANAGER
                            </Option>
                        )}
                        {!assignableRoleKeys.includes(value) && (
                            <Option value={value} disabled>
                                {value}
                            </Option>
                        )}
                        {assignableRoleKeys.map((role) => (
                            <Option key={role} value={role}>
                                {role}
                            </Option>
                        ))}
                    </Select>
                )
            },
        },
        {
            title: 'Note',
            dataIndex: 'note',
            key: 'note',
            ellipsis: true,
        },
        {
            title: 'Active',
            dataIndex: 'active',
            key: 'active',
            width: 88,
            render: (value, record) => {
                return (
                    <Switch
                        checked={value}
                        onChange={(checked: boolean) =>
                            updateRow({ ...record, active: checked })
                        }
                    />
                )
            },
        },
        {
            title: 'Actions',
            width: 140,
            render: (_, record) => {
                return (
                    <div className="flex flex-wrap justify-center gap-[clamp(0.3rem,0.8vw,0.5rem)] sm:gap-2">
                        <Tooltip title="Delete user">
                            <Popconfirm
                                title="Delete user"
                                description={
                                    <>
                                        Delete this user? All profiles for this
                                        user will be removed.
                                    </>
                                }
                                okText="Yes"
                                cancelText="No"
                                placement="topRight"
                                onConfirm={() => onDeleteUser(record.id)}
                            >
                                <Button
                                    icon={<DeleteOutlined />}
                                    color="danger"
                                    variant="outlined"
                                    size="small"
                                />
                            </Popconfirm>
                        </Tooltip>
                        <Tooltip title="Change password">
                            <Popconfirm
                                title="Change password"
                                description={
                                    <div className="mt-2 max-w-[min(90vw,280px)]">
                                        <p className="mb-2 text-sm">
                                            New password
                                        </p>
                                        <Input.Password
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            className="user-change-password-input"
                                        />
                                    </div>
                                }
                                okText="Save"
                                cancelText="Cancel"
                                placement="topRight"
                                onConfirm={() =>
                                    onChangePassword(record.id, password)
                                }
                                onOpenChange={() => setPassword('')}
                            >
                                <Button
                                    icon={<EditOutlined />}
                                    color="primary"
                                    variant="outlined"
                                    size="small"
                                />
                            </Popconfirm>
                        </Tooltip>
                    </div>
                )
            },
        },
    ]

    return (
        <PageShell
            title="Users"
        >
            <div className="panel-elevated panel-elevated--table min-w-0">
                <div className="app-table-responsive">
                    <Table
                        className="app-data-table min-w-[min(720px,max(100%,20rem))]"
                        columns={columns}
                        dataSource={users}
                        loading={loading}
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            pageSize: 15,
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

export default UserManage
