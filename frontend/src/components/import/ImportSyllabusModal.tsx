import { useEffect, useRef, useState } from 'react';
import { FileText, Sparkles, Star, Trash2, Upload, Wand2 } from 'lucide-react';
import type { Difficulty, ImportDraft } from '@/types';
import { importService } from '@/services';
import { useDataStore } from '@/store/useDataStore';
import { Modal } from '@/components/ui/Modal';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { DIFFICULTY_OPTIONS } from '@/components/subjects/TopicAdder';
import { cn, plural } from '@/lib/utils';

type Draft = Pick<ImportDraft, 'subjects' | 'exams'>;

const textareaClass =
  'w-full rounded-xl border border-line/15 bg-glass/[var(--glass-alpha)] px-3.5 py-3 text-sm text-ink placeholder:text-faint focus:border-cyan/60 focus:outline-none focus:ring-2 focus:ring-cyan/40';

/**
 * Syllabus / timetable import: upload a file or paste text → Orbit extracts
 * subjects, topics (units) and exam dates → the student reviews and edits → save.
 */
export function ImportSyllabusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const apply = useDataStore((s) => s.applyImport);
  const saving = useDataStore((s) => s.pending.import);
  const [ai, setAi] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [meta, setMeta] = useState<{ source: ImportDraft['source']; notes: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setText('');
    setError(undefined);
    setDraft(null);
    setMeta(null);
    void importService.aiAvailable().then(setAi);
  }, [open]);

  async function read() {
    setError(undefined);
    setReading(true);
    try {
      const res = await importService.extract({ text, file: file ?? undefined, ai });
      setDraft({ subjects: res.subjects, exams: res.exams });
      setMeta({ source: res.source, notes: res.notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that. Try pasting the text instead.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!draft) return;
    const subjects = draft.subjects.filter((s) => s.name.trim().length >= 2).map((s) => ({ ...s, topics: s.topics.filter((t) => t.name.trim().length >= 2) }));
    const unmatched = draft.exams.filter((e) => e.subjectIndex < 0 || e.subjectIndex >= subjects.length);
    if (unmatched.length) return setError(`Pick a subject for ${plural(unmatched.length, 'exam')} (or remove ${unmatched.length === 1 ? 'it' : 'them'}).`);
    if (await apply({ subjects, exams: draft.exams })) onClose();
  }

  const setSubject = (i: number, patch: Partial<Draft['subjects'][number]>) => setDraft((d) => d && { ...d, subjects: d.subjects.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setTopic = (i: number, k: number, patch: Partial<Draft['subjects'][number]['topics'][number]>) =>
    setSubject(i, { topics: draft!.subjects[i].topics.map((t, j) => (j === k ? { ...t, ...patch } : t)) });
  const removeSubject = (i: number) =>
    setDraft((d) => d && { subjects: d.subjects.filter((_, j) => j !== i), exams: d.exams.filter((e) => e.subjectIndex !== i).map((e) => ({ ...e, subjectIndex: e.subjectIndex > i ? e.subjectIndex - 1 : e.subjectIndex })) });
  const setExam = (i: number, patch: Partial<Draft['exams'][number]>) => setDraft((d) => d && { ...d, exams: d.exams.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const topicCount = draft?.subjects.reduce((a, s) => a + s.topics.length, 0) ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={draft ? 'Check what Orbit found' : 'Import a syllabus'}
      description={draft ? 'Fix anything that looks off. Units become topics; nothing is saved until you press Add.' : 'Upload your syllabus or exam timetable, or paste its text. Orbit pulls out subjects, units and exam dates for you.'}
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Back
            </Button>
            <Button icon={<Sparkles className="h-4 w-4" />} loading={saving} disabled={!draft.subjects.length} onClick={() => void save()}>
              Add {plural(draft.subjects.length, 'subject')}, {plural(topicCount, 'topic')} &amp; {plural(draft.exams.length, 'exam')}
            </Button>
          </>
        ) : (
          <Button icon={<Wand2 className="h-4 w-4" />} loading={reading} disabled={!file && !text.trim()} onClick={() => void read()}>
            Read syllabus
          </Button>
        )
      }
    >
      {!draft ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line/20 p-6 text-center transition-colors hover:border-violet/50 hover:bg-violet/[0.05]"
          >
            {file ? <FileText className="h-6 w-6 text-violet" aria-hidden /> : <Upload className="h-6 w-6 text-muted" aria-hidden />}
            <span className="text-sm font-medium text-ink">{file ? file.name : 'Drop a file here or click to choose'}</span>
            <span className="text-xs text-muted">{ai ? 'PDF (including scans), photo of a timetable, or text file' : 'PDF with selectable text, or a text file'} · up to 10 MB</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ai ? '.pdf,.png,.jpg,.jpeg,.webp,.txt,.md' : '.pdf,.txt,.md'}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            Or paste the text
            <textarea
              className={textareaClass}
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'CS301 Data Structures\nUnit 1: Introduction (8 hours)\nUnit 2: Linked lists [20 marks] — important\n…\nMid-term exam: 14 Nov 2026, 10 am'}
            />
          </label>
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {ai ? 'Read by Claude — works with scanned pages and photos too.' : "Read by Orbit's built-in parser. Headings like “Unit 1: …” and “Exam: 14 Nov” work best."}
          </p>
          {error && (
            <p className="text-sm text-rose" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {meta && (
            <div className="rounded-2xl border border-line/10 bg-line/[0.03] p-3 text-xs text-muted">
              <p className="font-medium text-ink">{meta.source === 'ai' ? 'Read by Claude' : 'Read by Orbit’s built-in parser'}</p>
              {meta.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}

          {draft.subjects.map((s, i) => (
            <section key={i} className="rounded-2xl border border-line/10 p-4">
              <div className="flex items-center gap-2">
                <Input aria-label="Subject name" value={s.name} maxLength={40} onChange={(e) => setSubject(i, { name: e.target.value })} className="font-semibold" />
                <IconButton size="sm" label={`Remove ${s.name}`} className="hover:text-rose" onClick={() => removeSubject(i)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {s.topics.map((t, k) => (
                  <li key={k} className="grid grid-cols-[1fr_72px_auto] items-center gap-2 sm:grid-cols-[1fr_72px_72px_120px_auto_auto]">
                    <Input aria-label="Topic name" value={t.name} maxLength={60} onChange={(e) => setTopic(i, k, { name: e.target.value })} className="col-span-3 h-9 sm:col-span-1" />
                    <label className="relative">
                      <span className="sr-only">Hours</span>
                      <Input type="number" min={0.5} max={100} step={0.5} value={t.estimatedHours} onChange={(e) => setTopic(i, k, { estimatedHours: Number(e.target.value) || 0.5 })} className="h-9 pr-6" />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">h</span>
                    </label>
                    <label className="relative" title="Exam weightage (marks or %)">
                      <span className="sr-only">Weightage</span>
                      <Input type="number" min={0} max={100} placeholder="—" value={t.weightage ?? ''} onChange={(e) => setTopic(i, k, { weightage: e.target.value ? Number(e.target.value) : undefined })} className="h-9 pr-6" />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">%</span>
                    </label>
                    <label className="hidden sm:block">
                      <span className="sr-only">Difficulty</span>
                      <Select value={t.difficulty} onChange={(e) => setTopic(i, k, { difficulty: Number(e.target.value) as Difficulty })} className="h-9 text-xs">
                        {DIFFICULTY_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <IconButton
                      size="sm"
                      label={t.frequentlyAsked ? 'Unmark frequently asked' : 'Mark as frequently asked'}
                      aria-pressed={!!t.frequentlyAsked}
                      onClick={() => setTopic(i, k, { frequentlyAsked: !t.frequentlyAsked })}
                      className={cn(t.frequentlyAsked && 'text-amber')}
                    >
                      <Star className="h-4 w-4" fill={t.frequentlyAsked ? 'currentColor' : 'none'} />
                    </IconButton>
                    <IconButton size="sm" label={`Remove ${t.name}`} className="hover:text-rose" onClick={() => setSubject(i, { topics: s.topics.filter((_, j) => j !== k) })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </li>
                ))}
                {s.topics.length === 0 && <li className="text-xs text-faint">No units found — you can add topics after importing.</li>}
              </ul>
            </section>
          ))}

          {draft.exams.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Exams</h3>
              <ul className="flex flex-col gap-2">
                {draft.exams.map((e, i) => (
                  <li key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_190px_160px_auto]">
                    <Input aria-label="Exam title" value={e.title} maxLength={80} onChange={(ev) => setExam(i, { title: ev.target.value })} className="h-9" />
                    <Input aria-label="Exam date and time" type="datetime-local" value={e.date.slice(0, 16)} onChange={(ev) => setExam(i, { date: ev.target.value })} className="h-9" />
                    <Select aria-label="Exam subject" value={e.subjectIndex} onChange={(ev) => setExam(i, { subjectIndex: Number(ev.target.value) })} className={cn('h-9 text-xs', e.subjectIndex < 0 && 'border-amber/60')}>
                      <option value={-1}>Pick a subject…</option>
                      {draft.subjects.map((s, j) => (
                        <option key={j} value={j}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    <IconButton size="sm" label={`Remove ${e.title}`} className="hover:text-rose" onClick={() => setDraft((d) => d && { ...d, exams: d.exams.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-faint">Tip: the ★ marks topics that are frequently asked in previous-year papers, and % is their exam weightage. Orbit gives both extra priority.</p>
          {error && (
            <p className="text-sm text-rose" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
