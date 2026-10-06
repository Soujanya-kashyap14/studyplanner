import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function signToken(user: { _id: unknown; email: string }) {
  return jwt.sign({ sub: String(user._id), email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as SignOptions);
}

/** Requires `Authorization: Bearer <JWT>`; sets req.userId. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Please sign in.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
    if (!payload.sub) throw new Error('no subject');
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}
