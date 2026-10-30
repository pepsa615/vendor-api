import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DEPLOYMENT_ENVIRONMENT: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  AUTH_ISSUER: z.string().default('pepsa-vendor'),
  AUTH_AUDIENCE: z.string().default('pepsa-vendor-api'),
  AUTH_PRIVATE_KEY_PEM: z.string().optional(),
  AUTH_PUBLIC_KEY_PEM: z.string().optional(),
  KYC_ENCRYPTION_KEY_BASE64: z.string().optional(),
  R2_ENDPOINT: z.url().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  ADMIN_CONTROL_PLANE_ISSUER: z.string().default('pepsa-admin'),
  ADMIN_CONTROL_PLANE_AUDIENCE: z.string().default('pepsa-vendor-admin'),
  ADMIN_CONTROL_PLANE_PUBLIC_KEY_PEM: z.string().optional(),
  ADMIN_VENDOR_SIGNING_KEY_ID: z.string().min(1).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  GOOGLE_MAPS_API_KEY: z.string().min(16).optional(),
  GOOGLE_MAPS_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PEPSA_PAYMENT_URL: z.url().optional(),
  PEPSA_PAYMENT_API_KEY: z.string().min(16).optional(),
  PEPSA_PAYMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PEPSA_PAYMENT_WEBHOOK_SECRET: z.string().min(32).optional(),
  PEPSA_PAYMENT_PLATFORM_ID: z.uuid().optional(),
  PAYMENT_VENDOR_SIGNING_KEY_ID: z.string().min(1).optional(),
  PEPSA_PAYMENT_EVENT_KEY_ID: z.string().min(1).optional(),
  PEPSA_ORDER_URL: z.url().optional(),
  PEPSA_ORDER_API_ID: z.string().min(1).optional(),
  PEPSA_ORDER_SUB_ID: z.string().min(1).optional(),
  PEPSA_ORDER_SECURITY_TOKEN: z.string().min(16).optional(),
  PEPSA_ORDER_COST_TYPE: z.string().min(1).default('VENDOR_PREPAID'),
  PEPSA_ORDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  VENDOR_ORDER_SIGNING_KEY_ID: z.string().min(1).optional(),
  ORDER_VENDOR_SIGNING_KEY_ID: z.string().min(1).optional(),
  DISPATCH_WEBHOOK_SECRET: z.string().min(32).optional(),
  DISPATCH_WEBHOOK_KEY_ID: z.string().min(1).optional(),
  RIDER_FLEET_BASE_URL: z.url().optional(),
  FLEET_API_TOKEN: z.string().min(16).optional(),
  RIDER_FLEET_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('false'),
});

export type Environment = Omit<
  z.infer<typeof schema>,
  'CORS_ORIGINS' | 'SWAGGER_ENABLED'
> & {
  CORS_ORIGINS: string[];
  SWAGGER_ENABLED: boolean;
};

export function loadEnvironment(input: NodeJS.ProcessEnv): Environment {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${z.prettifyError(parsed.error)}`,
    );
  }
  if (
    parsed.data.NODE_ENV === 'production' &&
    (!parsed.data.GOOGLE_MAPS_API_KEY ||
      !parsed.data.PEPSA_PAYMENT_URL ||
      !parsed.data.PEPSA_PAYMENT_API_KEY ||
      !parsed.data.PEPSA_PAYMENT_WEBHOOK_SECRET ||
      !parsed.data.PEPSA_PAYMENT_PLATFORM_ID ||
      !parsed.data.PEPSA_PAYMENT_EVENT_KEY_ID ||
      !parsed.data.PAYMENT_VENDOR_SIGNING_KEY_ID ||
      !parsed.data.PEPSA_ORDER_URL ||
      !parsed.data.PEPSA_ORDER_API_ID ||
      !parsed.data.PEPSA_ORDER_SUB_ID ||
      !parsed.data.PEPSA_ORDER_SECURITY_TOKEN ||
      !parsed.data.VENDOR_ORDER_SIGNING_KEY_ID ||
      !parsed.data.ORDER_VENDOR_SIGNING_KEY_ID ||
      !parsed.data.ADMIN_CONTROL_PLANE_PUBLIC_KEY_PEM ||
      !parsed.data.ADMIN_VENDOR_SIGNING_KEY_ID ||
      !parsed.data.DISPATCH_WEBHOOK_SECRET ||
      !parsed.data.DISPATCH_WEBHOOK_KEY_ID ||
      (parsed.data.DEPLOYMENT_ENVIRONMENT !== 'production' &&
        parsed.data.DEPLOYMENT_ENVIRONMENT !== 'staging'))
  ) {
    throw new Error(
      'Invalid environment configuration: isolated production relationship credentials and key IDs are required',
    );
  }
  return {
    ...parsed.data,
    CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((origin) =>
      origin.trim(),
    ),
    SWAGGER_ENABLED: parsed.data.SWAGGER_ENABLED === 'true',
  };
}
