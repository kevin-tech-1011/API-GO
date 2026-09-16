import { useMemo, useState } from 'react'
import { App, Button, Divider, Input, Select, Tooltip } from 'antd'
import { PlusOutlined, SettingOutlined } from '@ant-design/icons'

import {
    createProfileUser,
    profileUserErrorMessage,
} from '@/actions/profileUsers'
import { useProfileUsers } from '@/components/ProfileUsersContext'
import ManageProfileUsersModal from './ManageProfileUsersModal'

/** Ant Design warns when a Select option `value` is `null`, so “unassigned” gets a sentinel. */
export const PROFILE_USER_NONE = '__none__' as const

export type ProfileUserSelectValue = number | typeof PROFILE_USER_NONE

export type ProfileUserSelectProps = {
    /** `TProfileUser.id`, or `null` when the profile has no profile user. */
    value: number | null
    onChange: (next: number | null) => void
    /** Manager-only: show the inline “add” field and the manage (rename/delete) modal. */
    manageable?: boolean
    /** Called after the option list is added to, renamed, or deleted. */
    onListChange?: () => void
    disabled?: boolean
    className?: string
    placeholder?: string
    noneLabel?: string
    ariaLabel?: string
}

/**
 * The Profiles “Profile user” picker. Choosing a value calls `onChange`; when
 * `manageable`, the dropdown also grows an add field and a link to the manage modal,
 * so the option list can be edited without leaving the table.
 */
const ProfileUserSelect = ({
    value,
    onChange,
    manageable = false,
    onListChange,
    disabled = false,
    className,
    placeholder = 'Select',
    noneLabel = 'None',
    ariaLabel = 'Profile user',
}: ProfileUserSelectProps): JSX.Element => {
    const { message } = App.useApp()
    const { options: profileUserOptions, isKnownIndex, refresh } = useProfileUsers()

    const [open, setOpen] = useState(false)
    const [manageOpen, setManageOpen] = useState(false)
    const [newName, setNewName] = useState('')
    const [creating, setCreating] = useState(false)

    const options = useMemo(() => {
        const base: { label: string; value: ProfileUserSelectValue }[] = [
            { label: noneLabel, value: PROFILE_USER_NONE },
            ...profileUserOptions.map((o) => ({
                label: o.label,
                value: o.value as ProfileUserSelectValue,
            })),
        ]
        // A stale id (deleted in another tab) would otherwise render as a bare number.
        if (value != null && !isKnownIndex(value)) {
            base.push({ label: `Unknown (#${value})`, value })
        }
        return base
    }, [profileUserOptions, isKnownIndex, value, noneLabel])

    const create = async () => {
        const name = newName.trim()
        if (name === '' || creating) return
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
        <>
            <Select<ProfileUserSelectValue>
                className={className}
                placeholder={placeholder}
                disabled={disabled}
                value={value == null ? PROFILE_USER_NONE : value}
                options={options}
                open={open}
                onOpenChange={setOpen}
                onChange={(next) =>
                    onChange(
                        next === undefined ||
                            next === null ||
                            next === PROFILE_USER_NONE
                            ? null
                            : Number(next)
                    )
                }
                popupMatchSelectWidth={false}
                aria-label={ariaLabel}
                popupRender={
                    manageable
                        ? (menu) => (
                              <>
                                  {menu}
                                  <Divider className="!my-1.5" />
                                  <div className="flex flex-col gap-1.5 px-1 pb-1">
                                      <div className="flex items-center gap-1.5">
                                          <Input
                                              size="small"
                                              value={newName}
                                              maxLength={100}
                                              placeholder="New profile user"
                                              disabled={creating}
                                              onChange={(e) =>
                                                  setNewName(e.target.value)
                                              }
                                              onPressEnter={() => void create()}
                                              // Keep typing (Enter, arrows, Backspace) out of the Select.
                                              onKeyDown={(e) => e.stopPropagation()}
                                              aria-label="New profile user name"
                                          />
                                          <Button
                                              size="small"
                                              type="primary"
                                              icon={<PlusOutlined />}
                                              loading={creating}
                                              disabled={newName.trim() === ''}
                                              onClick={() => void create()}
                                              aria-label="Add profile user"
                                          />
                                      </div>
                                      <Tooltip title="Rename or delete profile users">
                                          <Button
                                              size="small"
                                              type="text"
                                              block
                                              icon={<SettingOutlined />}
                                              onClick={() => {
                                                  setOpen(false)
                                                  setManageOpen(true)
                                              }}
                                          >
                                              Edit profile users
                                          </Button>
                                      </Tooltip>
                                  </div>
                              </>
                          )
                        : undefined
                }
            />
            {manageable ? (
                <ManageProfileUsersModal
                    open={manageOpen}
                    onClose={() => setManageOpen(false)}
                    onListChange={onListChange}
                />
            ) : null}
        </>
    )
}

export default ProfileUserSelect
