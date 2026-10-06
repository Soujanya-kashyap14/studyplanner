/**
 * SYLLABUS IMPORT — pure functions, shared by the browser and the API.
 *
 * - parseSyllabus(text): Orbit's built-in, offline reader. Finds subjects
 *   (course titles / codes), units or modules (→ topics, with lecture hours,
 *   marks weightage and "important" flags) and exam dates.
 * - applyImport(snapshot, draft): merges a reviewed draft into the student's data
 *   (existing subjects are matched by name; duplicate topics and exams are skipped).
 *
 * The API can instead ask Claude to read the file (scanned PDFs, photos); both
 * paths produce the same ImportDraft, which the student reviews before saving.
 */
import type { Difficulty, ImportDraft, ISODate, Snapshot } from '@/types';
import { addDays, pad } from '@/lib/date';
import { clamp, plural, SUBJECT_COLORS, uid } from '@/lib/utils';

type DraftSubject = ImportDraft['subjects'][number];
type DraftTopic = DraftSubject['topics'][number];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const UNIT_RE = /^(?:unit|module|chapter|part|section|block|topic)\s*[-–:#]?\s*([0-9]{1,2}|[ivxlc]{1,5})\b\s*[:.)\-–]*\s*(.*)$/i;
/** Numbered section headings in lecture notes: "2.1 Introduction", "3.4 : SNMP" (not "2.4.1" sub-sections). */
const SECTION_RE = /^(\d{1,2})\.(\d{1,2})\s*[:.)\-–]?\s+([A-Za-z(].{2,90})$/;
const SUBJECT_LABEL_RE = /^(?:subject|course(?:\s*(?:title|name))?|paper(?:\s*(?:title|name))?)\s*[:\-–]\s*(.+)$/i;
const COURSE_CODE_RE = /^([A-Z]{2,6}\s?-?\s?\d{2,4}[A-Z]?)\s*[:\-–|]?\s+([A-Za-z].{2,})$/;
/** A course code anywhere in a line, e.g. "[BCS701]" or "CS 301". */
const CODE_ANYWHERE_RE = /[[(]?\b[A-Z]{2,6}\s?-?\s?\d{2,4}[A-Z]?\b[\])]?/;
const EXAM_WORD_RE = /\b(exam(?:ination)?s?|test|mid[\s-]?term|mid[\s-]?sem|end[\s-]?sem(?:ester)?|finals?|quiz|viva|assessment|cia|internals?|sessional|practical)\b/i;
const IMPORTANT_RE = /\b(important|frequently asked|pyq|repeated|most asked|high[\s-]?weight(?:age)?)\b|★|\*\s*$/i;
const HOURS_RE = /\(?\s*(\d{1,2}(?:\.\d)?)\s*(?:hrs?|hours?|lectures?|periods?|l)\b\s*\)?/i;
const SKIP_SECTION_RE = /^(?:text\s?books?|references?|reference books?|suggested readings?|web (?:resources|links)|course (?:outcomes?|objectives?)|objectives?|outcomes?|prerequisites?|pre-requisites?|evaluation scheme|scheme of (?:evaluation|examination)|lab(?:oratory)? experiments?|list of experiments)\s*(?:[:\-–(].*)?$/i;
/** "Question Bank", "Module 2 Question Bank", "Important questions"… — read for frequently-asked hints, never a topic. */
const QUESTIONS_RE = /^(?:(?:module|unit|chapter)\s*[-–:#]?\s*(?:\d{1,2}|[ivxlc]{1,5})\s*[:.\-–]?\s*)?(?:question\s*bank|(?:important|previous[\s-]?years?|model|review|assignment|practice|sample)\s+questions?|questions?|exercises?|pyqs?)\b/i;
/** Page furniture: "Page 3", "3 of 24", "- 3 -". */
const PAGE_RE = /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*(?:of|\/)\s*\d+|-?\s*\d{1,3}\s*-?)$/i;
/** Marks: "15%", "20 marks", "(10 M)" — never a bare "2M" (that's usually a term like M2M). */
const MARKS_RE = /[([]\s*(\d{1,3})\s*(?:m|marks?|%)\s*[)\]]|\b(\d{1,3})\s*(?:%|marks?\b)/i;
const marksOf = (m: RegExpMatchArray) => clamp(Number(m[1] ?? m[2]), 1, 100);
const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'of', 'in', 'to', 'on', 'a', 'an', 'its', 'between', 'using', 'via', 'introduction', 'overview', 'basics', 'need', 'concepts', 'concept', 'part', 'what', 'how', 'why']);

const cleanName = (s: string, max: number) =>
  s
    .replace(HOURS_RE, '')
    .replace(MARKS_RE, '')
    .replace(IMPORTANT_RE, '')
    .replace(/\[\s*\]|\(\s*\)/g, '')
    .replace(/[\s:;,.\-–|*]+$/g, '')
    .replace(/^[\s:;,.\-–|*•·\d)]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
    .trim();

const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'vs', 'via', 'by', 'as', 'at', 'from']);
/** "HUMAN RESOURCE MANAGEMENT IN INDIA" → "Human Resource Management in India"; acronyms like HRM stay. */
const titleCase = (s: string) =>
  s !== s.toUpperCase() || !/[A-Z]/.test(s)
    ? s
    : s
        .split(' ')
        .map((w, i) => {
          if (/^[A-Z]{2,5}S?$/.test(w) && !/[AEIOU]/.test(w.replace(/S$/, ''))) return w; // HRM, SHRM, SDN
          if (/^[A-Z]{2,6}\d+[A-Z]?$/.test(w)) return w; // BCS703
          const lw = w.toLowerCase();
          if (i > 0 && SMALL_WORDS.has(lw)) return lw;
          return lw.replace(/^([^a-z]*)([a-z])/, (_, pre: string, c: string) => pre + c.toUpperCase());
        })
        .join(' ');

