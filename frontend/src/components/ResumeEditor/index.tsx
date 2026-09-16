import { Button, Collapse, Input, Select } from 'antd'
import type { CollapseProps } from 'antd'
import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    DeleteOutlined,
    PlusOutlined,
} from '@ant-design/icons'

import { TEducation, TExperience, TResume, TSkills } from '@/types'

const { TextArea } = Input

interface ResumeEditorProps {
    value: TResume
    onChange: (next: TResume) => void
}

/** Immutable array helpers — never mutate props. */
const removeAt = <T,>(arr: T[], index: number): T[] =>
    arr.slice(0, index).concat(arr.slice(index + 1))

const replaceAt = <T,>(arr: T[], index: number, item: T): T[] =>
    arr.map((el, i) => (i === index ? item : el))

const moveItem = <T,>(arr: T[], index: number, dir: -1 | 1): T[] => {
    const to = index + dir
    if (to < 0 || to >= arr.length) return arr
    const next = arr.slice()
    const tmp = next[index]
    next[index] = next[to]
    next[to] = tmp
    return next
}

const emptyExperience = (): TExperience => ({
    company: '',
    position: '',
    summary: '',
    description: [''],
    skills: [],
    startDate: '',
    endDate: '',
})

const emptyEducation = (): TEducation => ({
    school: '',
    degree: '',
    field: '',
    startDate: '',
    endDate: '',
})

const emptySkill = (): TSkills => ({ category: '', list: [] })

const labelClass =
    'mb-1 block text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500'

const Field = ({
    label,
    className,
    children,
}: {
    label: string
    className?: string
    children: React.ReactNode
}): JSX.Element => (
    <div className={className}>
        <span className={labelClass}>{label}</span>
        {children}
    </div>
)

/** Header for a removable/reorderable list card (Experience / Education / Skill). */
const ItemToolbar = ({
    title,
    index,
    count,
    onMove,
    onRemove,
}: {
    title: string
    index: number
    count: number
    onMove: (dir: -1 | 1) => void
    onRemove: () => void
}): JSX.Element => (
    <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">
            {title} {index + 1}
        </span>
        <div className="flex items-center gap-1">
            <Button
                size="small"
                type="text"
                icon={<ArrowUpOutlined />}
                disabled={index === 0}
                onClick={() => onMove(-1)}
                aria-label="Move up"
            />
            <Button
                size="small"
                type="text"
                icon={<ArrowDownOutlined />}
                disabled={index === count - 1}
                onClick={() => onMove(1)}
                aria-label="Move down"
            />
            <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={onRemove}
                aria-label="Remove"
            />
        </div>
    </div>
)

const cardClass =
    'rounded-xl border border-slate-200/80 bg-white/70 p-3 sm:p-4'

