import { createElement, type ReactNode } from 'react'
import { Text } from '@react-pdf/renderer'

const renderBoldText = (text: string | undefined) => {
    if (!text) return text

    const parts: ReactNode[] = []
    const regex = /\*\*(.*?)\*\*/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index))
        }
        parts.push(
            createElement(
                Text,
                {
                    key: `bold-${match.index}`,
                    style: { fontFamily: 'Calibri Bold' },
                },
                match[1]
            )
        )
        lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex))
    }

    return parts.length === 0 ? text.replace(/\*\*(.*?)\*\*/g, '$1') : parts
}

export default renderBoldText