/* ---------------- headings in notes ---------------- */

const words = (l: string) => l.replace(/\(.*?\)/g, ' ').split(/\s+/).filter((w) => /[A-Za-z]/.test(w));

/** "SCOPE OF HRM", "HUMAN RESOURCE MANAGEMENT IN INDIA:" — not "A. TRADE UNIONS", "3. GUEST MODEL" or a cipher grid. */
function isCapsHeading(l: string): boolean {
  if (l.length < 4 || l.length > 60 || /[a-z]/.test(l) || /[=|]/.test(l) || UNIT_RE.test(l)) return false;
  if (/^(?:[A-Z]|\d{1,2})[.)]\s/.test(l)) return false;
  const w = words(l);
  // Real words only: no 16+ letter strings (cipher text) and no letter grids ("M O N A R C").
  if (w.some((x) => x.replace(/[^A-Za-z]/g, '').length > 15)) return false;
  return w.length >= 1 && w.length <= 8 && w.some((x) => x.replace(/[^A-Za-z]/g, '').length >= 4) && w.filter((x) => x.length === 1).length <= 1;
}

/** "Playfair Cipher", "Block Cipher Design Principles" — short, mostly capitalised, no sentence punctuation. */
function isTitleHeading(l: string): boolean {
  if (l.length < 4 || l.length > 60 || !/[a-z]{2}/.test(l) || /[.,;=|]$|[=|]/.test(l) || /:\s*\S/.test(l) || UNIT_RE.test(l)) return false;
  if (/^(?:\d+[.)]|[•o*\-–]\s|\(|figure|table|example|note\b|e\.g|key\b|cipher:|output|input)/i.test(l)) return false;
  const w = words(l);
  if (!w.length || w.length > 8 || w.reduce((a, x) => a + x.length, 0) / w.length < 3) return false;
  const capped = w.filter((x) => SMALL_WORDS.has(x.toLowerCase()) || /^[A-Z0-9]/.test(x)).length;
  return capped / w.length >= 0.8;
}

/** Topics shorter than this (words) are folded into the topic before them. */
const MIN_TOPIC_WORDS = 250;


/* ---------------- dates ---------------- */

/** Next occurrence of month/day on or after `today` when the year is missing. */
function withYear(month: number, day: number, year: number | undefined, today: ISODate): ISODate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let y = year ?? Number(today.slice(0, 4));
  if (y < 100) y += 2000;
  let iso = `${y}-${pad(month)}-${pad(day)}`;
  if (year === undefined && iso < today) iso = `${y + 1}-${pad(month)}-${pad(day)}`;
  return iso;
}

