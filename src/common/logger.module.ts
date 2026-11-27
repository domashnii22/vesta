import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import configuration, { AppConfigProperties } from '../config/configuration';

type AppConfigService = ConfigService<{ app: AppConfigProperties }, true>;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile:
        process.env.NODE_ENV === 'test' || process.env.IGNORE_ENV_FILE === 'true',
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const isProduction = config.get('app.isProduction', { infer: true });
        return {
          pinoHttp: {
            level: config.get('app.logLevel', { infer: true }),
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      translateTime: 'HH:MM:ss Z',
                      ignore: 'pid,hostname',
                      singleLine: true,
                    },
                  },
                }),
            genReqId: (req, res): string => {
              const id =
                (req.headers['x-request-id'] as string | undefined) ??
                randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers["x-telegram-bot-api-secret-token"]',
                'req.headers["set-cookie"]',
                'res.headers["set-cookie"]',
                'body.password',
                'body.token',
                'body.apiKey',
              ],
              censor: '[redacted]',
            },
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
