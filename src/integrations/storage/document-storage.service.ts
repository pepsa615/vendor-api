import {
  Injectable,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';

const allowed = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const matchesSignature = (mime: string, value: Buffer): boolean =>
  (mime === 'application/pdf' && value.subarray(0, 5).toString() === '%PDF-') ||
  (mime === 'image/png' &&
    value
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
  (mime === 'image/jpeg' &&
    value[0] === 0xff &&
    value[1] === 0xd8 &&
    value.at(-2) === 0xff &&
    value.at(-1) === 0xd9);

@Injectable()
export class DocumentStorageService {
  private readonly bucket = process.env.R2_BUCKET;
  private readonly client = process.env.R2_ENDPOINT
    ? new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
      })
    : undefined;

  validate(file: Express.Multer.File) {
    if (
      !allowed.has(file.mimetype) ||
      !matchesSignature(file.mimetype, file.buffer)
    )
      throw new UnsupportedMediaTypeException(
        'Only valid JPG, PNG, and PDF files are accepted',
      );
    if (file.size > 15 * 1024 * 1024)
      throw new UnsupportedMediaTypeException('Document exceeds 15 MB');
  }

  async store(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<{ objectKey: string; scanMessage: string }> {
    this.validate(file);
    const suffix =
      file.mimetype === 'application/pdf'
        ? 'pdf'
        : file.mimetype === 'image/png'
          ? 'png'
          : 'jpg';
    const id = randomUUID();
    const quarantine = `quarantine/${tenantId}/${id}.${suffix}`;
    const clean = `clean/${tenantId}/${id}.${suffix}`;
    if (!this.client || !this.bucket) {
      if (process.env.NODE_ENV === 'production')
        throw new ServiceUnavailableException('Document storage unavailable');
      return {
        objectKey: `local/${tenantId}/${id}.${suffix}`,
        scanMessage: 'local-development-scan',
      };
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: quarantine,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    const scanMessage = await this.scan(file.buffer);
    if (scanMessage !== 'OK') {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: quarantine }),
      );
      throw new UnsupportedMediaTypeException(
        'Document failed malware scanning',
      );
    }
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: clean,
        CopySource: `${this.bucket}/${quarantine}`,
        MetadataDirective: 'COPY',
      }),
    );
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: quarantine }),
    );
    return { objectKey: clean, scanMessage };
  }

  async signedDownload(objectKey: string): Promise<string> {
    if (!this.client || !this.bucket)
      throw new ServiceUnavailableException('Document storage unavailable');
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 60 },
    );
  }

  private scan(buffer: Buffer): Promise<string> {
    const host = process.env.CLAMAV_HOST;
    const port = Number(process.env.CLAMAV_PORT ?? 3310);
    if (!host) {
      if (process.env.NODE_ENV === 'production')
        return Promise.reject(
          new ServiceUnavailableException('Malware scanner unavailable'),
        );
      return Promise.resolve('OK');
    }
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      const chunks: Buffer[] = [];
      socket.setTimeout(15_000);
      socket.once('connect', () => {
        socket.write('zINSTREAM\0');
        const length = Buffer.alloc(4);
        length.writeUInt32BE(buffer.length);
        socket.write(length);
        socket.write(buffer);
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (value) => chunks.push(value));
      socket.once('end', () =>
        resolve(
          Buffer.concat(chunks).toString().includes('OK') ? 'OK' : 'FOUND',
        ),
      );
      socket.once('timeout', () => {
        socket.destroy();
        reject(new ServiceUnavailableException('Malware scanner timed out'));
      });
      socket.once('error', () =>
        reject(new ServiceUnavailableException('Malware scanner unavailable')),
      );
    });
  }
}
