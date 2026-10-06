import type { DailyBriefing, Snapshot, User } from '@/types';
import { USE_MOCK } from '@/config/api';
import { http } from '@/lib/http';
import type { SchedulerInput } from '@/utils/scheduler';
import { buildRuleBriefing } from '@/utils/briefing';

export { buildRuleBriefing };

export const briefingService = {
  /**
   * ⚡ AI INTEGRATION PLACEHOLDER
   * GET /briefing/today
   * Later: the backend summarises the snapshot with an LLM (tone: warm, concise,
   * max ~3 sentences) and returns DailyBriefing with generatedBy: 'ai'.
   * For now we build it from rules on the client.
   */
  async generateDailyBriefing(snap: Snapshot, user: User | null, input: SchedulerInput): Promise<DailyBriefing> {
    if (!USE_MOCK) {
      try {
        return await http<DailyBriefing>('/briefing/today');
      } catch {
        /* fall back to rules if the AI endpoint is down */
      }
    }
    return buildRuleBriefing(snap, user, input);
  },
};
