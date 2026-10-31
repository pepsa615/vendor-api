import { Injectable } from '@nestjs/common';

export type ReceiptTransaction = {
  transactionId: string;
  vendorName: string;
  status: string;
  type: string;
  direction: string;
  amount: string;
  charges: string;
  stampDuty: string;
  total: string;
  narration: string;
  recipient: string;
  providerReference: string;
  createdAt: string;
  completedAt: string;
};

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const escapePdf = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

@Injectable()
export class TransactionReceiptService {
  svg(receipt: ReceiptTransaction) {
    const status = receipt.status.replaceAll('_', ' ').toUpperCase();
    const rows = [
      ['Transaction type', receipt.type],
      ['Recipient / destination', receipt.recipient],
      ['Narration', receipt.narration],
      ['Transaction ID', receipt.transactionId],
      ['Provider reference', receipt.providerReference],
      ['Created', receipt.createdAt],
      ['Completed', receipt.completedAt],
      ['Amount', `NGN ${receipt.amount}`],
      ['Charges', `NGN ${receipt.charges}`],
      ['Stamp duty', `NGN ${receipt.stampDuty}`],
    ];
    const rowMarkup = rows
      .map(
        (
          [label, value],
          index,
        ) => `<g transform="translate(56 ${420 + index * 58})">
          <text fill="#667085" font-size="14">${escapeXml(label)}</text>
          <text x="688" text-anchor="end" fill="#111827" font-size="14" font-weight="600">${escapeXml(value || '-')}</text>
        </g>`,
      )
      .join('');
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120">
      <rect width="800" height="1120" fill="#f8fafc"/>
      <rect x="24" y="24" width="752" height="1072" rx="30" fill="#ffffff" stroke="#e5e7eb"/>
      <rect x="24" y="24" width="752" height="150" rx="30" fill="#9f1d20"/>
      <rect x="24" y="120" width="752" height="54" fill="#9f1d20"/>
      <text x="56" y="88" fill="#ffffff" font-family="Arial,sans-serif" font-size="34" font-weight="700">Pepsa</text>
      <text x="56" y="126" fill="#fecaca" font-family="Arial,sans-serif" font-size="15">Transaction receipt</text>
      <text x="744" y="94" text-anchor="end" fill="#ffffff" font-family="Arial,sans-serif" font-size="16" font-weight="600">${escapeXml(receipt.vendorName)}</text>
      <circle cx="400" cy="242" r="42" fill="#ecfdf3"/>
      <path d="M380 242l13 13 28-31" fill="none" stroke="#15803d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="400" y="312" text-anchor="middle" fill="#111827" font-family="Arial,sans-serif" font-size="20" font-weight="700">${escapeXml(status)}</text>
      <text x="400" y="354" text-anchor="middle" fill="#111827" font-family="Arial,sans-serif" font-size="38" font-weight="700">NGN ${escapeXml(receipt.total)}</text>
      <line x1="56" y1="390" x2="744" y2="390" stroke="#e5e7eb"/>
      <g font-family="Arial,sans-serif">${rowMarkup}</g>
      <line x1="56" y1="1012" x2="744" y2="1012" stroke="#e5e7eb"/>
      <text x="400" y="1052" text-anchor="middle" fill="#667085" font-family="Arial,sans-serif" font-size="13">Generated securely by Pepsa. Verify status in the Vendor wallet.</text>
    </svg>`);
  }

  pdf(receipt: ReceiptTransaction) {
    const commands: string[] = [
      '0.976 0.98 0.988 rg 0 0 595 842 re f',
      '1 1 1 rg 28 28 539 786 re f',
      '0.624 0.114 0.125 rg 28 674 539 140 re f',
    ];
    const text = (
      x: number,
      y: number,
      size: number,
      value: string,
      bold = false,
    ) =>
      commands.push(
        `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`,
      );
    commands.push('1 1 1 rg');
    text(52, 764, 26, 'Pepsa', true);
    text(52, 738, 11, 'Transaction receipt');
    text(350, 764, 11, receipt.vendorName.slice(0, 28), true);
    commands.push('0.07 0.09 0.12 rg');
    text(52, 650, 13, receipt.status.replaceAll('_', ' ').toUpperCase(), true);
    text(52, 610, 28, `NGN ${receipt.total}`, true);
    commands.push('0.88 0.89 0.91 RG 52 586 m 543 586 l S');
    const rows = [
      ['Transaction type', receipt.type],
      ['Recipient / destination', receipt.recipient],
      ['Narration', receipt.narration],
      ['Transaction ID', receipt.transactionId],
      ['Provider reference', receipt.providerReference],
      ['Created', receipt.createdAt],
      ['Completed', receipt.completedAt],
      ['Amount', `NGN ${receipt.amount}`],
      ['Charges', `NGN ${receipt.charges}`],
      ['Stamp duty', `NGN ${receipt.stampDuty}`],
    ];
    rows.forEach(([label, value], index) => {
      const y = 552 - index * 42;
      commands.push('0.4 0.44 0.52 rg');
      text(52, y, 9, label);
      commands.push('0.07 0.09 0.12 rg');
      text(220, y, 9, (value || '-').slice(0, 58), true);
    });
    commands.push('0.88 0.89 0.91 RG 52 112 m 543 112 l S', '0.4 0.44 0.52 rg');
    text(
      130,
      86,
      9,
      'Generated securely by Pepsa. Verify status in the Vendor wallet.',
    );
    return this.buildPdf(commands.join('\n'));
  }

  private buildPdf(content: string) {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];
    let output = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(output));
      output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(output);
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    output += offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('');
    output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output, 'binary');
  }
}
