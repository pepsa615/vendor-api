import { describe, expect, it } from 'vitest';
import { TransactionReceiptService } from './transaction-receipt.service.js';

const receipt = {
  transactionId: '6c813f45-bcd2-44e2-9821-fabc81f61548',
  vendorName: 'Apus Industry Limited',
  status: 'successful',
  type: 'external transfer',
  direction: 'debit',
  amount: '15000.00',
  charges: '25.00',
  stampDuty: '50.00',
  total: '15075.00',
  narration: 'Invoice (October)',
  recipient: 'Ada & Co - 0123456789',
  providerReference: 'TRF-123',
  createdAt: '31 Oct 2026, 10:55:12',
  completedAt: '31 Oct 2026, 10:55:14',
};

describe('TransactionReceiptService', () => {
  const service = new TransactionReceiptService();

  it('generates a valid single-page PDF with escaped dynamic text', () => {
    const pdf = service.pdf(receipt);
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(pdf.toString().endsWith('%%EOF')).toBe(true);
    expect(pdf.toString()).toContain('Invoice \\(October\\)');
    expect(pdf.toString()).toContain('/Count 1');
  });

  it('generates an SVG image without injecting receipt values as markup', () => {
    const svg = service.svg(receipt).toString();
    expect(svg).toContain('<svg');
    expect(svg).toContain('Ada &amp; Co');
    expect(svg).not.toContain('Ada & Co');
    expect(svg).toContain('Apus Industry Limited');
  });
});
