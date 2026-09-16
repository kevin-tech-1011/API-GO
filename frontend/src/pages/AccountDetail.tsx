import { useState } from 'react'
import { App, Button, Card, Input, Divider, Modal, Spin } from 'antd'
import { LockOutlined, DatabaseOutlined } from '@ant-design/icons'
import axios from 'axios'
import { useAuth } from '../components/AuthContext'
import { changePassword } from '../actions/users'
import { isAdminAccessRole } from '../types/constants'
import PageShell from '@/components/PageShell'

const AccountDetail = () => {
    const { message } = App.useApp()
    const { user } = useAuth()
    const [passwordLoading, setPasswordLoading] = useState(false)
    const [dbBackupLoading, setDbBackupLoading] = useState(false)
    const [dbRestoreLoading, setDbRestoreLoading] = useState(false)

    const [passwordForm, setPasswordForm] = useState({
        newPassword: '',
        confirmPassword: '',
    })

    if (!user) {
        return <></>
    }

    const handleChangePassword = async () => {
        if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
            message.error('Please fill in all password fields')
            return
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            message.error('New password and confirm password do not match')
            return
        }

        if (passwordForm.newPassword.length < 6) {
            message.error('New password must be at least 6 characters')
            return
        }

        try {
            setPasswordLoading(true)
            await changePassword(user?.id || -1, passwordForm.newPassword)
            message.success('Password changed successfully')
            setPasswordForm({
                newPassword: '',
                confirmPassword: '',
            })
        } catch (error: any) {
            message.error(
                error.response?.data?.message || 'Failed to change password'
            )
        } finally {
            setPasswordLoading(false)
        }
    }

    const handleDatabaseBackup = async () => {
        Modal.confirm({
            title: 'Backup database',
            content: 'Download a full backup of the application database?',
            okText: 'Download',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    setDbBackupLoading(true)
                    const response = await axios.get('/api/backup/download', {
                        responseType: 'blob',
                    })
                    const url = window.URL.createObjectURL(
                        new Blob([response.data])
                    )
                    const link = document.createElement('a')
                    link.href = url
                    link.setAttribute(
                        'download',
                        `db-${new Date().toISOString().split('T')[0]}.sql`
                    )
                    document.body.appendChild(link)
                    link.click()
                    link.parentNode?.removeChild(link)
                    message.success('Database backup downloaded successfully')
                } catch (error: any) {
                    message.error(
                        error.response?.data?.message ||
                            'Failed to backup database'
                    )
                } finally {
                    setDbBackupLoading(false)
                }
            },
        })
    }

    return (
        <PageShell
            title="Account"
            subtitle="Security and optional database tools for administrators."
            className="account-page max-w-[min(100%,48rem)] !px-[var(--page-pad-x)]"
        >
            <Card className="account-section-card panel-elevated border-0 !shadow-none [&_.ant-card-body]:p-[clamp(1rem,3vw,2rem)]">
                <div className="account-section-head flex items-start gap-[clamp(0.5rem,1.5vw,0.85rem)] sm:items-center">
                    <span className="account-section-icon flex h-[clamp(2.5rem,6vw,2.75rem)] w-[clamp(2.5rem,6vw,2.75rem)] shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                        <LockOutlined className="text-[clamp(1.1rem,2.5vw,1.35rem)]" />
                    </span>
                    <div>
                        <h2 className="text-fluid-lg font-semibold text-slate-800">
                            Change password
                        </h2>
                        <p className="mt-1 text-fluid-sm text-slate-500">
                            Use a unique password you don&apos;t reuse elsewhere.
                        </p>
                    </div>
                </div>
                <Divider className="account-section-divider border-slate-200/80" />
                <div className="space-y-4">
                    <div>
                        <label
                            htmlFor="new-password"
                            className="mb-1.5 block text-sm font-medium text-slate-700"
                        >
                            New password
                        </label>
                        <Input.Password
                            id="new-password"
                            size="large"
                            placeholder="Enter a new password"
                            value={passwordForm.newPassword}
                            onChange={(e) =>
                                setPasswordForm({
                                    ...passwordForm,
                                    newPassword: e.target.value,
                                })
                            }
                            disabled={passwordLoading}
                            className="!rounded-xl account-password-input"
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="confirm-password"
                            className="mb-1.5 block text-sm font-medium text-slate-700"
                        >
                            Confirm password
                        </label>
                        <Input.Password
                            id="confirm-password"
                            size="large"
                            placeholder="Confirm new password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) =>
                                setPasswordForm({
                                    ...passwordForm,
                                    confirmPassword: e.target.value,
                                })
                            }
                            disabled={passwordLoading}
                            className="!rounded-xl account-password-input"
                        />
                    </div>
                    <p className="text-xs text-slate-500">
                        Tip: use at least 8 characters with letters, numbers, and symbols.
                    </p>
                    <Button
                        type="primary"
                        size="large"
                        onClick={handleChangePassword}
                        loading={passwordLoading}
                        className="mt-2 w-full sm:w-auto sm:min-w-[min(100%,12.5rem)]"
                    >
                        Update password
                    </Button>
                </div>
            </Card>

            {isAdminAccessRole(user?.role) && (
                <Card className="account-section-card panel-elevated mt-[clamp(1rem,2.5vw,1.5rem)] border border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-white to-blue-50/35 !shadow-none [&_.ant-card-body]:p-[clamp(1rem,3vw,2rem)]">
                    <div className="account-section-head flex items-start gap-[clamp(0.5rem,1.5vw,0.85rem)] sm:items-center">
                        <span className="account-section-icon flex h-[clamp(2.5rem,6vw,2.75rem)] w-[clamp(2.5rem,6vw,2.75rem)] shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                            <DatabaseOutlined className="text-[clamp(1.1rem,2.5vw,1.35rem)]" />
                        </span>
                        <div>
                            <h2 className="text-fluid-lg font-semibold text-slate-800">
                                Database backup
                            </h2>
                            <p className="mt-1 text-fluid-sm leading-relaxed text-slate-600">
                                Download or restore the full SQLite database.
                                Restoring overwrites the current data.
                            </p>
                        </div>
                    </div>
                    <Divider className="account-section-divider border-sky-100" />
                    <Spin spinning={dbBackupLoading || dbRestoreLoading}>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                type="primary"
                                danger
                                size="large"
                                icon={<DatabaseOutlined />}
                                onClick={handleDatabaseBackup}
                                loading={dbBackupLoading}
                                className="w-full sm:flex-1"
                            >
                                Download backup
                            </Button>
                            <Button
                                type="default"
                                size="large"
                                icon={<DatabaseOutlined />}
                                onClick={async () => {
                                    const input = document.createElement('input')
                                    input.type = 'file'
                                    input.accept =
                                        '.sql,application/sql,text/sql,text/plain'
                                    input.onchange = async (e: any) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        Modal.confirm({
                                            title: 'Restore database',
                                            content:
                                                'This will overwrite the current database. Continue?',
                                            okText: 'Restore',
                                            cancelText: 'Cancel',
                                            okButtonProps: { danger: true },
                                            onOk: async () => {
                                                const form = new FormData()
                                                form.append('file', file)
                                                try {
                                                    setDbRestoreLoading(true)
                                                    await axios.post(
                                                        '/api/backup/restore',
                                                        form,
                                                        {
                                                            headers: {
                                                                'Content-Type':
                                                                    'multipart/form-data',
                                                            },
                                                        }
                                                    )
                                                    message.success(
                                                        'Database restored successfully'
                                                    )
                                                } catch (error: any) {
                                                    message.error(
                                                        error.response?.data
                                                            ?.message ||
                                                            'Failed to restore database'
                                                    )
                                                } finally {
                                                    setDbRestoreLoading(false)
                                                }
                                            },
                                        })
                                    }
                                    input.click()
                                }}
                                loading={dbRestoreLoading}
                                className="w-full sm:flex-1"
                            >
                                Restore from file
                            </Button>
                        </div>
                    </Spin>
                </Card>
            )}
        </PageShell>
    )
}

export default AccountDetail
