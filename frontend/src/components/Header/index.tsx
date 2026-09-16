import { Avatar, Button, Drawer, Dropdown, Space, Switch } from 'antd'
import {
    DownOutlined,
    MenuOutlined,
    MoonOutlined,
    SunOutlined,
} from '@ant-design/icons'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useEffect, useMemo, useState } from 'react'
import {
    isAdminAccessRole,
    isAppUserRole,
    USER_ROLES,
} from '@/types/constants'
import type { MenuProps } from 'antd'
import { useThemeMode } from '../ThemeContext'

type NavItem = { to: string; label: string }

const Header = () => {
    const auth = useAuth()
    const { user, logout } = auth
    const navigate = useNavigate()
    const location = useLocation()
    const { isDark, setDarkMode } = useThemeMode()
    const [mobileNavOpen, setMobileNavOpen] = useState(false)

    useEffect(() => {
        setMobileNavOpen(false)
    }, [location.pathname])

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        [
            'relative inline-flex min-h-[2.25rem] flex-none items-center justify-center rounded-xl px-2.5 text-xs font-semibold tracking-tight transition-colors duration-200 sm:min-h-[2.375rem] sm:px-3.5 sm:text-[0.8125rem]',
            'outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2',
            isDark
                ? 'focus-visible:ring-offset-slate-950'
                : 'focus-visible:ring-offset-white',
            isActive
                ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/30'
                : isDark
                  ? 'bg-transparent text-slate-300 hover:bg-slate-800/90 hover:text-white'
                  : 'bg-transparent text-slate-600 hover:bg-sky-50/95 hover:text-slate-900',
        ].join(' ')

    const drawerNavClass = ({ isActive }: { isActive: boolean }) =>
        [
            'flex min-h-[clamp(2.65rem,6vw,3rem)] w-full items-center rounded-xl px-3 text-fluid-sm font-semibold tracking-tight transition-all duration-200',
            'outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2',
            isDark ? 'focus-visible:ring-offset-slate-900' : 'focus-visible:ring-offset-white',
            isActive
                ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25'
                : isDark
                  ? 'text-slate-200 hover:bg-slate-800/90 hover:text-white'
                  : 'text-slate-700 hover:bg-sky-50 hover:text-slate-900',
        ].join(' ')

    const isAdmin = useMemo(
        () => isAdminAccessRole(user?.role),
        [user?.role]
    )
    const isManager = useMemo(
        () =>
            String(user?.role ?? '')
                .trim()
                .toUpperCase() === USER_ROLES.MANAGER,
        [user?.role]
    )

    const isAppUser = useMemo(
        () => isAppUserRole(user?.role),
        [user?.role]
    )

    const navItems: NavItem[] = useMemo(() => {
        if (isAppUser) {
            return [{ to: '/history', label: 'History' }]
        }
        const items: NavItem[] = [
            { to: '/profile', label: 'Profiles' },
            { to: '/history', label: 'History' },
        ]
        if (isManager) {
            items.push({ to: '/schedule', label: 'Schedule' })
            items.push({ to: '/calendar', label: 'Calendar' })
            items.push({ to: '/statistics', label: 'Statistics' })
        }
        if (isAdmin) {
            items.push({ to: '/users', label: 'Users' })
        }
        return items
    }, [isAdmin, isAppUser, isManager])

    const userName = user?.email || 'User'
    const initials = userName
        .split(/[@\s]/)
        .filter(Boolean)
        .map(s => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()

    const userMenuItems: MenuProps['items'] = useMemo(
        () => [
            {
                key: 'identity',
                disabled: true,
                label: (
                    <div className="px-1 py-1.5">
                        <div
                            className={
                                isDark
                                    ? 'text-sm font-semibold tracking-tight text-slate-100'
                                    : 'text-sm font-semibold tracking-tight text-slate-900'
                            }
                        >
                            {userName}
                        </div>
                        <div
                            className={
                                isDark
                                    ? 'mt-0.5 text-xs font-medium uppercase tracking-wider text-slate-400'
                                    : 'mt-0.5 text-xs font-medium uppercase tracking-wider text-slate-500'
                            }
                        >
                            {user?.role || '—'}
                        </div>
                    </div>
                ),
            },
            { type: 'divider' },
            ...(isAppUserRole(user?.role)
                ? []
                : [
                      {
                          key: 'profile',
                          label: 'My profile',
                          onClick: () => navigate('/me'),
                      },
                  ]),
            {
                key: 'logout',
                danger: true,
                label: 'Log out',
                onClick: () => logout(),
            },
        ],
        [userName, user, logout, navigate, isDark]
    )

    return (
        <header
            className={
                isDark
                    ? 'fixed left-0 right-0 top-0 z-50 border-b border-slate-800/90 pt-[env(safe-area-inset-top,0px)]'
                    : 'fixed left-0 right-0 top-0 z-50 border-b border-sky-200/50 pt-[env(safe-area-inset-top,0px)]'
            }
        >
            <div
                className={
                    isDark
                        ? 'pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-900/88 to-slate-950/75 backdrop-blur-xl supports-[backdrop-filter]:from-slate-950/90'
                        : 'pointer-events-none absolute inset-0 bg-gradient-to-b from-white/95 via-sky-50/40 to-white/75 backdrop-blur-xl supports-[backdrop-filter]:from-white/88'
                }
                aria-hidden
            />
            <div
                className={
                    isDark
                        ? 'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-500/35 to-transparent'
                        : 'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-400/45 to-transparent'
                }
                aria-hidden
            />
            <div className="relative mx-auto grid h-[var(--header-height)] w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(0.35rem,1.2vw,0.75rem)] px-[var(--page-pad-x)] sm:gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-8">
                <Link
                    to={isAppUser ? '/history' : '/'}
                    className="group flex min-w-0 shrink-0 items-center gap-[clamp(0.35rem,1vw,0.65rem)] sm:gap-2.5"
                >
                    <span
                        className="flex h-[clamp(2rem,5vw,2.25rem)] w-[clamp(2rem,5vw,2.25rem)] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 p-px shadow-md shadow-sky-600/25 transition-transform duration-300 group-hover:scale-[1.03] sm:h-9 sm:w-9 sm:rounded-2xl"
                        aria-hidden
                    >
                        <span
                            className={
                                isDark
                                    ? 'flex h-full w-full items-center justify-center rounded-[0.65rem] bg-slate-950 text-[clamp(0.5625rem,1.8vw,0.625rem)] font-bold tracking-tight text-sky-300 sm:rounded-[0.9rem] sm:text-xs'
                                    : 'flex h-full w-full items-center justify-center rounded-[0.65rem] bg-white text-[clamp(0.5625rem,1.8vw,0.625rem)] font-bold tracking-tight text-blue-700 sm:rounded-[0.9rem] sm:text-xs'
                            }
                        >
                            RA
                        </span>
                    </span>
                    <span className="flex min-w-0 flex-col justify-center">
                        <span
                            className={
                                isDark
                                    ? 'truncate bg-gradient-to-r from-slate-100 via-sky-200 to-blue-300 bg-clip-text text-[clamp(0.9375rem,2.8vw,1.125rem)] font-bold leading-tight tracking-tight text-transparent sm:text-lg'
                                    : 'truncate bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-[clamp(0.9375rem,2.8vw,1.125rem)] font-bold leading-tight tracking-tight text-transparent sm:text-lg'
                            }
                        >
                            Resume AI
                        </span>
                        <span
                            className={
                                isDark
                                    ? 'hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400/75 sm:block'
                                    : 'hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600/80 sm:block'
                            }
                        >
                            Intelligent drafts
                        </span>
                    </span>
                </Link>

                <nav className="hidden min-h-0 min-w-0 items-center justify-center lg:flex lg:justify-start">
                    <div className="flex w-full min-w-0 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <ul className="mx-auto flex h-full min-h-[2.5rem] w-max max-w-full items-center gap-0.5 pr-1 lg:mx-0 lg:min-h-[2.625rem] lg:gap-1 lg:pr-0 xl:gap-1.5">
                            {navItems.map(({ to, label }) => (
                                <li key={to} className="flex items-center">
                                    <NavLink to={to} className={navLinkClass}>
                                        {label}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>

                <div className="flex shrink-0 items-center justify-end gap-[clamp(0.15rem,0.8vw,0.35rem)] sm:gap-1">
                    <Space
                        size={4}
                        align="center"
                        className="!flex items-center sm:!gap-2"
                    >
                        <div
                            className={
                                isDark
                                    ? 'flex h-[clamp(2rem,5vw,2.25rem)] items-center gap-1 rounded-full border border-slate-700/90 bg-slate-900/70 px-1.5 sm:h-9 sm:gap-1.5 sm:px-2'
                                    : 'flex h-[clamp(2rem,5vw,2.25rem)] items-center gap-1 rounded-full border border-sky-200/90 bg-white/85 px-1.5 shadow-sm shadow-sky-900/5 sm:h-9 sm:gap-1.5 sm:px-2'
                            }
                        >
                            <SunOutlined className="text-[11px] text-amber-500 sm:text-xs" />
                            <Switch
                                size="small"
                                checked={isDark}
                                onChange={setDarkMode}
                                aria-label="Toggle dark mode"
                            />
                            <MoonOutlined className="text-[11px] text-sky-400 sm:text-xs" />
                        </div>
                        <Button
                            type="text"
                            className={
                                isDark
                                    ? 'flex !h-[clamp(2rem,5vw,2.5rem)] !min-w-[clamp(2rem,5vw,2.5rem)] items-center justify-center !rounded-xl !border border-slate-700/80 !bg-slate-900/60 !text-slate-100 hover:!border-sky-500/40 hover:!bg-slate-800/90 lg:!hidden'
                                    : 'flex !h-[clamp(2rem,5vw,2.5rem)] !min-w-[clamp(2rem,5vw,2.5rem)] items-center justify-center !rounded-xl !border border-sky-200/90 !bg-white/90 !text-slate-700 shadow-sm hover:!border-sky-300 hover:!bg-white lg:!hidden'
                            }
                            icon={<MenuOutlined className="text-fluid-base" />}
                            aria-label="Open navigation menu"
                            onClick={() => setMobileNavOpen(true)}
                        />
                        <Dropdown
                            menu={{ items: userMenuItems }}
                            trigger={['click']}
                            placement="bottomRight"
                            rootClassName="header-user-dropdown"
                        >
                            <button
                                type="button"
                                className={
                                    isDark
                                        ? 'group flex h-[clamp(2rem,5vw,2.25rem)] cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700/90 bg-slate-900/75 py-0.5 pl-0.5 pr-2 transition-all duration-200 hover:border-sky-500/40 hover:bg-slate-800/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 sm:h-9 sm:gap-2 sm:rounded-2xl sm:pl-1 sm:pr-2.5 md:pr-3'
                                        : 'group flex h-[clamp(2rem,5vw,2.25rem)] cursor-pointer items-center gap-1.5 rounded-xl border border-sky-200/90 bg-white/90 py-0.5 pl-0.5 pr-2 shadow-sm shadow-sky-900/5 transition-all duration-200 hover:border-sky-300 hover:bg-white hover:shadow-md hover:shadow-sky-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 sm:h-9 sm:gap-2 sm:rounded-2xl sm:pl-1 sm:pr-2.5 md:pr-3'
                                }
                            >
                                <Avatar
                                    className={
                                        isDark
                                            ? '!flex !h-7 !w-7 !items-center !justify-center border-2 border-slate-800 !text-[10px] shadow-inner ring-2 ring-sky-900/50 sm:!h-9 sm:!w-9 sm:!text-xs'
                                            : '!flex !h-7 !w-7 !items-center !justify-center border-2 border-white !text-[10px] shadow-inner ring-2 ring-sky-100 sm:!h-9 sm:!w-9 sm:!text-xs'
                                    }
                                    style={{
                                        background:
                                            'linear-gradient(135deg, #0ea5e9 0%, #2563eb 45%, #4f46e5 100%)',
                                        color: '#fff',
                                        fontWeight: 600,
                                    }}
                                >
                                    {initials}
                                </Avatar>
                                <span
                                    className={
                                        isDark
                                            ? 'hidden max-w-[100px] truncate text-left text-xs font-medium text-slate-200 md:block md:max-w-[140px] md:text-sm'
                                            : 'hidden max-w-[100px] truncate text-left text-xs font-medium text-slate-700 md:block md:max-w-[140px] md:text-sm'
                                    }
                                >
                                    {userName}
                                </span>
                                <DownOutlined className="text-[9px] text-slate-400 transition-transform duration-200 group-hover:translate-y-px sm:text-[10px]" />
                            </button>
                        </Dropdown>
                    </Space>
                </div>
            </div>

            <Drawer
                title="Menu"
                placement="left"
                width="min(100%, max(17rem, 85vw))"
                open={mobileNavOpen}
                onClose={() => setMobileNavOpen(false)}
                rootClassName="app-mobile-nav-drawer"
                classNames={{
                    body: '!pt-2',
                }}
            >
                <nav
                    className="flex flex-col gap-1"
                    aria-label="Primary navigation"
                >
                    {navItems.map(({ to, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={drawerNavClass}
                            onClick={() => setMobileNavOpen(false)}
                        >
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </Drawer>
        </header>
    )
}

export default Header
