import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

/** An error with an HTTP status; the error handler turns it into `{ message }`. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found.`);

/** Wrap async route handlers so rejected promises reach the error handler. */
export const handler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Validate a request body; throws a 400 with a readable message. */
export function body<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, `${first.path.join('.') || 'body'}: ${first.message}`);
  }
  return parsed.data;
}

/** Final error handler: consistent `{ message }` JSON. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  void _next;
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message ?? 'Invalid request' });
  if (typeof err === 'object' && err && 'code' in err && (err as { code?: number }).code === 11000) {
    return res.status(409).json({ message: 'That already exists.' });
  }
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong on the server. Please try again.' });
}
