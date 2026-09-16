import { StyleSheet, Font } from '@react-pdf/renderer'

Font.register({
    family: 'Calibri Regular',
    src: '/fonts/calibri/calibri-regular.ttf',
})

Font.register({
    family: 'Calibri Bold',
    src: '/fonts/calibri/calibri-bold.ttf',
})

Font.register({
    family: 'Speaker Pro Heavy',
    src: '/fonts/speaker-pro/SpeakPro-Heavy.ttf',
})

const darkColor = '#585858'
const darkBg = '#f6eaf8'

const styles = StyleSheet.create({
    page: {
        paddingHorizontal: 0.75 * 72,
        paddingVertical: 0.4 * 72,
        fontFamily: 'Calibri Regular',
        lineHeight: 0.8,
        color: darkColor,
    },
    header: {
        marginBottom: 20,
    },
    name: {
        fontFamily: 'Speaker Pro Heavy',
        fontSize: 35,
        textAlign: 'center',
        color: 'black',
        backgroundColor: darkBg,
        lineHeight: 1.2,
        padding: 4,
    },
    contact: {
        textAlign: 'center',
        fontSize: 11,
        marginTop: 12,
    },
    linkedin: {
        textAlign: 'center',
        fontSize: 10,
    },
    summary: {
        fontSize: 11,
        marginBottom: 8,
        textIndent: 4,
    },
    section: {
        marginBottom: 15,
    },
    flex: {
        display: 'flex',
        flexDirection: 'row',
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Speaker Pro Heavy',
        fontWeight: 'bold',
        color: 'black',
        marginBottom: 8,
        lineHeight: 1.2,
        backgroundColor: darkBg,
    },
    experienceTitle: {
        fontSize: 11,
    },
    experiencePosition: {
        fontFamily: 'Calibri Bold',
        fontSize: 11,
    },
    experienceSkills: {
        marginTop: 3,
        marginBottom: 12,
        fontSize: 10,
    },
    experienceSkillTitle: {
        fontFamily: 'Calibri Bold',
        fontSize: 11,
    },
    skillSet: {
        fontSize: 11,
        marginBottom: 2,
    },
    skillType: {
        fontFamily: 'Calibri Bold',
    },
    education: {
        fontSize: 11,
    },
    degree: {
        fontSize: 11,
        fontFamily: 'Calibri Bold',
    },
    description: {
        marginLeft: 4,
        fontSize: 10,
        marginTop: 3,
    },
})

export default styles