/** Find a date in a line. Numeric dates are read day-first (14/11/2026), as in most syllabi. */
export function findDate(line: string, today: ISODate): { date: ISODate; match: string } | null {
  let m = line.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const d = withYear(Number(m[2]), Number(m[3]), Number(m[1]), today);
    if (d) return { date: d, match: m[0] };
  }
  m = line.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (m) {
    const d = withYear(Number(m[2]), Number(m[1]), Number(m[3]), today);
    if (d) return { date: d, match: m[0] };
  }
  m = line.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}\\.?,?\\s*(\\d{4})?\\b`, 'i'));
  if (m) {
    const d = withYear(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]), m[3] ? Number(m[3]) : undefined, today);
    if (d) return { date: d, match: m[0] };
  }
  m = line.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?\\b`, 'i'));
  if (m) {
    const d = withYear(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]), m[3] ? Number(m[3]) : undefined, today);
    if (d) return { date: d, match: m[0] };
  }
  return null;
}

/** "10:30 am", "2 pm", "14:00" → 'HH:mm' (09:00 when no time is given). */
export function findTime(line: string): string {
  const m = line.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i) ?? line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m) return '09:00';
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return `${pad(clamp(h, 0, 23))}:${pad(clamp(min, 0, 59))}`;
}

/* ---------------- parser ---------------- */

interface Block {
  topic: DraftTopic;
  /** Comma-separated sub-topics seen (syllabus style). */
  items: number;
  /** Words of body text seen (lecture-notes style). */
  words: number;
  hoursGiven: boolean;
}

/** Hours to study a block: given hours, else from how much text it has. */
function estimateHours(b: Block): number {
  if (b.hoursGiven) return b.topic.estimatedHours;
  // Prose (lecture notes): about 300 words per study hour. Syllabus lists are short comma-separated items.
  const prose = b.words > 150 || (b.items > 0 && b.words / b.items > 6);
  if (prose) return clamp(Math.round((b.words / 300) * 2) / 2, 1, 8);
  return clamp(Math.round(Math.max(1, b.items) * 0.75 * 2) / 2, 2, 10);
}

/**
 * Lines repeated on many pages (running headers / footers) and page numbers.
 * Returns the cleaned lines and the most common header, which often names the course.
 */
function stripPageFurniture(lines: string[]): { lines: string[]; header?: string } {
  const shape = (l: string) => l.toLowerCase().replace(/\d+/g, '#');
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(shape(l), (counts.get(shape(l)) ?? 0) + 1);
  const repeated = (l: string) => l.length <= 120 && (counts.get(shape(l)) ?? 0) >= 3 && !SECTION_RE.test(l) && !/^\d{1,2}[.)]\s/.test(l);
  const header = [...counts.entries()]
    .filter(([s, n]) => n >= 3 && CODE_ANYWHERE_RE.test(lines.find((l) => shape(l) === s) ?? ''))
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => lines.find((l) => shape(l) === s))[0];
  const pageLine = (l: string) => PAGE_RE.test(l) || /^\d+\|?page(?:\d+)?$|^page\d+(?:of\d+)?$/i.test(l.replace(/\s+/g, ''));
  return { lines: lines.filter((l) => !pageLine(l) && !repeated(l)), header };
}

