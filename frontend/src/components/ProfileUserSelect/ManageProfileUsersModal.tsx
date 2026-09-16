import { useEffect, useState } from 'react'
import { App, Button, Empty, Input, Modal, Popconfirm, Spin, Tooltip } from 'antd'
import {
    CheckOutlined,
    CloseOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
} from '@ant-design/icons'

import {
    createProfileUser,
    deleteProfileUser,
    profileUserErrorMessage,
    updateProfileUser,
} from '@/actions/profileUsers'
import { useProfileUsers } from '@/components/ProfileUsersContext'

export type ManageProfileUsersModalProps = {
    open: boolean
    onClose: () => void
    /** Called after the list changes; deleting unassigns profiles, so callers refetch. */
    onListChange?: () => void
}

/**
 * Manager-only editor for the profile user list. Renaming is safe for existing data
 * (profiles store the id, not the name); deleting unassigns every profile using that id.
 */
const ManageProfileUsersModal = ({
    open,
    onClose,
    onListChange,
}: ManageProfileUsersModalProps): JSX.Element => {
    const { message } = App.useApp()
    const { profileUsers, loading, refresh } = useProfileUsers()

    const [editingId, setEditingId] = useState<number | null>(null)
    const [editingName, setEditingName] = useState('')
    const [savingId, setSavingId] = useState<number | null>(null)
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const [newName, setNewName] = useState('')
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        if (open) return
        setEditingId(null)
        setEditingName('')
        setNewName('')
    }, [open])

    const busy = savingId != null || deletingId != null || creating

    const startEdit = (id: number, name: string) => {
        setEditingId(id)
        setEditingName(name)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditingName('')
    }

    const saveEdit = async (id: number) => {
        const name = editingName.trim()
        if (name === '') {
            message.error('Profile user name is required')
            return
        }
        setSavingId(id)
        try {
            await updateProfileUser(id, name)
            await refresh()
            onListChange?.()
            cancelEdit()
            message.success('Profile user renamed')
        } catch (err) {
            message.error(
                profileUserErrorMessage(err, 'Unable to rename the profile user')
            )
        } finally {
            setSavingId(null)
        }
    }

    const remove = async (id: number) => {
        setDeletingId(id)
        try {
            await deleteProfileUser(id)
            await refresh()
            onListChange?.()
            if (editingId === id) cancelEdit()
            message.success('Profile user deleted')
        } catch (err) {
            message.error(
                profileUserErrorMessage(err, 'Unable to delete the profile user')
            )
        } finally {
            setDeletingId(null)
        }
    }

    const create = async () => {
        const name = newName.trim()
        if (name === '') {
            message.error('Profile user name is required')
            return
        }
        setCreating(true)
        try {
            await createProfileUser(name)
            await refresh()
            onListChange?.()
            setNewName('')
            message.success('Profile user added')
        } catch (err) {
            message.error(
                profileUserErrorMessage(err, 'Unable to create the profile user')
            )
        } finally {
            setCreating(false)
        }
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title="Profile users"
            footer={
                <Button onClick={onClose} disabled={busy}>
                    Close
                </Button>
            }
            maskClosable={!busy}
            width="min(100vw - 2rem, 32rem)"
            destroyOnHidden
        >
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
                Rename or remove the options shown in the Profiles “Profile user”
                column. Deleting an option leaves its profiles unassigned; the other
                pages update to match.
            </p>

            <Spin spinning={loading && profileUsers.length === 0}>
                <div className="max-h-[min(50vh,20rem)] overflow-y-auto rounded-lg border border-slate-200/80">
                    {profileUsers.length === 0 ? (
                        <Empty
                            className="!my-6"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="No profile users yet"
                        />
                    ) : (
                        profileUsers.map((profileUser) => {
                            const isEditing = editingId === profileUser.id
                            const rowBusy =
                                savingId === profileUser.id ||
                                deletingId === profileUser.id
                            return (
                                <div
                                    key={profileUser.id}
                                    className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                                >
                                    {isEditing ? (
                                        <>
                                            <Input
                                                autoFocus
                                                size="small"
                                                value={editingName}
                                                maxLength={100}
                                                disabled={rowBusy}
                                                onChange={(e) =>
                                                    setEditingName(e.target.value)
                                                }
                                                onPressEnter={() =>
                                                    void saveEdit(profileUser.id)
                                                }
                                                aria-label="Profile user name"
                                            />
                                            <Button
                                                size="small"
                                                type="primary"
                                                icon={<CheckOutlined />}
                                                loading={savingId === profileUser.id}
                                                onClick={() =>
                                                    void saveEdit(profileUser.id)
                                                }
                                                aria-label="Save name"
                                            />
                                            <Button
                                                size="small"
                                                icon={<CloseOutlined />}
                                                disabled={rowBusy}
                                                onClick={cancelEdit}
                                                aria-label="Cancel rename"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <span
                                                className="min-w-0 flex-1 truncate text-sm"
                                                title={profileUser.name}
                                            >
                                                {profileUser.name}
                                            </span>
                                            <Tooltip title="Rename">
                                                <Button
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                    icon={<EditOutlined />}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        startEdit(
                                                            profileUser.id,
                                                            profileUser.name
                                                        )
                                                    }
                                                    aria-label={`Rename ${profileUser.name}`}
                                                />
                                            </Tooltip>
                                            <Popconfirm
                                                title={`Delete ${profileUser.name}`}
                                                description="Profiles using it become unassigned."
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() =>
                                                    void remove(profileUser.id)
                                                }
                                            >
                                                <Tooltip title="Delete">
                                                    <Button
                                                        size="small"
                                                        color="danger"
                                                        variant="outlined"
                                                        icon={<DeleteOutlined />}
                                                        loading={
                                                            deletingId ===
                                                            profileUser.id
                                                        }
                                                        disabled={busy}
                                                        aria-label={`Delete ${profileUser.name}`}
                                                    />
                                                </Tooltip>
                                            </Popconfirm>
                                        </>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </Spin>

            <div className="mt-3 flex items-center gap-2">
                <Input
                    value={newName}
                    maxLength={100}
                    placeholder="New profile user name"
                    disabled={creating}
                    onChange={(e) => setNewName(e.target.value)}
                    onPressEnter={() => void create()}
                    aria-label="New profile user name"
                />
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    loading={creating}
                    disabled={newName.trim() === ''}
                    onClick={() => void create()}
                >
                    Add
                </Button>
            </div>
        </Modal>
    )
}

export default ManageProfileUsersModal
