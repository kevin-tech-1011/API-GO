import type { ReactNode } from 'react'

type PageShellProps = {
    title?: string
    subtitle?: string
    actions?: ReactNode
    children: ReactNode
    /** Extra classes on the outer section */
    className?: string
    /** When false, skips bottom padding (e.g. full-bleed pages) */
    padded?: boolean
}

/**
 * Shared page frame: consistent horizontal rhythm, titles, and responsive spacing.
 */
export default function PageShell({
    title,
    subtitle,
    actions,
    children,
    className = '',
    padded = true,
}: PageShellProps) {
    return (
        <section
            className={[
                'page-shell min-w-0 w-full max-w-[100vw]',
                padded ? '' : 'page-shell--no-pad-bottom',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {(title != null || actions != null) && (
                <div className="mb-[clamp(1rem,0.6rem+1.5vw,2rem)] flex flex-col gap-[clamp(0.75rem,1.2vw+0.35rem,1.5rem)] sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                        {title != null && title !== '' && (
                            <>
                                <div
                                    className="mb-[clamp(0.5rem,0.35rem+0.6vw,0.85rem)] h-1 w-[clamp(2.5rem,1.5rem+4vw,3.5rem)] max-w-full rounded-full bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-400"
                                    aria-hidden
                                />
                                <h1 className="page-title">{title}</h1>
                            </>
                        )}
                        {subtitle != null && subtitle !== '' && (
                            <p className="page-subtitle">{subtitle}</p>
                        )}
                    </div>
                    {actions != null && (
                        <div className="flex w-full shrink-0 flex-wrap items-stretch gap-[clamp(0.45rem,0.35rem+0.7vw,0.75rem)] sm:w-auto sm:items-center sm:justify-end">
                            {actions}
                        </div>
                    )}
                </div>
            )}
            {children}
        </section>
    )
}