const ResumeEditor: React.FC<ResumeEditorProps> = ({ value, onChange }) => {
    const experience = value.experience ?? []
    const education = value.education ?? []
    const skills = value.skills ?? []

    const patch = (fields: Partial<TResume>) => onChange({ ...value, ...fields })

    // ---- Experience ----------------------------------------------------------
    const setExperience = (next: TExperience[]) => patch({ experience: next })
    const updateExperience = (index: number, fields: Partial<TExperience>) =>
        setExperience(
            replaceAt(experience, index, { ...experience[index], ...fields })
        )

    // ---- Education -----------------------------------------------------------
    const setEducation = (next: TEducation[]) => patch({ education: next })
    const updateEducation = (index: number, fields: Partial<TEducation>) =>
        setEducation(
            replaceAt(education, index, { ...education[index], ...fields })
        )

    // ---- Skills --------------------------------------------------------------
    const setSkills = (next: TSkills[]) => patch({ skills: next })
    const updateSkill = (index: number, fields: Partial<TSkills>) =>
        setSkills(replaceAt(skills, index, { ...skills[index], ...fields }))

    const contactSection = (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name">
                <Input
                    value={value.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Full name"
                />
            </Field>
            <Field label="Job title">
                <Input
                    value={value.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="e.g. Senior Developer"
                />
            </Field>
            <Field label="Email">
                <Input
                    value={value.email}
                    onChange={(e) => patch({ email: e.target.value })}
                    placeholder="name@example.com"
                />
            </Field>
            <Field label="Phone">
                <Input
                    value={value.phone}
                    onChange={(e) => patch({ phone: e.target.value })}
                    placeholder="(555) 555-5555"
                />
            </Field>
            <Field label="Location">
                <Input
                    value={value.location}
                    onChange={(e) => patch({ location: e.target.value })}
                    placeholder="City, State"
                />
            </Field>
            <Field label="LinkedIn URL">
                <Input
                    value={value.linkedin}
                    onChange={(e) => patch({ linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/…"
                />
            </Field>
        </div>
    )

    const summarySection = (
        <Field label="Professional summary">
            <TextArea
                value={value.summary}
                onChange={(e) => patch({ summary: e.target.value })}
                autoSize={{ minRows: 4, maxRows: 12 }}
                placeholder="A concise professional summary…"
            />
            <p className="mt-1 text-xs text-slate-400">
                Wrap text in <code>**double asterisks**</code> to make it bold in
                the PDF.
            </p>
        </Field>
    )

    const experienceSection = (
        <div className="flex flex-col gap-3">
            {experience.map((exp, index) => (
                <div key={index} className={cardClass}>
                    <ItemToolbar
                        title="Experience"
                        index={index}
                        count={experience.length}
                        onMove={(dir) =>
                            setExperience(moveItem(experience, index, dir))
                        }
                        onRemove={() =>
                            setExperience(removeAt(experience, index))
                        }
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Company">
                            <Input
                                value={exp.company}
                                onChange={(e) =>
                                    updateExperience(index, {
                                        company: e.target.value,
                                    })
                                }
                                placeholder="Company name"
                            />
                        </Field>
                        <Field label="Position">
                            <Input
                                value={exp.position}
                                onChange={(e) =>
                                    updateExperience(index, {
                                        position: e.target.value,
                                    })
                                }
                                placeholder="Job title"
                            />
                        </Field>
                        <Field label="Start date">
                            <Input
                                value={exp.startDate}
                                onChange={(e) =>
                                    updateExperience(index, {
                                        startDate: e.target.value,
                                    })
                                }
                                placeholder="e.g. Jan 2022"
                            />
                        </Field>
                        <Field label="End date">
                            <Input
                                value={exp.endDate}
                                onChange={(e) =>
                                    updateExperience(index, {
                                        endDate: e.target.value,
                                    })
                                }
                                placeholder="e.g. Present"
                            />
                        </Field>
                    </div>

                    <Field label="Role summary" className="mt-3">
                        <TextArea
                            value={exp.summary}
                            onChange={(e) =>
                                updateExperience(index, {
                                    summary: e.target.value,
                                })
                            }
                            autoSize={{ minRows: 2, maxRows: 8 }}
                            placeholder="Short overview of this role…"
                        />
                    </Field>

                    <div className="mt-3">
                        <span className={labelClass}>Highlights</span>
                        <div className="flex flex-col gap-2">
                            {(exp.description ?? []).map((bullet, bIndex) => (
                                <div
                                    key={bIndex}
                                    className="flex items-start gap-2"
                                >
                                    <TextArea
                                        value={bullet}
                                        onChange={(e) =>
                                            updateExperience(index, {
                                                description: replaceAt(
                                                    exp.description ?? [],
                                                    bIndex,
                                                    e.target.value
                                                ),
                                            })
                                        }
                                        autoSize={{ minRows: 1, maxRows: 6 }}
                                        placeholder="Accomplishment or responsibility…"
                                    />
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() =>
                                            updateExperience(index, {
                                                description: removeAt(
                                                    exp.description ?? [],
                                                    bIndex
                                                ),
                                            })
                                        }
                                        aria-label="Remove highlight"
                                    />
                                </div>
                            ))}
                        </div>
                        <Button
                            type="dashed"
                            size="small"
                            icon={<PlusOutlined />}
                            className="mt-2"
                            onClick={() =>
                                updateExperience(index, {
                                    description: [
                                        ...(exp.description ?? []),
                                        '',
                                    ],
                                })
                            }
                        >
                            Add highlight
                        </Button>
                    </div>

                    <Field label="Skills used" className="mt-3">
                        <Select
                            mode="tags"
                            value={exp.skills ?? []}
                            onChange={(next: string[]) =>
                                updateExperience(index, { skills: next })
                            }
                            tokenSeparators={[',']}
                            notFoundContent={null}
                            placeholder="Type a skill and press Enter"
                            className="w-full"
                        />
                    </Field>
                </div>
            ))}
            <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setExperience([...experience, emptyExperience()])}
            >
                Add experience
            </Button>
        </div>
    )

    const educationSection = (
        <div className="flex flex-col gap-3">
            {education.map((edu, index) => (
                <div key={index} className={cardClass}>
                    <ItemToolbar
                        title="Education"
                        index={index}
                        count={education.length}
                        onMove={(dir) =>
                            setEducation(moveItem(education, index, dir))
                        }
                        onRemove={() => setEducation(removeAt(education, index))}
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="School" className="sm:col-span-2">
                            <Input
                                value={edu.school}
                                onChange={(e) =>
                                    updateEducation(index, {
                                        school: e.target.value,
                                    })
                                }
                                placeholder="University / School"
                            />
                        </Field>
                        <Field label="Degree">
                            <Input
                                value={edu.degree}
                                onChange={(e) =>
                                    updateEducation(index, {
                                        degree: e.target.value,
                                    })
                                }
                                placeholder="e.g. Bachelor of Science"
                            />
                        </Field>
                        <Field label="Field of study">
                            <Input
                                value={edu.field}
                                onChange={(e) =>
                                    updateEducation(index, {
                                        field: e.target.value,
                                    })
                                }
                                placeholder="e.g. Computer Science"
                            />
                        </Field>
                        <Field label="Start date">
                            <Input
                                value={edu.startDate}
                                onChange={(e) =>
                                    updateEducation(index, {
                                        startDate: e.target.value,
                                    })
                                }
                                placeholder="e.g. 2018"
                            />
                        </Field>
                        <Field label="End date">
                            <Input
                                value={edu.endDate}
                                onChange={(e) =>
                                    updateEducation(index, {
                                        endDate: e.target.value,
                                    })
                                }
                                placeholder="e.g. 2022"
                            />
                        </Field>
                    </div>
                </div>
            ))}
            <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setEducation([...education, emptyEducation()])}
            >
                Add education
            </Button>
        </div>
    )

    const skillsSection = (
        <div className="flex flex-col gap-3">
            {skills.map((skill, index) => (
                <div key={index} className={cardClass}>
                    <ItemToolbar
                        title="Skill group"
                        index={index}
                        count={skills.length}
                        onMove={(dir) => setSkills(moveItem(skills, index, dir))}
                        onRemove={() => setSkills(removeAt(skills, index))}
                    />
                    <Field label="Category">
                        <Input
                            value={skill.category}
                            onChange={(e) =>
                                updateSkill(index, { category: e.target.value })
                            }
                            placeholder="e.g. Languages"
                        />
                    </Field>
                    <Field label="Skills" className="mt-3">
                        <Select
                            mode="tags"
                            value={skill.list ?? []}
                            onChange={(next: string[]) =>
                                updateSkill(index, { list: next })
                            }
                            tokenSeparators={[',']}
                            notFoundContent={null}
                            placeholder="Type a skill and press Enter"
                            className="w-full"
                        />
                    </Field>
                </div>
            ))}
            <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setSkills([...skills, emptySkill()])}
            >
                Add skill group
            </Button>
        </div>
    )

    const items: CollapseProps['items'] = [
        { key: 'contact', label: 'Contact & header', children: contactSection },
        { key: 'summary', label: 'Summary', children: summarySection },
        {
            key: 'experience',
            label: `Experience (${experience.length})`,
            children: experienceSection,
        },
        {
            key: 'education',
            label: `Education (${education.length})`,
            children: educationSection,
        },
        {
            key: 'skills',
            label: `Skills (${skills.length})`,
            children: skillsSection,
        },
    ]

    return (
        <Collapse
            items={items}
            defaultActiveKey={[
                'contact',
                'summary',
                'experience',
                'education',
                'skills',
            ]}
            className="bg-transparent"
        />
    )
}

export default ResumeEditor
