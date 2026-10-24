CREATE TYPE "OrderSource" AS ENUM ('VENDOR_DIRECT', 'CUSTOMER_LINK');
CREATE TYPE "VendorOrderStatus" AS ENUM ('DRAFT', 'READY', 'PENDING_PAYMENT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'CANCELLED');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED');

ALTER TABLE "vendors" ADD COLUMN "publicSlug" TEXT;
ALTER TABLE "vendors" ADD COLUMN "externalCheckoutUserId" UUID;
UPDATE "vendors" SET "publicSlug" = gen_random_uuid()::text WHERE "publicSlug" IS NULL;
ALTER TABLE "vendors" ALTER COLUMN "publicSlug" SET NOT NULL;
CREATE UNIQUE INDEX "vendors_publicSlug_key" ON "vendors"("publicSlug");
CREATE UNIQUE INDEX "vendors_externalCheckoutUserId_key" ON "vendors"("externalCheckoutUserId");

CREATE TABLE "pricing_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenantId" UUID NOT NULL,
  "version" INTEGER NOT NULL, "pricePerKmMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN', "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_settings_price_check" CHECK ("pricePerKmMinor" > 0)
);
CREATE UNIQUE INDEX "pricing_settings_tenantId_version_key" ON "pricing_settings"("tenantId", "version");
CREATE INDEX "pricing_settings_tenantId_active_idx" ON "pricing_settings"("tenantId", "active");
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "discount_tiers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "pricingSettingId" UUID NOT NULL,
  "tierNumber" INTEGER NOT NULL, "minMetres" INTEGER NOT NULL, "maxMetres" INTEGER NOT NULL,
  "discountBps" INTEGER NOT NULL, CONSTRAINT "discount_tiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discount_tiers_values_check" CHECK ("tierNumber" BETWEEN 1 AND 4 AND "minMetres" >= 0 AND "maxMetres" > "minMetres" AND "discountBps" BETWEEN 0 AND 10000)
);
CREATE UNIQUE INDEX "discount_tiers_pricingSettingId_tierNumber_key" ON "discount_tiers"("pricingSettingId", "tierNumber");
ALTER TABLE "discount_tiers" ADD CONSTRAINT "discount_tiers_pricingSettingId_fkey" FOREIGN KEY ("pricingSettingId") REFERENCES "pricing_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pricing_quotes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenantId" UUID NOT NULL, "pricingSettingId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL, "pickup" JSONB NOT NULL, "delivery" JSONB NOT NULL,
  "distanceMetres" INTEGER NOT NULL, "durationSeconds" INTEGER NOT NULL,
  "pricePerKmMinor" INTEGER NOT NULL, "discountBps" INTEGER NOT NULL,
  "baseAmountMinor" INTEGER NOT NULL, "finalAmountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN', "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_quotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_quotes_amount_check" CHECK ("distanceMetres" >= 0 AND "durationSeconds" >= 0 AND "baseAmountMinor" >= 0 AND "finalAmountMinor" >= 0)
);
CREATE UNIQUE INDEX "pricing_quotes_publicReference_key" ON "pricing_quotes"("publicReference");
CREATE INDEX "pricing_quotes_tenantId_expiresAt_idx" ON "pricing_quotes"("tenantId", "expiresAt");
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pricing_quotes" ADD CONSTRAINT "pricing_quotes_pricingSettingId_fkey" FOREIGN KEY ("pricingSettingId") REFERENCES "pricing_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenantId" UUID NOT NULL, "publicReference" TEXT NOT NULL,
  "source" "OrderSource" NOT NULL, "status" "VendorOrderStatus" NOT NULL, "paymentStatus" "OrderPaymentStatus" NOT NULL,
  "customerId" UUID, "quoteId" UUID, "sender" JSONB NOT NULL, "receiver" JSONB NOT NULL,
  "pickup" JSONB NOT NULL, "delivery" JSONB NOT NULL, "orderType" TEXT NOT NULL,
  "itemDescription" TEXT NOT NULL, "deliveryStatus" TEXT NOT NULL,
  "scheduledStart" TIMESTAMP(3), "scheduledEnd" TIMESTAMP(3), "fragile" BOOLEAN NOT NULL DEFAULT false,
  "sizeEstimate" TEXT, "distanceMetres" INTEGER, "durationSeconds" INTEGER, "amountMinor" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'NGN', "createdById" TEXT, "acceptedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "orders_publicReference_key" ON "orders"("publicReference");
CREATE UNIQUE INDEX "orders_quoteId_key" ON "orders"("quoteId");
CREATE INDEX "orders_tenantId_source_status_createdAt_idx" ON "orders"("tenantId", "source", "status", "createdAt");
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "pricing_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "checkout_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL, "providerCheckoutId" TEXT NOT NULL,
  "providerReference" TEXT, "dynamicAccountNumber" TEXT NOT NULL, "bankName" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checkout_sessions_orderId_key" ON "checkout_sessions"("orderId");
CREATE UNIQUE INDEX "checkout_sessions_providerCheckoutId_key" ON "checkout_sessions"("providerCheckoutId");
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "eventId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL, "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_events_eventId_key" ON "payment_webhook_events"("eventId");
