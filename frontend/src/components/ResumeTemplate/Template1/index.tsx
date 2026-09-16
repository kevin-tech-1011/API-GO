import React from 'react'
import { Document, Page, Text, View, Link, Image } from '@react-pdf/renderer'
import styles from './styles'
import { type TResume } from '@/types'
import renderBoldText from '@/utils/renderBoldText'

export default function Template1({ profile, backgroundId, showLinkedin = true }: { profile: TResume | null, backgroundId?: number, showLinkedin?: boolean }) {
    if (!profile) return null

    return (
        <Document
            creator="Microsoft® Word 365"
            producer="Microsoft® Word 365"
            language='English'
            title={profile.name + ' - Resume'}
            author={profile.name}
            creationDate={new Date(Date.now() - 1000 * 60 * 60 * 24 * 60)}
        >
            <Page size="LETTER" style={styles.page}>
                <View fixed={true} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }}>
                    <Image
                        src={`/resume-background/pattern${backgroundId}.jpg`}
                        style={{
                            position: 'absolute',
                            minWidth: '100%',
                            minHeight: '100%',
                            height: '100%',
                            width: '100%',
                            top: 0,
                            left: 0,
                            opacity: 0.3,
                        }}
                    />
                </View>

                <View style={styles.header}>
                    <Text style={styles.name}>{profile.name}</Text>
                    <Text style={styles.title}>{profile.title}</Text>
                    <Text
                        style={styles.contact}
                    >
                        {profile.location ? `${profile.location} | ` : ''}
                        {profile.phone ? `${profile.phone} | ` : ''}
                        {`${profile.email}`}
                    </Text>
                    {
                        showLinkedin && profile.linkedin && (
                            <Link href={profile.linkedin} style={styles.linkedin}>{profile.linkedin}</Link>
                        )
                    }
                </View>

                <View style={styles.section}>
                    <Text style={styles.summary}>
                        {renderBoldText(profile.summary)}
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Professional Experience
                    </Text>
                    {profile.experience.map((exp, key) => (
                        <React.Fragment key={key}>
                            <View style={styles.experienceTitle}>
                                <Text>{exp.company}</Text>
                                <Text>
                                    {exp.startDate} - {exp.endDate || 'Present'}
                                </Text>
                            </View>
                            <View>
                                <Text style={styles.experiencePosition}>
                                    {exp.position}
                                </Text>
                                <Text style={styles.experienceSummary}>
                                    {renderBoldText(exp.summary)}
                                </Text>
                            </View>
                            {exp.description.map((item, key) => (
                                <Text style={styles.description} key={key}>
                                    • {renderBoldText(item)}
                                </Text>
                            ))}
                            <Text style={styles.experienceSkills}>
                                <Text style={{ fontFamily: 'Calibri Bold' }}>Skills:  </Text>
                                {
                                    exp.skills.map((skill, idx) => (
                                        <React.Fragment key={idx}>
                                            {skill}
                                            {idx < exp.skills.length - 1 ? ', ' : ''}
                                        </React.Fragment>
                                    ))
                                }
                            </Text>
                        </React.Fragment>
                    ))}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Education</Text>
                    {profile.education.map((edu, key) => (
                        <View key={key}>
                            <View style={styles.education}>
                                <Text>{edu.school}</Text>
                                <Text>
                                    {edu.startDate} - {edu.endDate || 'Present'}
                                </Text>
                            </View>
                            <View style={styles.degree}>
                                <Text>
                                    {edu.degree} in {edu.field}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Professional Skills</Text>
                    {profile.skills.map((skill, key) => (
                        <View key={key} style={styles.skillSet}>
                            <Text>
                                <Text
                                    style={{
                                        fontFamily: 'Calibri Bold',
                                    }}
                                >
                                    • {skill.category}:
                                </Text>
                                {skill.list.map((item, idx) => (
                                    <React.Fragment key={idx}>
                                        {' '}
                                        {item}
                                        {idx < skill.list.length - 1 ? ',' : ''}
                                    </React.Fragment>
                                ))}
                            </Text>
                        </View>
                    ))}
                </View>
            </Page>
        </Document>
    )
}
