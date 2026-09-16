const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
    // Paths must be absolute to the config dir: dev runs Tailwind with cwd=repo root
    // (`nodemon` + Vite middleware), so relative globs would miss ./frontend/src.
    content: [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: [
                    'ui-sans-serif',
                    'system-ui',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    'Segoe UI',
                    'Roboto',
                    'Helvetica Neue',
                    'Arial',
                    'sans-serif',
                ],
            },
            fontSize: {
                /** Scales smoothly from phone → ultrawide */
                'fluid-2xl': [
                    'clamp(1.35rem, 1.05rem + 1.15vw, 2.125rem)',
                    {
                        lineHeight: '1.15',
                        letterSpacing: '-0.025em',
                        fontWeight: '600',
                    },
                ],
                'fluid-lg': [
                    'clamp(1.0625rem, 0.95rem + 0.45vw, 1.25rem)',
                    { lineHeight: '1.25', letterSpacing: '-0.02em' },
                ],
                'fluid-base': [
                    'clamp(0.875rem, 0.82rem + 0.22vw, 1rem)',
                    { lineHeight: '1.5' },
                ],
                'fluid-sm': [
                    'clamp(0.8125rem, 0.76rem + 0.2vw, 0.9375rem)',
                    { lineHeight: '1.55' },
                ],
                'fluid-xs': [
                    'clamp(0.6875rem, 0.62rem + 0.18vw, 0.8125rem)',
                    { lineHeight: '1.45' },
                ],
            },
            spacing: {
                'fluid-shell-y': 'clamp(0.85rem, 0.55rem + 1.6vw, 2rem)',
                'fluid-section': 'clamp(0.75rem, 0.5rem + 1.8vw, 1.75rem)',
                'fluid-card': 'clamp(0.85rem, 0.65rem + 1.4vw, 1.5rem)',
                'fluid-gap': 'clamp(0.45rem, 0.35rem + 0.6vw, 1rem)',
            },
            borderRadius: {
                fluid: 'clamp(0.75rem, 0.55rem + 0.9vw, 1.25rem)',
            },
            boxShadow: {
                soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.06)',
                card: '0 1px 3px rgb(15 23 42 / 0.06), 0 8px 24px rgb(14 165 233 / 0.08)',
                'card-blue':
                    '0 1px 2px rgb(15 23 42 / 0.05), 0 10px 28px rgb(37 99 235 / 0.08)',
            },
        },
    },
    plugins: [],
}
