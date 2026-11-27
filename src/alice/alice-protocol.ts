import { z } from 'zod';

export const ALICE_TEXT_LIMIT = 1024;

export const aliceRequestSchema = z
  .object({
    version: z.string().min(1),
    session: z
      .object({
        session_id: z.string().min(1),
        skill_id: z.string().min(1),
        user_id: z.string().optional(),
        message_id: z.number().int().nonnegative().optional(),
        new: z.boolean().optional(),
      })
      .passthrough(),
    request: z
      .object({
        command: z.string().default(''),
        original_utterance: z.string().default(''),
        type: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type AliceRequest = z.infer<typeof aliceRequestSchema>;

export interface AliceResponse {
  version: string;
  response: {
    text: string;
    end_session: boolean;
  };
}

export function buildAliceResponse(version: string, text: string): AliceResponse {
  return {
    version,
    response: {
      text: truncateAliceText(text),
      end_session: false,
    },
  };
}

export function truncateAliceText(text: string): string {
  if (text.length <= ALICE_TEXT_LIMIT) {
    return text;
  }
  return `${text.slice(0, ALICE_TEXT_LIMIT - 1)}…`;
}
