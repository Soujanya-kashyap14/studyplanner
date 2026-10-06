import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, type UserDoc } from '../db/models';
import { publicUser } from '../db/snapshot';
import { DEFAULT_AVAILABILITY } from '@/data/defaults';
import { requireAuth, signToken } from '../middleware/auth';
import { body, handler, HttpError } from '../lib/http';

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Mix letters and at least one number.');

/** POST /auth/register  { name, email, password } → { token, user } */
authRouter.post(
  '/auth/register',
  handler(async (req, res) => {
    const input = body(req, z.object({ name: z.string().trim().min(2, 'Name is a little short.').max(60), email, password }));
    if (await User.exists({ email: input.email })) throw new HttpError(409, 'An account with this email already exists.');
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      availability: DEFAULT_AVAILABILITY,
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user.toObject() as UserDoc) });
  }),
);

/** POST /auth/login  { email, password } → { token, user } */
authRouter.post(
  '/auth/login',
  handler(async (req, res) => {
    const input = body(req, z.object({ email, password: z.string().min(1, 'Password is required.') }));
    const user = await User.findOne({ email: input.email }).lean<UserDoc>();
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'That email and password don’t match an account.');
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

/** POST /auth/logout — JWTs are stateless; the client forgets the token. */
authRouter.post('/auth/logout', (_req, res) => {
  res.status(204).end();
});

/** GET /me */
authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const user = await User.findById(req.userId).lean<UserDoc>();
    if (!user) throw new HttpError(401, 'Your account no longer exists.');
    res.json(publicUser(user));
  }),
);

/** PATCH /me  { name?, email?, preferredSessionMinutes?, breakMinutes? } */
authRouter.patch(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const patch = body(
      req,
      z.object({
        name: z.string().trim().min(2).max(60).optional(),
        email: email.optional(),
        preferredSessionMinutes: z.number().int().min(15).max(180).optional(),
        breakMinutes: z.number().int().min(0).max(30).optional(),
      }),
    );
    if (patch.email && (await User.exists({ email: patch.email, _id: { $ne: req.userId } }))) throw new HttpError(409, 'That email is already used by another account.');
    const user = await User.findByIdAndUpdate(req.userId, { $set: patch }, { new: true }).lean<UserDoc>();
    if (!user) throw new HttpError(401, 'Your account no longer exists.');
    res.json(publicUser(user));
  }),
);
