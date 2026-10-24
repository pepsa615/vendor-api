import { DocumentStorageService } from './document-storage.service.js';
const file = (mimetype: string, buffer: Buffer) =>
  ({ mimetype, buffer, size: buffer.length }) as Express.Multer.File;
describe('private document ingress', () => {
  it('accepts files whose content signature matches the allowlist', () => {
    const storage = new DocumentStorageService();
    expect(() =>
      storage.validate(file('application/pdf', Buffer.from('%PDF-1.7 valid'))),
    ).not.toThrow();
    expect(() =>
      storage.validate(
        file('image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])),
      ),
    ).not.toThrow();
  });
  it('rejects spoofed MIME types', () => {
    expect(() =>
      new DocumentStorageService().validate(
        file('application/pdf', Buffer.from('not a pdf')),
      ),
    ).toThrow('Only valid JPG, PNG, and PDF');
  });
});
