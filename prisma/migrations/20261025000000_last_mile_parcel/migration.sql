ALTER TABLE "orders"
  ADD COLUMN "mobilityMethod" TEXT NOT NULL DEFAULT 'motorcycle',
  ADD COLUMN "parcelMetadata" JSONB NOT NULL DEFAULT '{"category":"mail_parcel","handling":"GENERAL","declaredValue":0,"dimensionsCm":{"length":1,"width":1,"height":1},"weightKg":1,"quantity":1,"inspectionConsent":true}'::jsonb;

ALTER TABLE "orders" ALTER COLUMN "mobilityMethod" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "parcelMetadata" DROP DEFAULT;
