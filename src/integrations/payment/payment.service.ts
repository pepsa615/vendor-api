import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly config: ConfigService) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = this.config.get<string>('PEPSA_PAYMENT_URL');
    const key = this.config.get<string>('PEPSA_PAYMENT_API_KEY');
    if (!base || !key)
      throw new ServiceUnavailableException('Payment service is unavailable');
    try {
      const response = await fetch(
        new URL(path.replace(/^\//, ''), `${base.replace(/\/$/, '')}/`),
        {
          ...init,
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-api-key': key,
            ...init.headers,
          },
          signal: AbortSignal.timeout(
            Number(this.config.get('PEPSA_PAYMENT_TIMEOUT_MS') ?? 5000),
          ),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new HttpException(
          body ?? { message: 'Payment request failed' },
          response.status,
        );
      return body as T;
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof HttpException
      )
        throw error;
      throw new BadGatewayException('Payment provider is unavailable');
    }
  }

  getWallet(userId: string) {
    return this.request<any>(`wallets/${userId}`);
  }
  createWallet(input: unknown, key: string) {
    return this.request<any>('wallets', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: JSON.stringify(input),
    });
  }
  async importKycDocument(input: {
    sourceUrl: string;
    documentType: 'proof_of_nin' | 'proof_of_address';
    contentType: string;
    contentLength: number;
    checksumSha256: string;
  }): Promise<string> {
    const source = await fetch(input.sourceUrl, {
      signal: AbortSignal.timeout(
        Number(this.config.get('PEPSA_PAYMENT_TIMEOUT_MS') ?? 5000),
      ),
    });
    if (!source.ok) throw new BadGatewayException('KYC export failed');
    const bytes = new Uint8Array(await source.arrayBuffer());
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (
      bytes.byteLength !== input.contentLength ||
      checksum !== input.checksumSha256
    )
      throw new BadGatewayException('KYC export integrity check failed');
    const upload = await this.request<{
      document_id: string;
      upload_url: string;
      required_headers: Record<string, string>;
    }>('kyc/documents/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        document_type: input.documentType,
        content_type: input.contentType,
        content_length: input.contentLength,
        checksum_sha256: input.checksumSha256,
      }),
    });
    const uploaded = await fetch(upload.upload_url, {
      method: 'PUT',
      headers: upload.required_headers,
      body: bytes,
      signal: AbortSignal.timeout(
        Number(this.config.get('PEPSA_PAYMENT_TIMEOUT_MS') ?? 5000),
      ),
    });
    if (!uploaded.ok) throw new BadGatewayException('KYC import failed');
    return upload.document_id;
  }
  settlementBalance(userId: string) {
    return this.request<any>(`settlement/${userId}/balance`);
  }
  settlementCredit(input: unknown, key: string) {
    return this.request<any>('settlement/credits', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: JSON.stringify(input),
    });
  }
  cashOut(input: unknown, key: string) {
    return this.request<any>('settlement/withdraw', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: JSON.stringify(input),
    });
  }
  banks() {
    return this.request<any[]>('transactions/banks');
  }
  accountEnquiry(input: unknown) {
    return this.request<any>('transactions/account-enquiry', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  initiateTransfer(input: unknown, key: string) {
    return this.request<any>('transactions/initiate', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: JSON.stringify(input),
    });
  }
  executeTransfer(id: string, key: string) {
    return this.request<any>(`transactions/${id}/execute`, {
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
  }
  commerceDebit(input: unknown, key: string) {
    return this.request<any>('commerce/debits', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: JSON.stringify(input),
    });
  }
  transaction(id: string) {
    return this.request<any>(`transactions/${id}`);
  }
  checkout(id: string) {
    return this.request<{
      checkout_id: string;
      user_id: string;
      amount: string;
      currency: string;
      status: string;
      paid_at: string | null;
      provider_reference: string | null;
    }>(`checkout/${id}`);
  }
  replayEvent(eventId: string, reason: string) {
    return this.request<{ event_id: string; replay_queued: boolean }>(
      `events/${encodeURIComponent(eventId)}/replay`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }
  reverseCommerceDebit(transactionId: string, reason: string, key: string) {
    return this.request<{ transaction_id: string }>(
      `commerce/debits/${encodeURIComponent(transactionId)}/reverse`,
      {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify({ reason }),
      },
    );
  }
  transactions(walletId: string, query = '') {
    return this.request<any>(`wallets/${walletId}/transactions${query}`);
  }
  vas(path: string, init?: RequestInit) {
    return this.request<any>(`vas/${path}`, init);
  }

  async createCheckout(input: {
    userId: string;
    amountMinor: number;
    idempotencyKey: string;
  }) {
    const base = this.config.get<string>('PEPSA_PAYMENT_URL');
    const key = this.config.get<string>('PEPSA_PAYMENT_API_KEY');
    if (!base || !key)
      throw new ServiceUnavailableException('Checkout is unavailable');
    try {
      const response = await fetch(
        new URL('checkout/generate', `${base.replace(/\/$/, '')}/`),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'x-platform-api-key': key,
            'idempotency-key': input.idempotencyKey,
          },
          body: JSON.stringify({
            user_id: input.userId,
            checkout_type: 'ordinary',
            amount: (input.amountMinor / 100).toFixed(2),
            expiry_hours: 1,
          }),
          signal: AbortSignal.timeout(
            Number(this.config.get('PEPSA_PAYMENT_TIMEOUT_MS') ?? 5000),
          ),
        },
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Payment HTTP ${response.status}: ${errorText}`);
      }
      const body = (await response.json()) as any;
      if (!body.checkout_id || !body.dynamic_account_number || !body.expires_at)
        throw new Error('Invalid payment response');
      return {
        providerCheckoutId: String(body.checkout_id),
        providerReference: body.provider_reference
          ? String(body.provider_reference)
          : undefined,
        dynamicAccountNumber: String(body.dynamic_account_number),
        bankName: String(body.bank_name ?? '9PSB'),
        expiresAt: new Date(body.expires_at),
      };
    } catch (err) {
      this.logger.error(
        `Checkout provider call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadGatewayException('Checkout provider is unavailable');
    }
  }
}
