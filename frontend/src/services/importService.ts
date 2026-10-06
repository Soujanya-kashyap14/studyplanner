import type { ImportDraft, MutationResponse } from '@/types';
import { USE_MOCK, MOCK_LATENCY } from '@/config/api';
import { delay, http, json } from '@/lib/http';
import { now } from '@/lib/clock';
import { todayISO } from '@/lib/date';
import { plural } from '@/lib/utils';
import { applyImport, parseSyllabus } from '@/utils/syllabus';
import { mockMutation } from './mock/mutation';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Text layer of a PDF, read in the browser (empty for scanned PDFs). pdf.js loads only when needed. */
async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild lines from the text items' vertical positions.
    let line = '';
    let lastY: number | null = null;
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = '';
      }
      line += (line && !line.endsWith(' ') ? ' ' : '') + item.str;
      lastY = y;
    }
    lines.push(line.trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }
  return pages.join('\n');
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });

const MEDIA: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export const importService = {
  /** GET /import/status — true when the server can read scans and photos (AI reader configured). */
  async aiAvailable(): Promise<boolean> {
    if (USE_MOCK) return false;
    try {
      return (await http<{ ai: boolean }>('/import/status')).ai;
    } catch {
      return false;
    }
  },

  /**
   * POST /import/extract  body: { text?, file? }
   * Reads a syllabus / timetable into a draft the student reviews. Nothing is saved.
   * Text files and text PDFs are read in the browser; the file itself is sent too
   * so the server's AI reader (when configured) can handle scans and photos.
   */
  async extract(input: { text?: string; file?: File; ai: boolean }): Promise<ImportDraft> {
    let text = input.text?.trim() ?? '';
    let file: { name: string; mediaType: string; data: string } | undefined;
    if (input.file) {
      if (input.file.size > MAX_FILE_BYTES) throw new Error('That file is over 10 MB. Try a smaller file or paste the text.');
      const ext = input.file.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'txt' || ext === 'md' || ext === 'csv' || input.file.type.startsWith('text/')) {
        text = `${text}\n${await input.file.text()}`.trim();
      } else if (MEDIA[ext]) {
        if (ext === 'pdf') {
          try {
            text = `${text}\n${await pdfText(input.file)}`.trim();
          } catch {
            /* unreadable text layer — the AI reader may still manage */
          }
        }
        if (input.ai) file = { name: input.file.name, mediaType: MEDIA[ext], data: await toBase64(input.file) };
        else if (!text) throw new Error(ext === 'pdf' ? 'This PDF has no readable text (it looks like a scan). Paste the syllabus text instead.' : 'Photos need the AI reader, which is not set up on this server. Paste the syllabus text instead.');
      } else {
        throw new Error('Use a PDF, an image (PNG/JPG) or a text file.');
      }
    }
    if (!text && !file) throw new Error('Upload a file or paste the syllabus text first.');
    const fileName = input.file?.name;
    if (!USE_MOCK) return http<ImportDraft>('/import/extract', { method: 'POST', ...json({ text: text || undefined, file, fileName }) });
    await delay(MOCK_LATENCY.write);
    return parseSyllabus(text, todayISO(), { fileName });
  },

  /** POST /import/apply  body: { subjects, exams } — adds everything, skipping duplicates. */
  async apply(draft: Pick<ImportDraft, 'subjects' | 'exams'>): Promise<MutationResponse> {
    if (!USE_MOCK) return http('/import/apply', { method: 'POST', ...json({ subjects: draft.subjects, exams: draft.exams }) });
    return mockMutation((snap) => {
      const c = applyImport(snap, draft, now().toISOString());
      if (!c.subjects && !c.topics && !c.exams) throw new Error('Everything in this import is already in Orbit.');
      return { explanation: [`Added ${plural(c.subjects, 'subject')}, ${plural(c.topics, 'topic')} and ${plural(c.exams, 'exam')}.`] };
    });
  },
};
