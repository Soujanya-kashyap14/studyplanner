/**
 * Realistic demo data, generated relative to "today" so every view looks
 * alive on first launch: 3 subjects, 15 topics, 2 exams, 2 assignments,
 * a week of completed/missed history, mood check-ins and a generated plan.
 */
import type { Availability, Exam, Assignment, MoodCheckIn, Snapshot, StudySession, Subject, Topic, Difficulty } from '@/types';
import { addDays, nowMinutes, todayISO } from '@/lib/date';
import { generatePlan } from '@/utils/scheduler';

const iso = (date: string, time: string) => `${date}T${time}:00`;

export function createSeed(sessionMinutes = 50, breakMinutes = 10): Snapshot {
  const today = todayISO();
  const created = iso(addDays(today, -21), '09:00');

  const subjects: Subject[] = [
    { id: 'sub_phy', name: 'Physics', color: '#8B7CFF', difficulty: 4, createdAt: created },
    { id: 'sub_calc', name: 'Calculus', color: '#38D9F5', difficulty: 3, createdAt: created },
    { id: 'sub_chem', name: 'Organic Chemistry', color: '#F472B6', difficulty: 5, createdAt: created },
  ];

  const t = (
    id: string,
    subjectId: string,
    name: string,
    difficulty: Difficulty,
    estimatedHours: number,
    completedHours: number,
    order: number,
  ): Topic => ({
    id,
    subjectId,
    name,
    difficulty,
    estimatedHours,
    completedHours,
    order,
    status: completedHours >= estimatedHours ? 'completed' : completedHours > 0 ? 'in_progress' : 'not_started',
    completedAt: completedHours >= estimatedHours ? iso(addDays(today, -6 + order), '18:00') : undefined,
  });

  const topics: Topic[] = [
    t('top_kin', 'sub_phy', 'Kinematics', 2, 3, 3, 0),
    t('top_newton', 'sub_phy', "Newton's Laws", 3, 3, 3, 1),
    t('top_work', 'sub_phy', 'Work & Energy', 3, 3, 1.5, 2),
    t('top_thermo', 'sub_phy', 'Thermodynamics', 5, 4, 0.8, 3),
    t('top_waves', 'sub_phy', 'Waves & Optics', 4, 3, 0, 4),
    t('top_elec', 'sub_phy', 'Electrostatics', 4, 3, 0, 5),
    t('top_limits', 'sub_calc', 'Limits & Continuity', 2, 2, 2, 0),
    t('top_deriv', 'sub_calc', 'Derivatives', 3, 3, 3, 1),
    t('top_integ', 'sub_calc', 'Integration Techniques', 4, 4, 2.5, 2),
    t('top_diffeq', 'sub_calc', 'Differential Equations', 5, 4, 0, 3),
    t('top_series', 'sub_calc', 'Series & Sequences', 4, 3, 0, 4),
    t('top_nomen', 'sub_chem', 'Nomenclature', 2, 2, 2, 0),
    t('top_stereo', 'sub_chem', 'Stereochemistry', 4, 3, 0.75, 1),
    t('top_mech', 'sub_chem', 'Reaction Mechanisms', 5, 4, 0, 2),
    t('top_spectro', 'sub_chem', 'Spectroscopy', 4, 3, 0, 3),
  ];

  const exams: Exam[] = [
    {
      id: 'exm_phy',
      subjectId: 'sub_phy',
      title: 'Physics Midterm',
      date: iso(addDays(today, 6), '09:00'),
      topicIds: ['top_kin', 'top_newton', 'top_work', 'top_thermo', 'top_waves', 'top_elec'],
      location: 'Hall B, Room 204',
    },
    {
      id: 'exm_calc',
      subjectId: 'sub_calc',
      title: 'Calculus Final',
      date: iso(addDays(today, 13), '14:00'),
      topicIds: ['top_limits', 'top_deriv', 'top_integ', 'top_diffeq', 'top_series'],
      location: 'Main Auditorium',
    },
  ];

  const assignments: Assignment[] = [
    { id: 'asg_calc', subjectId: 'sub_calc', title: 'Problem Set 4: Integration', dueDate: iso(addDays(today, 2), '23:59'), status: 'in_progress', topicId: 'top_integ' },
    { id: 'asg_chem', subjectId: 'sub_chem', title: 'Lab Report: Stereoisomers', dueDate: iso(addDays(today, 4), '17:00'), status: 'todo', topicId: 'top_stereo' },
  ];

  const availability: Availability = {
    weekly: [
      { weekday: 0, hours: 4, startTime: '10:00' },
      { weekday: 1, hours: 3, startTime: '16:00' },
      { weekday: 2, hours: 3, startTime: '16:00' },
      { weekday: 3, hours: 2, startTime: '17:00' },
      { weekday: 4, hours: 3, startTime: '16:00' },
      { weekday: 5, hours: 2.5, startTime: '15:00' },
      { weekday: 6, hours: 5, startTime: '10:00' },
    ],
    overrides: [
      { date: addDays(today, 8), hours: 1, startTime: '18:00', note: 'Family dinner' },
      { date: addDays(today, 10), hours: 0, startTime: '09:00', note: 'Hackathon — day off' },
    ],
  };

  // A week of history. Streak = 4 days, so finishing one session today unlocks "Supernova".
  const sub = (topicId: string) => topics.find((x) => x.id === topicId)!.subjectId;
  const h = (
    dayOffset: number,
    topicId: string,
    start: string,
    status: 'completed' | 'missed',
    actualMin?: number,
  ): StudySession => {
    const date = addDays(today, dayOffset);
    return {
      id: `hist_${dayOffset}_${topicId}`,
      topicId,
      subjectId: sub(topicId),
      date,
      start,
      durationMin: 50,
      status,
      source: 'auto',
      locked: true,
      actualMin: status === 'completed' ? (actualMin ?? 50) : undefined,
      completedAt: status === 'completed' ? iso(date, start) : undefined,
    };
  };
  const history: StudySession[] = [
    h(-7, 'top_kin', '16:00', 'completed'),
    h(-7, 'top_limits', '17:00', 'completed', 45),
    h(-6, 'top_newton', '16:00', 'completed'),
    h(-6, 'top_nomen', '17:00', 'completed'),
    h(-5, 'top_stereo', '16:00', 'missed'),
    h(-5, 'top_deriv', '17:00', 'missed'),
    h(-4, 'top_work', '16:00', 'completed'),
    h(-4, 'top_integ', '17:00', 'completed'),
    h(-3, 'top_thermo', '16:00', 'completed', 48),
    h(-3, 'top_stereo', '17:00', 'missed'),
    h(-2, 'top_integ', '10:00', 'completed'),
    h(-2, 'top_work', '11:00', 'completed'),
    h(-2, 'top_stereo', '12:00', 'completed', 45),
    h(-1, 'top_thermo', '16:00', 'missed'),
    h(-1, 'top_integ', '17:00', 'completed'),
  ];

  const moods: MoodCheckIn[] = [
    { date: addDays(today, -3), mood: 'okay', createdAt: iso(addDays(today, -3), '08:10') },
    { date: addDays(today, -2), mood: 'energized', createdAt: iso(addDays(today, -2), '08:30') },
    { date: addDays(today, -1), mood: 'drained', createdAt: iso(addDays(today, -1), '09:05') },
  ];

  const plan = generatePlan(
    {
      subjects,
      topics,
      exams,
      assignments,
      sessions: history,
      availability,
      today,
      nowMin: nowMinutes(),
      sessionMinutes,
      breakMinutes,
    },
    { includePastToday: true },
  );

  return {
    subjects,
    topics,
    exams,
    assignments,
    sessions: plan.sessions,
    availability,
    moods,
    changeLog: [],
    achievements: [
      { id: 'ach_calc_quiz', title: 'Scored 92% in the Calculus quiz', category: 'grades', date: addDays(today, -12), subjectId: 'sub_calc', result: '92%', createdAt: iso(addDays(today, -12), '18:00') },
      { id: 'ach_sem1', title: 'Passed all subjects in Semester 1', category: 'subjects', date: addDays(today, -60), result: 'CGPA 8.7', note: 'First semester done!', createdAt: iso(addDays(today, -60), '12:00') },
      { id: 'ach_olympiad', title: 'Physics Olympiad — regional round', category: 'award', date: addDays(today, -35), subjectId: 'sub_phy', result: '2nd place', createdAt: iso(addDays(today, -35), '15:00') },
    ],
  };
}
