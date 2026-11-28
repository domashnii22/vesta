import { registerAs } from '@nestjs/config';
import { envSchema } from './env';

export interface AppConfigProperties {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  databaseUrl: string;
  aliceSkillId?: string;
  vkGroupToken?: string;
  vkGroupId?: number;
  vkApiBaseUrl: string;
  vkAllowedPeerIds?: number[];
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

export default registerAs(
  'app',
  (): AppConfigProperties => {
    const env = envSchema.parse(process.env);
    return {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      logLevel: env.LOG_LEVEL,
      databaseUrl: env.DATABASE_URL,
      aliceSkillId: env.ALICE_SKILL_ID,
      vkGroupToken: env.VK_GROUP_TOKEN,
      vkGroupId: env.VK_GROUP_ID,
      vkApiBaseUrl: env.VK_API_BASE_URL,
      vkAllowedPeerIds: env.VK_ALLOWED_PEER_IDS?.split(',').map(Number),
      isProduction: env.NODE_ENV === 'production',
      isDevelopment: env.NODE_ENV === 'development',
      isTest: env.NODE_ENV === 'test',
    };
  },
);
