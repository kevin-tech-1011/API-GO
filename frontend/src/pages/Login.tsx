import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from 'antd'
import { useAuth } from '../components/AuthContext'
import { USER_ROLES } from '@/types/constants'

const MANAGER_AUTH_URL = '/api/auth/manager'
const MANAGER_LOGIN_DENIED = "You can't login via this url"

export default function LoginPage({ manager = false }: { manager?: boolean }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const { clearSession, login } = useAuth()

    const navigate = useNavigate()

    useEffect(() => {
        clearSession()
    }, [clearSession])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')
        try {
            const result = (await login(
                email,
                password,
                manager ? MANAGER_AUTH_URL : '/api/auth'
            )) as { data?: { role?: string } }
            const role = result.data?.role
            if (manager) {
                navigate('/users')
            } else if (role === USER_ROLES.USER) {
                navigate('/history')
            } else {
                navigate('/')
            }
        } catch (err: any) {
            const status = err?.response?.status
            const errorMsg =
                err?.response?.data?.error || err.message || 'Login failed'
            if (manager && status === 403) {
                window.alert(MANAGER_LOGIN_DENIED)
            }
            setError(errorMsg)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="login-page relative flex min-h-dvh items-center justify-center overflow-hidden px-[var(--page-pad-x)] py-[clamp(1.5rem,5vw,4rem)]">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_15%,rgb(56_189_248/0.2),transparent_32%),radial-gradient(circle_at_88%_10%,rgb(59_130_246/0.14),transparent_28%),radial-gradient(circle_at_50%_85%,rgb(14_165_233/0.1),transparent_34%)]"
            />
            <div className="panel-auth login-auth-card shrink-0">
                <div className="mb-[clamp(1.25rem,3vw,2rem)] text-center">
                    <div className="mx-auto mb-[clamp(0.85rem,2vw,1.25rem)] flex h-[clamp(2.9rem,6vw,3.2rem)] w-[clamp(2.9rem,6vw,3.2rem)] items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 p-px shadow-lg shadow-sky-600/25">
                        <span className="flex h-full w-full items-center justify-center rounded-[0.95rem] bg-white text-fluid-sm font-bold tracking-wide text-blue-700">
                            RA
                        </span>
                    </div>
                    <h1 className="text-fluid-2xl font-semibold text-slate-800">
                        {manager ? 'Manager sign in' : 'Welcome back'}
                    </h1>
                    <p className="mt-[clamp(0.35rem,1vw,0.65rem)] text-fluid-sm leading-relaxed text-slate-500">
                        {manager
                            ? 'Only manager accounts can use this page.'
                            : 'Sign in to continue — your session stays on this device.'}
                    </p>
                </div>
                <form
                    className="space-y-[clamp(1rem,2.5vw,1.35rem)]"
                    onSubmit={handleSubmit}
                >
                    {error && (
                        <p
                            role="alert"
                            className="login-form-alert rounded-2xl px-3 py-2.5 text-center text-sm font-medium"
                        >
                            {error}
                        </p>
                    )}
                    <div className="space-y-1.5">
                        <label
                            htmlFor="email"
                            className="text-sm font-medium text-slate-700"
                        >
                            Email
                        </label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            size="large"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            className="!rounded-xl login-input"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label
                            htmlFor="password"
                            className="text-sm font-medium text-slate-700"
                        >
                            Password
                        </label>
                        <Input.Password
                            id="password"
                            name="password"
                            autoComplete="current-password"
                            required
                            size="large"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="!rounded-xl login-input"
                        />
                    </div>
                    <Button
                        loading={isLoading}
                        disabled={isLoading}
                        className="mt-2 w-full"
                        type="primary"
                        htmlType="submit"
                        size="large"
                    >
                        {manager ? 'Sign in' : 'Log in / Sign up'}
                    </Button>
                    <p className="pt-1 text-center text-xs text-slate-500/90">
                        Protected access. Your credentials stay private.
                    </p>
                </form>
            </div>
        </div>
    )
}
