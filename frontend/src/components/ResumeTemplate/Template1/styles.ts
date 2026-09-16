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
    family: 'Arial Rounded MT Bold',
    src: '/fonts/arial-rounded-mt-bold/arialroundedmtbold.ttf',
})

const styles = StyleSheet.create({
    page: {
        paddingHorizontal: 0.75 * 72,
        paddingVertical: 0.4 * 72,
        fontFamily: 'Calibri Regular',
        lineHeight: 0.8,
    },
    header: {
        marginBottom: 11,
    },
    name: {
        fontFamily: 'Arial Rounded MT Bold',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
    },
    title: {
        fontFamily: 'Arial Rounded MT Bold',
        fontSize: 11,
        color: '#424242',
        textAlign: 'center',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    contact: {
        textAlign: 'center',
        fontSize: 11,
        marginTop: 2,
    },
    linkedin: {
        marginTop: 2,
        textAlign: 'center',
        fontSize: 11,
        color: 'black',
        textDecoration: 'none',
        borderBottom: '1px solid black',
    },
    summary: {
        fontSize: 11,
        marginBottom: 8,
        textIndent: 4,
    },
    section: {
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 14,
        fontFamily: 'Arial Rounded MT Bold',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: 11,
        lineHeight: 1,
        textAlign: 'center',
        paddingBottom: 11,
        borderBottom: '1px solid black',
    },
    experienceTitle: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        fontSize: 12,
        fontWeight: 'bold',
    },
    skillSet: {
        fontSize: 11,
        marginBottom: 2,
    },
    experiencePosition: {
        fontFamily: 'Arial Rounded MT Bold',
        fontSize: 11,
        marginBottom: 4,
    },
    experienceSummary: {
        fontSize: 11,
    },
    education: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 11,
    },
    degree: {
        fontSize: 11,
    },
    description: {
        marginLeft: 4,
        fontSize: 11,
        marginTop: 3,
    },
    experienceSkills: {
        marginTop: 3,
        marginBottom: 11,
        fontSize: 11,
    },
})

export default styles
