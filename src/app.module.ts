import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './core/database/database.module.js';
import { IamModule } from './integrations/iam/iam.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { StorageModule } from './integrations/storage/storage.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { AdministrationModule } from './modules/administration/administration.module.js';
import { AdminReviewModule } from './modules/admin-review/admin-review.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { MapsModule } from './integrations/maps/maps.module.js';
import { PaymentModule } from './integrations/payment/payment.module.js';
import { RiderModule } from './integrations/rider/rider.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ManifestsModule } from './modules/manifests/manifests.module.js';
import { DispatchModule } from './modules/dispatch/dispatch.module.js';
import { AccountModule } from './modules/account/account.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { FeesModule } from './modules/fees/fees.module.js';
import { ProvisioningModule } from './modules/provisioning/provisioning.module.js';
import { VendorAdminModule } from './modules/vendor-admin/vendor-admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    IamModule,
    AuditModule,
    AuthModule,
    StorageModule,
    OnboardingModule,
    AdministrationModule,
    AdminReviewModule,
    EmailModule,
    PeopleModule,
    MapsModule,
    PaymentModule,
    RiderModule,
    PricingModule,
    OrdersModule,
    ManifestsModule,
    DispatchModule,
    AccountModule,
    ReportingModule,
    NotificationsModule,
    FeesModule,
    ProvisioningModule,
    VendorAdminModule,
    HealthModule,
  ],
})
export class AppModule {}
