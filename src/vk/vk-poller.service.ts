import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { VkApiClient, VkLongPollServer } from './vk-api.client';
import { VkUpdateHandler } from './vk-update.handler';

const LONG_POLL_WAIT_SEC = 25;
const ERROR_BACKOFF_INITIAL_MS = 1_000;
const ERROR_BACKOFF_MAX_MS = 30_000;

@Injectable()
export class VkPollerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private running = false;
  private abortController?: AbortController;
  private pollPromise?: Promise<void>;

  constructor(
    private readonly client: VkApiClient,
    private readonly handler: VkUpdateHandler,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VkPollerService.name);
  }

  onApplicationBootstrap(): void {
    if (!this.client.enabled) {
      this.logger.info('vk poller disabled: VK_GROUP_TOKEN is not set');
      return;
    }
    this.running = true;
    this.abortController = new AbortController();
    this.pollPromise = this.pollLoop(this.abortController.signal);
    this.logger.info('vk poller started');
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    this.abortController?.abort();
    await this.pollPromise?.catch(() => undefined);
  }

  private async pollLoop(signal: AbortSignal): Promise<void> {
    let server: VkLongPollServer | null = null;
    let backoffMs = ERROR_BACKOFF_INITIAL_MS;

    while (this.running) {
      try {
        server ??= await this.client.getLongPollServer();
        const response = await this.client.pollServer(
          server,
          LONG_POLL_WAIT_SEC,
          signal,
        );

        if (response.failed === 1) {
          server = { ...server, ts: response.ts ?? server.ts };
          continue;
        }
        if (response.failed === 2 || response.failed === 3) {
          this.logger.warn(
            { failed: response.failed },
            'vk long poll key expired, refreshing server',
          );
          server = null;
          continue;
        }

        backoffMs = ERROR_BACKOFF_INITIAL_MS;
        if (response.ts !== undefined) {
          server = { ...server, ts: response.ts };
        }

        for (const raw of response.updates ?? []) {
          try {
            const reply = await this.handler.handle(raw);
            if (reply !== null) {
              await this.client.sendMessage(reply.peerId, reply.text);
            }
          } catch (error) {
            this.logger.error({ err: error }, 'event handling failed');
          }
        }
      } catch (error) {
        if (!this.running || signal.aborted) {
          break;
        }
        this.logger.warn({ err: error, backoffMs }, 'polling failed, backing off');
        await sleep(backoffMs, signal);
        backoffMs = Math.min(backoffMs * 2, ERROR_BACKOFF_MAX_MS);
      }
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