/** "Internet of Things [BCS701] MODULE 2" → "Internet of Things". */
const subjectFromHeader = (header: string) =>
  cleanName(
    header
      .replace(CODE_ANYWHERE_RE, ' ')
      .replace(/\b(?:module|unit|chapter|part)\s*[-–:#]?\s*(?:\d{1,2}|[ivxlc]{1,5})\b/gi, ' ')
      .replace(/\bpage\s*\d+/gi, ' ')
      .replace(/[|]/g, ' '),
    40,
  );

/**
 * Use a question bank: every topic a question asks about is starred as frequently
 * asked, and when questions carry marks ("7m", "10 marks") the topic's weightage
 * becomes its share of all question marks. A question matches a topic when it names
 * one of the topic's acronyms (SNMP, NFV…) or at least half of its key words.
 */
function scoreQuestions(subjects: DraftSubject[], lines: string[]): { flagged: number; weighted: number } {
  const qs: { text: string; marks: number }[] = [];
  for (const l of lines) {
    if (/^\d{1,3}\s*[.)]/.test(l) || !qs.length) qs.push({ text: l, marks: 0 });
    else qs[qs.length - 1].text += ` ${l}`;
  }
  for (const q of qs) q.marks = Number(q.text.match(/(\d{1,2})\s*m(?:arks?)?\s*[.)]?\s*$/i)?.[1] ?? 0);
  const totalMarks = qs.reduce((a, q) => a + q.marks, 0);
  const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));
  let flagged = 0;
  let weighted = 0;
  for (const s of subjects) {
    const own = new Set(s.name.toLowerCase().split(/\W+/));
    for (const t of s.topics) {
      const ws = t.name.split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()) && !own.has(w.toLowerCase()));
      const isAcronym = (w: string) => /^[A-Z][A-Z0-9]{2,}$/.test(w);
      const acronyms = ws.filter(isAcronym).map((w) => w.toLowerCase());
      const plain = ws.filter((w) => !isAcronym(w)).map((w) => stem(w.toLowerCase()));
      const asks = qs.filter(({ text }) => {
        const q = text.toLowerCase();
        if (acronyms.some((a) => new RegExp(`\\b${a}\\b`).test(q))) return true;
        const hits = plain.filter((p) => q.includes(p)).length;
        return plain.length > 0 && hits >= Math.max(1, Math.ceil(plain.length / 2));
      });
      if (!asks.length) continue;
      if (!t.frequentlyAsked) {
        t.frequentlyAsked = true;
        flagged++;
      }
      const marks = asks.reduce((a, q) => a + q.marks, 0);
      if (totalMarks > 0 && marks > 0 && t.weightage === undefined) {
        t.weightage = clamp(Math.round((100 * marks) / totalMarks), 1, 100);
        weighted++;
      }
    }
  }
  return { flagged, weighted };
}

/**
 * Read subjects, topics and exam dates from syllabus, timetable or lecture-notes text.
 * Understands "Unit 1: …" / "Module 2" syllabi, numbered sections ("2.3 SNMP") in
 * notes, running page headers, and question banks (→ frequently-asked flags).
 * Heuristic by design: the student reviews and edits the result before saving.
 */
