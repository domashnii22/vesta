import { z } from 'zod';

export const vkMessageNewEventSchema = z
  .object({
    type: z.literal('message_new'),
    object: z
      .object({
        message: z
          .object({
            id: z.number().int().optional(),
            peer_id: z.number().int(),
            from_id: z.number().int().optional(),
            text: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export type VkMessageNewEvent = z.infer<typeof vkMessageNewEventSchema>;
