import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigProperties } from '../config/configuration';

const VK_API_VERSION = '5.199';
const REQUEST_TIMEOUT_MS = 15_000;
const LONG_POLL_EXTRA_TIMEOUT_MS = 10_000;

export interface VkLongPollServer {
  server: string;
  key: string;
  ts: string;
}

export interface VkLongPollResponse {
  ts?: string;
  updates?: unknown[];
  failed?: number;
}

@Injectable()
export class VkApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly groupId?: number;

  constructor(
    config: ConfigService<{ app: AppConfigProperties }, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VkApiClient.name);
    this.baseUrl = config.get('app.vkApiBaseUrl', { infer: true });
    this.token = config.get('app.vkGroupToken', { infer: true });
    this.groupId = config.get('app.vkGroupId', { infer: true });
  }

  get enabled(): boolean {
    return this.token !== undefined && this.groupId !== undefined;
  }

  async getLongPollServer(): Promise<VkLongPollServer> {
    const result = (await this.call('groups.getLongPollServer', {
      group_id: this.groupId,
    })) as VkLongPollServer;
    return result;
  }

  async sendMessage(peerId: number, text: string): Promise<void> {
    await this.call('messages.send', {
      peer_id: peerId,
      message: text,
      random_id: randomInt(1, 2_147_483_647),
    });
  }

  async pollServer(
    server: VkLongPollServer,
    waitSec: number,
    signal: AbortSignal,
  ): Promise<VkLongPollResponse> {
    const url =
      `${server.server}?act=a_check&key=${encodeURIComponent(server.key)}` +
      `&ts=${encodeURIComponent(server.ts)}&wait=${waitSec}`;
    const response = await fetch(url, {
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(waitSec * 1000 + LONG_POLL_EXTRA_TIMEOUT_MS),
      ]),
    });
    if (!response.ok) {
      this.logger.warn({ status: response.status }, 'vk long poll http error');
      throw new Error(`VK long poll failed with status ${response.status}`);
    }
    return (await response.json()) as VkLongPollResponse;
  }

  private async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.token === undefined) {
      throw new Error('VK group token is not configured');
    }
    const body = new URLSearchParams({
      access_token: this.token,
      v: VK_API_VERSION,
    });
    for (const [key, value] of Object.entries(params)) {
      body.set(key, String(value));
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/method/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn({ method }, 'vk api request failed');
      throw error;
    }
    if (!response.ok) {
      this.logger.warn({ method, status: response.status }, 'vk api http error');
      throw new Error(`VK API ${method} failed with status ${response.status}`);
    }
    const payload = (await response.json()) as {
      response?: unknown;
      error?: { error_code: number; error_msg: string };
    };
    if (payload.error !== undefined) {
      this.logger.warn(
        { method, errorCode: payload.error.error_code },
        'vk api returned an error',
      );
      throw new Error(
        `VK API ${method} error ${payload.error.error_code}: ${payload.error.error_msg}`,
      );
    }
    return payload.response;
  }
}
