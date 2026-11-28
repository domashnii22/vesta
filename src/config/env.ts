import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z
    .string()
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      'DATABASE_URL must be a postgres:// connection string',
    ),
  ALICE_SKILL_ID: z.string().min(1).optional(),
  VK_GROUP_TOKEN: z.string().min(1).optional(),
  VK_GROUP_ID: z.coerce.number().int().positive().optional(),
  VK_API_BASE_URL: z.string().url().default('https://api.vk.com'),
  VK_ALLOWED_PEER_IDS: z
    .string()
    .regex(/^\d+(,\d+)*$/, 'VK_ALLOWED_PEER_IDS must be comma-separated peer ids')
    .optional(),
}).refine((env) => (env.VK_GROUP_TOKEN === undefined) === (env.VK_GROUP_ID === undefined), {
  message: 'VK_GROUP_TOKEN and VK_GROUP_ID must be set together',
  path: ['VK_GROUP_TOKEN'],
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
