import { registerAs } from '@nestjs/config';
import { envSchema } from './env';

export interface AppConfigProperties {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  databaseUrl: string;
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
      isProduction: env.NODE_ENV === 'production',
      isDevelopment: env.NODE_ENV === 'development',
      isTest: env.NODE_ENV === 'test',
    };
  },
);
