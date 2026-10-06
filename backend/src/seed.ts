import bcrypt from 'bcryptjs';
import { createSeed } from '@/data/seed';
import { User } from './db/models';
import { emptySnapshot, persistDiff } from './db/snapshot';

export const DEMO_EMAIL = 'demo@orbit.app';
export const DEMO_PASSWORD = 'orbit123';

/** Create the demo account (with the sample universe) if it doesn't exist yet. */
export async function ensureDemoUser() {
  if (await User.exists({ email: DEMO_EMAIL })) return;
  const user = await User.create({ name: 'Maya Chen', email: DEMO_EMAIL, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) });
  const seed = createSeed(50, 10);
  await persistDiff(String(user._id), emptySnapshot(), seed);
  console.log(`  ✦ demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