export function parseSyllabus(text: string, today: ISODate, opts: { fileName?: string } = {}): ImportDraft {
  const rawLines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\t/g, ' | ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
  const { lines, header } = stripPageFurniture(rawLines);

  const subjects: DraftSubject[] = [];
  const exams: ImportDraft['exams'] = [];
  const questions: string[] = [];
  const notes: string[] = [];
  let current = null as DraftSubject | null;
  let unit = null as (Block & { sections: Block[]; synthetic: boolean }) | null;
  let section = null as Block | null;
  let pendingUnitName = false;
  let skippedPast = 0;
  /** 'ignore' inside "Text books" / "References"; 'questions' inside a question bank. */
  let mode: 'normal' | 'ignore' | 'questions' = 'normal';

  const finishUnit = () => {
    if (!unit || !current) {
      unit = null;
      section = null;
      return;
    }
    const subject = current;
    const at = subject.topics.indexOf(unit.topic);
    if (unit.sections.length >= 2 || unit.synthetic) {
      // Numbered sections are the real topics; the module heading just groups them.
      if (headingStyle) {
        // Headings in notes include many sub-headings: fold short ones into the topic before them.
        const merged: Block[] = [];
        for (const s of unit.sections) {
          const last = merged[merged.length - 1];
          if (last && (s.words < MIN_TOPIC_WORDS || last.words < MIN_TOPIC_WORDS)) {
            last.words += s.words;
            last.items += s.items;
            last.topic.frequentlyAsked ||= s.topic.frequentlyAsked;
          } else if (!last || last.topic.name.toLowerCase() !== s.topic.name.toLowerCase()) merged.push(s);
          else last.words += s.words;
        }
        unit.sections = merged;
      }
      for (const s of unit.sections) s.topic.estimatedHours = estimateHours(s);
      const sections = unit.sections.map((s) => s.topic);
      if (at >= 0) subject.topics.splice(at, 1, ...sections);
      else subject.topics.push(...sections);
    } else {
      for (const s of unit.sections) {
        unit.words += s.words;
        unit.items += s.items;
      }
      unit.topic.estimatedHours = estimateHours(unit);
      if (unit.topic.name.length < 2) unit.topic.name = `Unit ${subject.topics.length}`;
    }
    unit = null;
    section = null;
  };
  const startSubject = (name: string) => {
    finishUnit();
    const clean = titleCase(cleanName(name, 40));
    if (clean.length < 2) return;
    const existing = subjects.find((s) => s.name.toLowerCase() === clean.toLowerCase());
    current = existing ?? { name: clean, difficulty: 3, topics: [] };
    if (!existing) subjects.push(current);
  };
  const ensureSubject = () => {
    if (!current) startSubject('Imported subject');
    return current!;
  };

  // A running header like "Internet of Things [BCS701] MODULE 2" names the course; otherwise the file name might.
  if (header) startSubject(subjectFromHeader(header));
  const fileSubject = opts.fileName ? subjectFromHeader(opts.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\b(?:pdf|notes?|final|copy)\b/gi, ' ')) : '';

  // Lecture notes without numbered sections: use their heading style (ALL CAPS or Title Case lines) instead.
  const numbered = lines.filter((l) => SECTION_RE.test(l)).length;
  const totalWords = lines.reduce((a, l) => a + l.split(/\s+/).length, 0);
  const capsCount = lines.filter(isCapsHeading).length;
  const titleCount = lines.filter(isTitleHeading).length;
  const headingStyle: ((l: string) => boolean) | null =
    numbered >= 3 || totalWords < 1200 ? null : capsCount >= 4 ? isCapsHeading : titleCount >= 4 ? isTitleHeading : null;
  const fileCode = opts.fileName?.match(/\b[A-Za-z]{2,6}\s?-?\d{2,4}[A-Za-z]?\b/)?.[0].toUpperCase().replace(/[\s-]/g, '');
  if (headingStyle && !current) startSubject(fileSubject.length >= 2 ? fileSubject : fileCode ?? 'Imported subject');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Exam / timetable lines: a date plus an exam word or a known subject name.
    const date = findDate(line, today);
    const mentioned = subjects.findIndex((s) => line.toLowerCase().includes(s.name.toLowerCase()));
    if (date && mode !== 'questions' && (EXAM_WORD_RE.test(line) || mentioned >= 0)) {
      if (date.date < today) {
        skippedPast++;
        continue;
      }
      const subjectIndex = mentioned >= 0 ? mentioned : current ? subjects.indexOf(current) : -1;
      let title = cleanName(line.replace(date.match, '').replace(/\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi, '').replace(/\|/g, ' '), 80);
      for (let k = 0; k < 3; k++) title = title.replace(/[\s,|-]*\b(on|at|by|from|dated?)$/i, '').trim();
      if (title.length < 2) title = 'Exam';
      exams.push({ subjectIndex, title, date: `${date.date}T${findTime(line)}` });
      continue;
    }

    if (QUESTIONS_RE.test(line) && line.length <= 60) {
      finishUnit();
      mode = 'questions';
      continue;
    }
    if (SKIP_SECTION_RE.test(line)) {
      finishUnit();
      mode = 'ignore';
      continue;
    }

    // Headings in notes ("SCOPE OF HRM", "Playfair Cipher") → topics.
    if (headingStyle && mode !== 'questions' && headingStyle(line) && !(i > 0 && /^\d{1,2}[.)]\s/.test(lines[i - 1]) && line === line.toUpperCase())) {
      mode = 'normal';
      const name = titleCase(cleanName(line, 60));
      if (name.length >= 2) {
        if (!unit) unit = { topic: { name: '', estimatedHours: 4, difficulty: 3 }, items: 0, words: 0, hoursGiven: false, sections: [], synthetic: true };
        pendingUnitName = false;
        section = { topic: { name, estimatedHours: 3, difficulty: 3, ...(IMPORTANT_RE.test(line) ? { frequentlyAsked: true } : {}) }, items: 0, words: 0, hoursGiven: false };
        unit.sections.push(section);
        continue;
      }
    }

    // Subject headings.
    const label = line.match(SUBJECT_LABEL_RE);
    const code = line.match(COURSE_CODE_RE);
    if (label) {
      mode = 'normal';
      startSubject(label[1]);
      continue;
    }
    if (code && !UNIT_RE.test(line) && line.length <= 70) {
      mode = 'normal';
      startSubject(code[2]);
      continue;
    }
    // A plain title right before "Unit 1" / "Module I" starts a new subject (but not a unit's own body text).
    const nextUnit = i + 1 < lines.length ? lines[i + 1].match(UNIT_RE) : null;
    const nextIsUnit = !!nextUnit && (!unit || /^(1|i)$/i.test(nextUnit[1]));
    const caps = /^[A-Z][A-Z0-9 &,()'-]{2,58}$/.test(line) && /[A-Z]{3}/.test(line);
    if (!headingStyle && mode !== 'questions' && (caps || nextIsUnit) && !UNIT_RE.test(line) && !pendingUnitName && line.length <= 60 && !/[.:]$/.test(line) && (caps ? !current : !current || current.topics.length > 0)) {
      mode = 'normal';
      startSubject(line);
      continue;
    }

    // Units / modules → topics.
    const u = line.match(UNIT_RE);
    if (u) {
      mode = 'normal';
      finishUnit();
      const subject = ensureSubject();
      const hours = line.match(HOURS_RE);
      const marks = line.match(MARKS_RE);
      const name = cleanName(u[2], 60);
      const topic: DraftTopic = {
        name,
        estimatedHours: hours ? clamp(Number(hours[1]), 1, 20) : 4,
        difficulty: 3 as Difficulty,
        ...(marks ? { weightage: marksOf(marks) } : {}),
        ...(IMPORTANT_RE.test(line) ? { frequentlyAsked: true } : {}),
      };
      subject.topics.push(topic);
      unit = { topic, items: 0, words: 0, hoursGiven: !!hours, sections: [], synthetic: false };
      pendingUnitName = name.length < 2;
      continue;
    }

    // Numbered sections in notes ("2.3 Differences between IoT and M2M") → topics.
    const sec = mode !== 'questions' ? line.match(SECTION_RE) : null;
    if (sec) {
      mode = 'normal';
      const name = cleanName(sec[3], 60);
      if (name.length >= 2) {
        ensureSubject();
        if (!unit) unit = { topic: { name: '', estimatedHours: 4, difficulty: 3 }, items: 0, words: 0, hoursGiven: false, sections: [], synthetic: true };
        pendingUnitName = false;
        const marks = line.match(MARKS_RE);
        section = {
          topic: { name, estimatedHours: 3, difficulty: 3, ...(marks ? { weightage: marksOf(marks) } : {}), ...(IMPORTANT_RE.test(line) ? { frequentlyAsked: true } : {}) },
          items: 0,
          words: 0,
          hoursGiven: false,
        };
        unit.sections.push(section);
        continue;
      }
    }

    if (mode === 'questions') {
      questions.push(line);
      continue;
    }
    if (mode === 'ignore') continue;

    // Body text: the first line names an untitled unit; the rest are its sub-topics or notes.
    const block = section ?? unit;
    if (block && unit) {
      if (pendingUnitName && !section) {
        unit.topic.name = cleanName(line.split(/[,;:]/)[0], 60);
        pendingUnitName = false;
      }
      block.items += line.split(/[,;]|\s[–-]\s/).filter((x) => x.trim().length > 2).length;
      block.words += line.split(/\s+/).length;
      if (IMPORTANT_RE.test(line) && line.split(/\s+/).length <= 8) block.topic.frequentlyAsked = true;
      const marks = line.match(MARKS_RE);
      // A percentage inside notes is a statistic, not exam weightage: in notes only explicit "marks" count; in a syllabus, short lines too.
      if (marks && block.topic.weightage === undefined && block.words < 200 && (/marks?\b/i.test(line) || (!headingStyle && line.split(/\s+/).length <= 8))) block.topic.weightage = marksOf(marks);
      continue;
    }

    // Numbered / bulleted lists under a subject with no units.
    const bullet = line.match(/^(?:\d{1,2}[.)]|[-•·*])\s+(.{3,})$/);
    if (bullet && current) {
      const hours = line.match(HOURS_RE);
      current.topics.push({
        name: cleanName(bullet[1], 60),
        estimatedHours: hours ? clamp(Number(hours[1]), 1, 20) : 3,
        difficulty: 3,
        ...(IMPORTANT_RE.test(line) ? { frequentlyAsked: true } : {}),
      });
    }
  }
  finishUnit();

  const kept = subjects.filter((s) => s.topics.length > 0 || exams.some((e) => e.subjectIndex === subjects.indexOf(s)));
  const remap = new Map(subjects.map((s, i) => [i, kept.indexOf(s)]));
  const fixedExams = exams.map((e) => ({ ...e, subjectIndex: e.subjectIndex >= 0 ? remap.get(e.subjectIndex) ?? -1 : kept.length === 1 ? 0 : -1 }));
  const { flagged, weighted } = scoreQuestions(kept, questions);

  const topics = kept.reduce((a, s) => a + s.topics.length, 0);
  if (kept.length || fixedExams.length) notes.push(`Found ${plural(kept.length, 'subject')}, ${plural(topics, 'topic')} and ${plural(fixedExams.length, 'exam date')}.`);
  if (questions.length)
    notes.push(
      `Read the question bank: starred ${plural(flagged, 'topic')} it asks about${weighted ? ` and set weightage from question marks for ${plural(weighted, 'topic')}` : ''}.`,
    );
  if (skippedPast) notes.push(`Skipped ${plural(skippedPast, 'date')} already in the past.`);
  if (fixedExams.some((e) => e.subjectIndex < 0)) notes.push('Some exams could not be matched to a subject — pick one for each before saving.');
  if (!kept.length && !fixedExams.length) notes.push('Nothing recognisable found. Try pasting the syllabus text with "Unit 1: …" style headings, or use a clearer file.');

  return { subjects: kept, exams: fixedExams, source: 'rules', notes };
}

