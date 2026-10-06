import { useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { Difficulty } from '@/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Form';

export const DIFFICULTY_OPTIONS: [Difficulty, string][] = [
  [1, 'Gentle'],
  [2, 'Easy'],
  [3, 'Moderate'],
  [4, 'Hard'],
  [5, 'Very hard'],
];

/** Inline "add topic" row: name, hours, difficulty. Enter adds and keeps focus for the next one. */
export function TopicAdder({ subjectName, onAdd, busy }: { subjectName: string; onAdd: (t: { name: string; hours: number; difficulty: Difficulty }) => void | Promise<unknown>; busy?: boolean }) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('3');
  const [difficulty, setDifficulty] = useState<Difficulty>(3);
  const [error, setError] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    if (name.trim().length < 2) return setError('Name the topic, e.g. "Arrays".');
    if (!Number.isFinite(h) || h < 0.5 || h > 100) return setError('Hours must be between 0.5 and 100.');
    setError(undefined);
    await onAdd({ name: name.trim(), hours: h, difficulty });
    setName('');
    nameRef.current?.focus();
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-[1fr_96px] gap-2 sm:grid-cols-[1fr_96px_140px_auto]" noValidate aria-label={`Add a topic to ${subjectName}`}>
      <Field label="Topic name" hideLabel error={error} className="col-span-2 sm:col-span-1">
        <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Topic, e.g. Arrays" maxLength={60} />
      </Field>
      <label className="relative">
        <span className="sr-only">Estimated hours</span>
        <Input type="number" min={0.5} max={100} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="pr-7" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted" aria-hidden>
          h
        </span>
      </label>
      <label>
        <span className="sr-only">Difficulty</span>
        <Select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as Difficulty)}>
          {DIFFICULTY_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" variant="secondary" loading={busy} icon={<Plus className="h-4 w-4" />} className="col-span-2 h-11 sm:col-span-1">
        Add topic
      </Button>
    </form>
  );
}
