/**
 * Demo seed for local testing against an existing approved vendor/user.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' pnpm prisma:seed-demo
 *
 * Idempotent: removes prior SEED-* rows, then inserts a full sample graph.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/prisma/client.js';

const PREFIX = 'SEED';
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const id = (n: number) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function ref(kind: string, n: number) {
  return `${PREFIX}-${kind}-${String(n).padStart(3, '0')}`;
}

function party(name: string, phone: string, email?: string) {
  return { name, phone, email: email ?? undefined };
}

function place(
  address: string,
  city: string,
  state: string,
  postalCode = '100001',
) {
  return { address, city, state, country: 'NG', postalCode };
}

function parcel(description: string, weightKg = 2, declaredValue = 25_000) {
  return {
    category: 'general',
    handling: 'STANDARD',
    quantity: 1,
    weightKg,
    description,
    dimensionsCm: { length: 30, width: 20, height: 15 },
    declaredValue,
    inspectionConsent: true,
  };
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function wipeSeedData(tenantId: string, partnerId: string) {
  const seedOrders = await db.order.findMany({
    where: { publicReference: { startsWith: `${PREFIX}-` } },
    select: { id: true },
  });
  const seedOrderIds = seedOrders.map((row) => row.id);
  const seedBatches = await db.batch.findMany({
    where: { publicReference: { startsWith: `${PREFIX}-` } },
    select: { id: true },
  });
  const seedBatchIds = seedBatches.map((row) => row.id);
  const seedDispatches = await db.dispatch.findMany({
    where: { publicReference: { startsWith: `${PREFIX}-` } },
    select: { id: true },
  });
  const seedDispatchIds = seedDispatches.map((row) => row.id);
  const seedManifests = await db.manifest.findMany({
    where: { publicReference: { startsWith: `${PREFIX}-` } },
    select: { id: true },
  });
  const seedManifestIds = seedManifests.map((row) => row.id);
  const seedDispatchers = await db.dispatcher.findMany({
    where: {
      OR: [
        { id: { in: [id(30), id(31), id(32), id(33)] } },
        {
          revisions: {
            some: { email: { endsWith: '@seed.pepsa.local' } },
          },
        },
      ],
    },
    select: { id: true },
  });
  const seedDispatcherIds = seedDispatchers.map((row) => row.id);

  await db.dispatchTrackingPoint.deleteMany({
    where: { dispatchId: { in: seedDispatchIds } },
  });
  await db.dispatchEvent.deleteMany({
    where: { dispatchId: { in: seedDispatchIds } },
  });
  await db.dispatchItem.deleteMany({
    where: { dispatchId: { in: seedDispatchIds } },
  });
  await db.feeReceivable.deleteMany({
    where: { dispatchId: { in: seedDispatchIds } },
  });
  await db.dispatch.deleteMany({
    where: { id: { in: seedDispatchIds } },
  });

  await db.manifestAction.deleteMany({
    where: { manifestId: { in: seedManifestIds } },
  });
  await db.manifestRevisionItem.deleteMany({
    where: { revision: { manifestId: { in: seedManifestIds } } },
  });
  await db.manifestRevision.deleteMany({
    where: { manifestId: { in: seedManifestIds } },
  });
  await db.manifest.deleteMany({ where: { id: { in: seedManifestIds } } });

  await db.batchItem.deleteMany({ where: { batchId: { in: seedBatchIds } } });
  await db.batch.deleteMany({ where: { id: { in: seedBatchIds } } });

  await db.checkoutSession.deleteMany({
    where: { orderId: { in: seedOrderIds } },
  });
  await db.order.deleteMany({ where: { id: { in: seedOrderIds } } });
  await db.pricingQuote.deleteMany({
    where: { publicReference: { startsWith: `${PREFIX}-` } },
  });

  await db.vendorSettlementEntry.deleteMany({
    where: {
      tenantId,
      sourceReference: { startsWith: `${PREFIX}-` },
    },
  });
  await db.notification.deleteMany({
    where: { tenantId, uniqueKey: { startsWith: `${PREFIX}-` } },
  });
  await db.invitation.deleteMany({
    where: { tenantId, email: { endsWith: '@seed.pepsa.local' } },
  });
  await db.customer.deleteMany({
    where: { tenantId, phone: { startsWith: '080SEED' } },
  });

  if (seedDispatcherIds.length) {
    await db.dispatcher.updateMany({
      where: { id: { in: seedDispatcherIds } },
      data: { approvedRevisionId: null, latestRevisionId: null },
    });
    await db.dispatcherDocument.deleteMany({
      where: { revision: { dispatcherId: { in: seedDispatcherIds } } },
    });
    await db.dispatcherRevision.deleteMany({
      where: { dispatcherId: { in: seedDispatcherIds } },
    });
    await db.dispatcher.deleteMany({
      where: { id: { in: seedDispatcherIds } },
    });
  }

  await db.userRole.deleteMany({
    where: { user: { email: { endsWith: '@seed.pepsa.local' } } },
  });
  await db.user.deleteMany({
    where: { email: { endsWith: '@seed.pepsa.local' } },
  });
  await db.role.deleteMany({
    where: { tenantId, name: { startsWith: `${PREFIX} ` } },
  });

  // Partner vendor cleanup (owned entirely by seed).
  const partnerOrders = await db.order.findMany({
    where: { tenantId: partnerId },
    select: { id: true },
  });
  if (partnerOrders.length) {
    await db.order.deleteMany({ where: { tenantId: partnerId } });
  }
  await db.userRole.deleteMany({
    where: { user: { tenantId: partnerId } },
  });
  await db.user.deleteMany({ where: { tenantId: partnerId } });
  await db.role.deleteMany({ where: { tenantId: partnerId } });
  await db.vendor.deleteMany({ where: { id: partnerId } });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const vendor = await db.vendor.findFirst({
    where: { status: 'APPROVED' },
    orderBy: { createdAt: 'asc' },
  });
  if (!vendor) throw new Error('No approved vendor found to seed against');

  const user = await db.user.findFirst({
    where: { tenantId: vendor.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new Error(`No active user found for vendor ${vendor.id}`);

  const pricing = await db.pricingSetting.findFirst({
    where: { tenantId: vendor.id, active: true },
    orderBy: { version: 'desc' },
  });
  if (!pricing) {
    throw new Error(
      'No active pricing setting found. Create pricing in the app first.',
    );
  }

  const partnerId = id(1);
  console.log(
    `Seeding for vendor "${vendor.businessName}" (${vendor.id}) as ${user.email}`,
  );

  await wipeSeedData(vendor.id, partnerId);

  await db.vendor.create({
    data: {
      id: partnerId,
      type: 'COMPANY',
      status: 'APPROVED',
      businessName: 'SEED Lagos Hub Logistics',
      email: 'seed-partner@pepsa.local',
      phone: '080SEED0001',
      publicSlug: 'seed-lagos-hub',
      tagline: 'Partner hub for manifests',
      description: 'Synthetic destination vendor for demo manifests.',
      paymentProvisioning: 'ACTIVE',
    },
  });
  await db.role.create({
    data: {
      id: id(2),
      tenantId: partnerId,
      name: 'Owner',
      isOwner: true,
      permissions: ['*'],
    },
  });

  const customers = await Promise.all(
    [
      ['Ada Okonkwo', '080SEED1001', 'ada.okonkwo@seed.pepsa.local'],
      ['Tunde Bello', '080SEED1002', 'tunde.bello@seed.pepsa.local'],
      ['Chioma Eze', '080SEED1003', 'chioma.eze@seed.pepsa.local'],
      ['Ibrahim Musa', '080SEED1004', 'ibrahim.musa@seed.pepsa.local'],
    ].map(([name, phone, email], index) =>
      db.customer.create({
        data: {
          id: id(10 + index),
          tenantId: vendor.id,
          name,
          phone,
          email,
        },
      }),
    ),
  );

  const dispatcherSpecs = [
    {
      id: id(30),
      revisionId: id(40),
      status: 'APPROVED' as const,
      availability: true,
      firstName: 'Ada',
      lastName: 'Rider',
      email: 'ada.rider@seed.pepsa.local',
      phone: '080SEED2001',
      vehicleType: 'MOTORCYCLE',
      vehicleBrand: 'Bajaj',
      plateNumber: 'LAG-SEED-01',
      revenueSharePct: '70.00',
      totalOrdersPicked: 18,
    },
    {
      id: id(31),
      revisionId: id(41),
      status: 'APPROVED' as const,
      availability: true,
      firstName: 'Kunle',
      lastName: 'Fleet',
      email: 'kunle.fleet@seed.pepsa.local',
      phone: '080SEED2002',
      vehicleType: 'VAN',
      vehicleBrand: 'Toyota',
      plateNumber: 'LAG-SEED-02',
      revenueSharePct: '65.00',
      totalOrdersPicked: 9,
    },
    {
      id: id(32),
      revisionId: id(42),
      status: 'UNDER_REVIEW' as const,
      availability: false,
      firstName: 'Blessing',
      lastName: 'Pending',
      email: 'blessing.pending@seed.pepsa.local',
      phone: '080SEED2003',
      vehicleType: 'BICYCLE',
      vehicleBrand: null,
      plateNumber: null,
      revenueSharePct: '75.00',
      totalOrdersPicked: 0,
    },
    {
      id: id(33),
      revisionId: id(43),
      status: 'DISABLED' as const,
      availability: false,
      firstName: 'Sade',
      lastName: 'Offline',
      email: 'sade.offline@seed.pepsa.local',
      phone: '080SEED2004',
      vehicleType: 'MOTORCYCLE',
      vehicleBrand: 'TVS',
      plateNumber: 'LAG-SEED-04',
      revenueSharePct: '70.00',
      totalOrdersPicked: 3,
    },
  ];

  for (const spec of dispatcherSpecs) {
    await db.dispatcher.create({
      data: {
        id: spec.id,
        tenantId: vendor.id,
        status: spec.status,
        availability: spec.availability,
        totalOrdersPicked: spec.totalOrdersPicked,
      },
    });
    await db.dispatcherRevision.create({
      data: {
        id: spec.revisionId,
        dispatcherId: spec.id,
        version: 1,
        status:
          spec.status === 'APPROVED'
            ? 'APPROVED'
            : spec.status === 'UNDER_REVIEW'
              ? 'UNDER_REVIEW'
              : 'APPROVED',
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: spec.email,
        phone: spec.phone,
        dateOfBirth: new Date('1994-05-12T00:00:00.000Z'),
        gender: 'FEMALE',
        identityType: 'NIN',
        encryptedIdentityNo: `seed-enc-${spec.phone}`,
        identityFingerprint: hash(spec.phone),
        homeAddress: '12 Seed Street, Yaba',
        state: 'Lagos',
        city: 'Lagos',
        termsAcceptedAt: new Date(),
        engagementType: 'CONTRACT',
        vehicleType: spec.vehicleType,
        vehicleBrand: spec.vehicleBrand ?? undefined,
        plateNumber: spec.plateNumber ?? undefined,
        vehicleRegistrationDate: new Date('2024-01-15T00:00:00.000Z'),
        guarantorName: 'Seed Guarantor',
        guarantorPhone: '080SEED2999',
        guarantorEmail: 'guarantor@seed.pepsa.local',
        guarantorAddress: '14 Seed Close, Surulere',
        encryptedGuarantorNin: `seed-enc-guarantor-${spec.phone}`,
        guarantorNinFingerprint: hash(`guarantor-${spec.phone}`),
        revenueSharePct: new Prisma.Decimal(spec.revenueSharePct),
        submittedAt: new Date(),
        decidedAt: spec.status === 'UNDER_REVIEW' ? null : new Date(),
      },
    });
    await db.dispatcher.update({
      where: { id: spec.id },
      data: {
        latestRevisionId: spec.revisionId,
        approvedRevisionId:
          spec.status === 'APPROVED' || spec.status === 'DISABLED'
            ? spec.revisionId
            : null,
      },
    });
  }

  const quoteActive = await db.pricingQuote.create({
    data: {
      id: id(50),
      tenantId: vendor.id,
      pricingSettingId: pricing.id,
      publicReference: ref('Q', 1),
      pickup: place('1 Broad Street, Lagos Island', 'Lagos', 'Lagos'),
      delivery: place('15 Admiralty Way, Lekki', 'Lagos', 'Lagos'),
      distanceMetres: 12_400,
      durationSeconds: 2_100,
      pricePerKmMinor: pricing.pricePerKmMinor,
      discountBps: 0,
      baseAmountMinor: 12_400,
      finalAmountMinor: 12_400,
      currency: 'NGN',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
  await db.pricingQuote.create({
    data: {
      id: id(51),
      tenantId: vendor.id,
      pricingSettingId: pricing.id,
      publicReference: ref('Q', 2),
      pickup: place('Ikeja City Mall', 'Ikeja', 'Lagos'),
      delivery: place('Computer Village', 'Ikeja', 'Lagos'),
      distanceMetres: 3_200,
      durationSeconds: 900,
      pricePerKmMinor: pricing.pricePerKmMinor,
      discountBps: 0,
      baseAmountMinor: 3_200,
      finalAmountMinor: 3_200,
      currency: 'NGN',
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  const now = Date.now();
  const orderRows = [
    {
      id: id(60),
      ref: ref('O', 1),
      source: 'VENDOR_DIRECT' as const,
      status: 'DRAFT' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[0]!.id,
      amountMinor: 8_500,
      itemDescription: 'Draft cosmetics sample pack',
      deliveryStatus: 'INSTANT',
      pickup: place('Apus HQ, Moniya', 'Ibadan', 'Oyo'),
      delivery: place('Ring Road Mall', 'Ibadan', 'Oyo'),
    },
    {
      id: id(61),
      ref: ref('O', 2),
      source: 'VENDOR_DIRECT' as const,
      status: 'READY' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[0]!.id,
      amountMinor: 15_000,
      itemDescription: 'Ready electronics accessory',
      deliveryStatus: 'INSTANT',
      pickup: place('1 Broad Street, Lagos Island', 'Lagos', 'Lagos'),
      delivery: place('15 Admiralty Way, Lekki', 'Lagos', 'Lagos'),
      distanceMetres: 12_400,
      durationSeconds: 2_100,
    },
    {
      id: id(62),
      ref: ref('O', 3),
      source: 'VENDOR_DIRECT' as const,
      status: 'READY' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[1]!.id,
      amountMinor: 9_750,
      itemDescription: 'Ready pharmacy pouch',
      deliveryStatus: 'INSTANT',
      pickup: place('Allen Avenue', 'Ikeja', 'Lagos'),
      delivery: place('Maryland Mall', 'Ikeja', 'Lagos'),
      distanceMetres: 4_800,
      durationSeconds: 1_100,
    },
    {
      id: id(63),
      ref: ref('O', 4),
      source: 'VENDOR_DIRECT' as const,
      status: 'READY' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[2]!.id,
      amountMinor: 22_000,
      itemDescription: 'Ready fashion parcel for batch',
      deliveryStatus: 'INSTANT',
      pickup: place('Surulere Stadium', 'Lagos', 'Lagos'),
      delivery: place('Yaba Tech Gate', 'Lagos', 'Lagos'),
      distanceMetres: 6_100,
      durationSeconds: 1_400,
    },
    {
      id: id(64),
      ref: ref('O', 5),
      source: 'VENDOR_DIRECT' as const,
      status: 'READY' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[3]!.id,
      amountMinor: 18_500,
      itemDescription: 'Ready documents envelope for batch',
      deliveryStatus: 'INSTANT',
      pickup: place('VI Landmark', 'Lagos', 'Lagos'),
      delivery: place('Ikoyi Club', 'Lagos', 'Lagos'),
      distanceMetres: 5_200,
      durationSeconds: 1_200,
    },
    {
      id: id(65),
      ref: ref('O', 6),
      source: 'CUSTOMER_LINK' as const,
      status: 'PENDING_PAYMENT' as const,
      paymentStatus: 'PENDING' as const,
      customerId: customers[1]!.id,
      amountMinor: 12_400,
      itemDescription: 'Customer-link awaiting payment',
      deliveryStatus: 'INSTANT',
      quoteId: quoteActive.id,
      pickup: place('1 Broad Street, Lagos Island', 'Lagos', 'Lagos'),
      delivery: place('15 Admiralty Way, Lekki', 'Lagos', 'Lagos'),
      distanceMetres: 12_400,
      durationSeconds: 2_100,
    },
    {
      id: id(66),
      ref: ref('O', 7),
      source: 'CUSTOMER_LINK' as const,
      status: 'PENDING_ACCEPTANCE' as const,
      paymentStatus: 'PAID' as const,
      customerId: customers[2]!.id,
      amountMinor: 11_000,
      itemDescription: 'Paid customer-link awaiting acceptance',
      deliveryStatus: 'INSTANT',
      pickup: place('Bodija Market', 'Ibadan', 'Oyo'),
      delivery: place('UI Gate', 'Ibadan', 'Oyo'),
      distanceMetres: 7_800,
      durationSeconds: 1_600,
      acceptedAt: null,
    },
    {
      id: id(67),
      ref: ref('O', 8),
      source: 'VENDOR_DIRECT' as const,
      status: 'ACCEPTED' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[0]!.id,
      amountMinor: 14_250,
      itemDescription: 'Accepted order ready for dispatch history',
      deliveryStatus: 'INSTANT',
      pickup: place('Challenge Roundabout', 'Ibadan', 'Oyo'),
      delivery: place('Dugbe Post Office', 'Ibadan', 'Oyo'),
      distanceMetres: 5_500,
      durationSeconds: 1_300,
      acceptedAt: new Date(now - 2 * 60 * 60 * 1000),
    },
    {
      id: id(68),
      ref: ref('O', 9),
      source: 'VENDOR_DIRECT' as const,
      status: 'CANCELLED' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[3]!.id,
      amountMinor: 6_000,
      itemDescription: 'Cancelled sample order',
      deliveryStatus: 'INSTANT',
      pickup: place('Apus HQ, Moniya', 'Ibadan', 'Oyo'),
      delivery: place('Sango', 'Ibadan', 'Oyo'),
      cancelledAt: new Date(now - 24 * 60 * 60 * 1000),
    },
    {
      id: id(69),
      ref: ref('O', 10),
      source: 'VENDOR_DIRECT' as const,
      status: 'READY' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[1]!.id,
      amountMinor: 16_800,
      itemDescription: 'Manifest travel parcel A',
      deliveryStatus: 'SCHEDULED',
      pickup: place('Apus HQ, Moniya', 'Ibadan', 'Oyo'),
      delivery: place('Ikeja Bus Terminal', 'Ikeja', 'Lagos'),
      distanceMetres: 130_000,
      durationSeconds: 12_000,
      scheduledStart: new Date(now + 6 * 60 * 60 * 1000),
      scheduledEnd: new Date(now + 12 * 60 * 60 * 1000),
    },
    {
      id: id(70),
      ref: ref('O', 11),
      source: 'VENDOR_DIRECT' as const,
      status: 'READY' as const,
      paymentStatus: 'NOT_REQUIRED' as const,
      customerId: customers[2]!.id,
      amountMinor: 19_200,
      itemDescription: 'Manifest travel parcel B',
      deliveryStatus: 'SCHEDULED',
      pickup: place('Apus HQ, Moniya', 'Ibadan', 'Oyo'),
      delivery: place('Yaba Market', 'Lagos', 'Lagos'),
      distanceMetres: 128_000,
      durationSeconds: 11_500,
      scheduledStart: new Date(now + 6 * 60 * 60 * 1000),
      scheduledEnd: new Date(now + 12 * 60 * 60 * 1000),
    },
  ] as const;

  for (const row of orderRows) {
    await db.order.create({
      data: {
        id: row.id,
        tenantId: vendor.id,
        publicReference: row.ref,
        source: row.source,
        status: row.status,
        paymentStatus: row.paymentStatus,
        customerId: row.customerId,
        quoteId: 'quoteId' in row ? row.quoteId : undefined,
        sender: party(vendor.businessName, vendor.phone, vendor.email),
        receiver: party(
          customers.find((c) => c.id === row.customerId)?.name ?? 'Receiver',
          customers.find((c) => c.id === row.customerId)?.phone ??
            '080SEED0000',
          customers.find((c) => c.id === row.customerId)?.email ?? undefined,
        ),
        pickup: row.pickup,
        delivery: row.delivery,
        orderType: 'PARCEL',
        handling: 'STANDARD',
        mobilityMethod: 'MOTORCYCLE',
        parcelMetadata: parcel(row.itemDescription),
        itemDescription: row.itemDescription,
        deliveryStatus: row.deliveryStatus,
        scheduledStart:
          'scheduledStart' in row ? row.scheduledStart : undefined,
        scheduledEnd: 'scheduledEnd' in row ? row.scheduledEnd : undefined,
        fragile: false,
        sizeEstimate: 'MEDIUM',
        distanceMetres: 'distanceMetres' in row ? row.distanceMetres : 3_000,
        durationSeconds: 'durationSeconds' in row ? row.durationSeconds : 900,
        amountMinor: row.amountMinor,
        currency: 'NGN',
        createdById: user.id,
        acceptedAt: 'acceptedAt' in row ? row.acceptedAt : undefined,
        cancelledAt: 'cancelledAt' in row ? row.cancelledAt : undefined,
      },
    });
  }

  await db.pricingQuote.update({
    where: { id: quoteActive.id },
    data: { consumedAt: new Date() },
  });

  await db.checkoutSession.create({
    data: {
      id: id(80),
      orderId: id(65),
      providerCheckoutId: `${PREFIX}-checkout-001`,
      providerReference: `${PREFIX}-pay-001`,
      dynamicAccountNumber: '7809123456',
      bankName: 'Seed Demo Bank',
      expiresAt: new Date(now + 45 * 60 * 1000),
    },
  });

  // Open batch (finalized, not yet manifested) — good for manifest/dispatch runway.
  await db.batch.create({
    data: {
      id: id(90),
      tenantId: vendor.id,
      publicReference: ref('B', 1),
      status: 'FINALIZED',
      createdById: user.id,
      items: {
        create: [{ orderId: id(63) }, { orderId: id(64) }],
      },
    },
  });

  // Manifested batch used by an outbound travel manifest.
  await db.batch.create({
    data: {
      id: id(91),
      tenantId: vendor.id,
      publicReference: ref('B', 2),
      status: 'MANIFESTED',
      createdById: user.id,
      manifestedAt: new Date(now - 3 * 60 * 60 * 1000),
      items: {
        create: [{ orderId: id(69) }, { orderId: id(70) }],
      },
    },
  });

  const manifests = [
    {
      id: id(100),
      ref: ref('M', 1),
      waybill: `${PREFIX}-WB-001`,
      status: 'SENT' as const,
      origin: vendor.id,
      destination: partnerId,
      name: 'Ibadan → Lagos overnight',
      originState: 'Oyo',
      originCity: 'Ibadan',
      destinationState: 'Lagos',
      destinationCity: 'Lagos',
      batchId: id(91) as string | null,
      orderId: null as string | null,
      actions: [
        {
          action: 'SENT',
          from: null,
          to: 'SENT' as const,
          message: 'Manifest created',
        },
      ],
    },
    {
      id: id(101),
      ref: ref('M', 2),
      waybill: `${PREFIX}-WB-002`,
      status: 'ACCEPTED' as const,
      origin: partnerId,
      destination: vendor.id,
      name: 'Lagos → Ibadan inbound',
      originState: 'Lagos',
      originCity: 'Lagos',
      destinationState: 'Oyo',
      destinationCity: 'Ibadan',
      batchId: null,
      orderId: id(67),
      actions: [
        {
          action: 'SENT',
          from: null,
          to: 'SENT' as const,
          message: 'Inbound created',
        },
        {
          action: 'ACCEPTED',
          from: 'SENT' as const,
          to: 'ACCEPTED' as const,
          message: 'Hub accepted inbound',
        },
      ],
    },
    {
      id: id(102),
      ref: ref('M', 3),
      waybill: `${PREFIX}-WB-003`,
      status: 'IN_TRANSIT' as const,
      origin: vendor.id,
      destination: partnerId,
      name: 'Ibadan → Lagos in transit',
      originState: 'Oyo',
      originCity: 'Ibadan',
      destinationState: 'Lagos',
      destinationCity: 'Lagos',
      batchId: null,
      orderId: id(62),
      actions: [
        { action: 'SENT', from: null, to: 'SENT' as const, message: 'Created' },
        {
          action: 'ACCEPTED',
          from: 'SENT' as const,
          to: 'ACCEPTED' as const,
          message: 'Accepted',
        },
        {
          action: 'IN_TRANSIT',
          from: 'ACCEPTED' as const,
          to: 'IN_TRANSIT' as const,
          message: 'Departed hub',
        },
      ],
    },
    {
      id: id(103),
      ref: ref('M', 4),
      waybill: `${PREFIX}-WB-004`,
      status: 'DELIVERED' as const,
      origin: vendor.id,
      destination: partnerId,
      name: 'Ibadan → Lagos delivered',
      originState: 'Oyo',
      originCity: 'Ibadan',
      destinationState: 'Lagos',
      destinationCity: 'Lagos',
      batchId: null,
      orderId: id(61),
      actions: [
        { action: 'SENT', from: null, to: 'SENT' as const, message: 'Created' },
        {
          action: 'DELIVERED',
          from: 'IN_TRANSIT' as const,
          to: 'DELIVERED' as const,
          message: 'Delivered to hub',
        },
      ],
    },
  ];

  for (const [index, manifest] of manifests.entries()) {
    const revisionId = id(110 + index);
    await db.manifest.create({
      data: {
        id: manifest.id,
        publicReference: manifest.ref,
        waybillNumber: manifest.waybill,
        originTenantId: manifest.origin,
        destinationTenantId: manifest.destination,
        status: manifest.status,
        currentVersion: 1,
        createdById: user.id,
        revisions: {
          create: {
            id: revisionId,
            version: 1,
            name: manifest.name,
            originState: manifest.originState,
            originCity: manifest.originCity,
            destinationState: manifest.destinationState,
            destinationCity: manifest.destinationCity,
            createdById: user.id,
            items: {
              create: manifest.batchId
                ? [{ batchId: manifest.batchId }]
                : [{ orderId: manifest.orderId! }],
            },
          },
        },
        actions: {
          create: manifest.actions.map((action, actionIndex) => ({
            id: id(120 + index * 10 + actionIndex),
            actorId: user.id,
            actorTenantId: vendor.id,
            action: action.action,
            fromStatus: action.from,
            toStatus: action.to,
            message: action.message,
          })),
        },
      },
    });
  }

  const dispatchAda = id(30);
  const dispatches = [
    {
      id: id(140),
      ref: ref('D', 1),
      mode: 'OWN_FLEET' as const,
      status: 'PAIRED' as const,
      dispatcherId: dispatchAda,
      batchId: null,
      orderIds: [id(62)],
      payout: 8_500,
      fee: 1_250,
      funding: 1_250,
      revenueShareBps: 7000,
      pairedAt: new Date(now - 30 * 60 * 1000),
    },
    {
      id: id(141),
      ref: ref('D', 2),
      mode: 'OWN_FLEET' as const,
      status: 'PICKED_UP' as const,
      dispatcherId: id(31),
      batchId: null,
      orderIds: [id(67)],
      payout: 12_000,
      fee: 2_250,
      funding: 2_250,
      revenueShareBps: 6500,
      pairedAt: new Date(now - 3 * 60 * 60 * 1000),
      pickedUpAt: new Date(now - 2 * 60 * 60 * 1000),
    },
    {
      id: id(142),
      ref: ref('D', 3),
      mode: 'OWN_FLEET' as const,
      status: 'COMPLETED' as const,
      dispatcherId: dispatchAda,
      batchId: null,
      orderIds: [id(61)],
      payout: 13_500,
      fee: 1_500,
      funding: 0,
      revenueShareBps: 7000,
      pairedAt: new Date(now - 26 * 60 * 60 * 1000),
      pickedUpAt: new Date(now - 25 * 60 * 60 * 1000),
      deliveredAt: new Date(now - 23 * 60 * 60 * 1000),
      completedAt: new Date(now - 22 * 60 * 60 * 1000),
    },
    {
      id: id(143),
      ref: ref('D', 4),
      mode: 'GENERAL_POOL' as const,
      status: 'PENDING_MATCH' as const,
      dispatcherId: null,
      batchId: id(90),
      orderIds: [id(63), id(64)],
      payout: 0,
      fee: 3_000,
      funding: 3_000,
      revenueShareBps: null,
    },
  ];

  for (const dispatch of dispatches) {
    await db.dispatch.create({
      data: {
        id: dispatch.id,
        publicReference: dispatch.ref,
        tenantId: vendor.id,
        mode: dispatch.mode,
        status: dispatch.status,
        batchId: dispatch.batchId,
        dispatcherId: dispatch.dispatcherId,
        currency: 'NGN',
        revenueShareBps: dispatch.revenueShareBps ?? undefined,
        payoutAmountMinor: dispatch.payout,
        feeAmountMinor: dispatch.fee,
        fundingRequiredMinor: dispatch.funding,
        optimizedDistanceMetres: 8_400,
        optimizedDurationSeconds: 1_800,
        routeSnapshot: {
          pickup: place('Apus HQ, Moniya', 'Ibadan', 'Oyo'),
          stops: dispatch.orderIds.map((orderId, index) => ({
            orderId,
            sequence: index + 1,
            address: `Stop ${index + 1}`,
          })),
        },
        createdById: user.id,
        pairedAt: dispatch.pairedAt,
        pickedUpAt: dispatch.pickedUpAt,
        deliveredAt: dispatch.deliveredAt,
        completedAt: dispatch.completedAt,
        items: {
          create: dispatch.orderIds.map((orderId, index) => ({
            id: id(150 + dispatches.indexOf(dispatch) * 5 + index),
            orderId,
            stopSequence: index + 1,
            payoutAmountMinor: Math.floor(
              dispatch.payout / dispatch.orderIds.length,
            ),
          })),
        },
        events: {
          create: [
            {
              id: id(170 + dispatches.indexOf(dispatch)),
              actorId: user.id,
              fromStatus: null,
              toStatus: dispatch.status,
              source: 'SEED',
              message: `Seeded as ${dispatch.status}`,
            },
          ],
        },
        trackingPoints:
          dispatch.status === 'PICKED_UP' || dispatch.status === 'COMPLETED'
            ? {
                create: [
                  {
                    id: id(180 + dispatches.indexOf(dispatch)),
                    latitude: 7.3775,
                    longitude: 3.947,
                    recordedAt: new Date(now - 90 * 60 * 1000),
                  },
                ],
              }
            : undefined,
      },
    });
  }

  await db.feeReceivable.createMany({
    data: [
      {
        id: id(190),
        tenantId: vendor.id,
        dispatchId: id(140),
        amountMinor: 1_250,
        collectedMinor: 0,
        status: 'OUTSTANDING',
      },
      {
        id: id(191),
        tenantId: vendor.id,
        dispatchId: id(141),
        amountMinor: 2_250,
        collectedMinor: 0,
        status: 'OUTSTANDING',
      },
      {
        id: id(192),
        tenantId: vendor.id,
        dispatchId: id(142),
        amountMinor: 1_500,
        collectedMinor: 1_500,
        status: 'COLLECTED',
        paymentReference: `${PREFIX}-FEE-142`,
        collectedAt: new Date(now - 22 * 60 * 60 * 1000),
      },
    ],
  });

  await db.vendorSettlementEntry.createMany({
    data: [
      {
        id: id(200),
        tenantId: vendor.id,
        source: 'RIDER_FULFILLED',
        sourceReference: ref('D', 3),
        counterpartyId: dispatchAda,
        counterpartyName: 'Ada Rider',
        totalAmountMinor: 15_000,
        earningsMinor: 13_500,
        status: 'COMPLETED',
        paymentReference: `${PREFIX}-SET-001`,
        completedAt: new Date(now - 22 * 60 * 60 * 1000),
      },
      {
        id: id(201),
        tenantId: vendor.id,
        source: 'CUSTOMER_LINK',
        sourceReference: ref('O', 7),
        counterpartyName: 'Chioma Eze',
        totalAmountMinor: 11_000,
        earningsMinor: 10_000,
        status: 'PENDING',
      },
      {
        id: id(202),
        tenantId: vendor.id,
        source: 'RIDER_FULFILLED',
        sourceReference: ref('D', 2),
        counterpartyId: id(31),
        counterpartyName: 'Kunle Fleet',
        totalAmountMinor: 14_250,
        earningsMinor: 12_000,
        status: 'PENDING',
      },
    ],
  });

  await db.notification.createMany({
    data: [
      {
        id: id(210),
        tenantId: vendor.id,
        userId: user.id,
        type: 'ORDER_PENDING_ACCEPTANCE',
        title: 'Customer order awaiting acceptance',
        body: `${ref('O', 7)} is paid and waiting for your acceptance.`,
        href: '/operations',
        uniqueKey: `${PREFIX}-notice-order-7`,
      },
      {
        id: id(211),
        tenantId: vendor.id,
        userId: user.id,
        type: 'MANIFEST_INBOUND',
        title: 'Inbound manifest accepted',
        body: `${ref('M', 2)} is ready at your hub.`,
        href: '/operations?view=delivery-report',
        uniqueKey: `${PREFIX}-notice-manifest-2`,
        readAt: new Date(now - 60 * 60 * 1000),
      },
      {
        id: id(212),
        tenantId: vendor.id,
        userId: user.id,
        type: 'DISPATCH_PAIRED',
        title: 'Dispatcher paired',
        body: `Ada Rider was paired to ${ref('D', 1)}.`,
        href: '/open-dispatch',
        uniqueKey: `${PREFIX}-notice-dispatch-1`,
      },
    ],
  });

  const opsRole = await db.role.create({
    data: {
      id: id(220),
      tenantId: vendor.id,
      name: `${PREFIX} Operations`,
      description: 'Demo operations role',
      permissions: [
        'orders.read',
        'orders.manage',
        'manifests.read',
        'manifests.manage',
        'dispatches.read',
        'dispatches.manage',
        'people.read',
        'people.manage',
        'account.read',
      ],
    },
  });

  await db.invitation.create({
    data: {
      id: id(221),
      tenantId: vendor.id,
      roleId: opsRole.id,
      invitedById: user.id,
      email: 'ops.invite@seed.pepsa.local',
      normalizedEmail: 'ops.invite@seed.pepsa.local',
      tokenHash: hash(`${PREFIX}-invite-token`),
      status: 'PENDING',
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await db.user.create({
    data: {
      id: id(222),
      tenantId: vendor.id,
      email: 'staff.seed@seed.pepsa.local',
      normalizedEmail: 'staff.seed@seed.pepsa.local',
      firstName: 'Seed',
      lastName: 'Staff',
      phone: '080SEED3001',
      // Not a real login hash — account exists for staff list UI only.
      passwordHash: `seed-disabled-${randomBytes(8).toString('hex')}`,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      roleAssignments: {
        create: [{ roleId: opsRole.id }],
      },
    },
  });

  await db.auditEvent.create({
    data: {
      tenantId: vendor.id,
      actorId: user.id,
      action: 'seed.demo_applied',
      subjectId: vendor.id,
      metadata: {
        prefix: PREFIX,
        partnerVendorId: partnerId,
        customers: customers.length,
        orders: orderRows.length,
        manifests: manifests.length,
        dispatches: dispatches.length,
      },
    },
  });

  console.log('Demo seed complete.');
  console.log(
    JSON.stringify(
      {
        vendor: vendor.businessName,
        partner: 'SEED Lagos Hub Logistics',
        customers: customers.length,
        dispatchers: dispatcherSpecs.length,
        orders: orderRows.length,
        batches: 2,
        manifests: manifests.length,
        dispatches: dispatches.length,
        settlements: 3,
        notifications: 3,
        staffInvitation: 'ops.invite@seed.pepsa.local',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