/* ---------------- merge ---------------- */

export interface ImportCounts {
  subjects: number;
  topics: number;
  exams: number;
}

/**
 * Merge a reviewed draft into the snapshot. Subjects are matched by name, topics
 * by name within their subject, exams by title + day. New exams cover every
 * topic of their subject. The plan is marked stale so the student regenerates it.
 */
export function applyImport(snap: Snapshot, draft: Pick<ImportDraft, 'subjects' | 'exams'>, createdAt: string): ImportCounts {
  const counts: ImportCounts = { subjects: 0, topics: 0, exams: 0 };
  const subjectIds: string[] = [];
  draft.subjects.forEach((ds, i) => {
    let subject = snap.subjects.find((s) => s.name.trim().toLowerCase() === ds.name.trim().toLowerCase());
    if (!subject) {
      subject = { id: uid('sub'), name: ds.name.trim().slice(0, 40), color: SUBJECT_COLORS[(snap.subjects.length + i) % SUBJECT_COLORS.length], difficulty: ds.difficulty, createdAt };
      snap.subjects.push(subject);
      counts.subjects++;
    }
    const subjectId = subject.id;
    subjectIds.push(subjectId);
    for (const dt of ds.topics) {
      const name = dt.name.trim().slice(0, 60);
      if (name.length < 2 || snap.topics.some((t) => t.subjectId === subjectId && t.name.toLowerCase() === name.toLowerCase())) continue;
      snap.topics.push({
        id: uid('top'),
        subjectId,
        name,
        difficulty: dt.difficulty,
        estimatedHours: clamp(dt.estimatedHours, 0.5, 100),
        completedHours: 0,
        status: 'not_started',
        order: snap.topics.filter((t) => t.subjectId === subjectId).length,
        ...(dt.weightage ? { weightage: clamp(dt.weightage, 0, 100) } : {}),
        ...(dt.frequentlyAsked ? { frequentlyAsked: true } : {}),
      });
      counts.topics++;
    }
  });
  for (const de of draft.exams) {
    const subjectId = subjectIds[de.subjectIndex];
    if (!subjectId) continue;
    const day = de.date.slice(0, 10);
    if (snap.exams.some((e) => e.subjectId === subjectId && e.date.slice(0, 10) === day && e.title.toLowerCase() === de.title.toLowerCase())) continue;
    snap.exams.push({ id: uid('exm'), subjectId, title: de.title.slice(0, 80), date: de.date.length === 16 ? `${de.date}:00` : de.date, topicIds: snap.topics.filter((t) => t.subjectId === subjectId).map((t) => t.id) });
    counts.exams++;
  }
  if (counts.subjects || counts.topics || counts.exams) snap.planStale = true;
  return counts;
}

/** Tomorrow, for draft defaults. */
export const draftDefaultDate = (today: ISODate) => `${addDays(today, 14)}T09:00`;
