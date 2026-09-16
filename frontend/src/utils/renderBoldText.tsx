import { Text } from '@react-pdf/renderer'

/**
 * @deprecated Use the default export `renderBoldText` which supports `**bold**` syntax.
 */
export const renderBoldTextDeprecated = (text: string | undefined) => {
    if (!text) return text

    const parts: (React.ReactNode)[] = []
    const regex = /<b>(.*?)<\/b>/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index))
        }
        parts.push(
            <Text key={`bold-${match.index}`} style={{ fontFamily: 'Calibri Bold' }}>
                {match[1]}
            </Text>
        )
        lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex))
    }

    return parts.length === 0 ? text.replace(/<b>(.*?)<\/b>/g, '$1') : parts
}

// New implementation: parses **bold** markers and renders bold text
const renderBoldText = (text: string | undefined) => {
    if (!text) return text

    const parts: (React.ReactNode)[] = []
    const regex = /\*\*(.*?)\*\*/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index))
        }
        parts.push(
            <Text key={`bold-${match.index}`} style={{ fontFamily: 'Calibri Bold' }}>
                {match[1]}
            </Text>
        )
        lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex))
    }

    return parts.length === 0 ? text.replace(/\*\*(.*?)\*\*/g, '$1') : parts
}

export default renderBoldText