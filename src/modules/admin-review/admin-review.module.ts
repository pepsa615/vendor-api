import { Module } from '@nestjs/common';
import { AdminReviewController } from './admin-review.controller.js';
import { AdminReviewGuard } from './admin-review.guard.js';
import { AdminReviewService } from './admin-review.service.js';
@Module({
  controllers: [AdminReviewController],
  providers: [AdminReviewGuard, AdminReviewService],
  exports: [AdminReviewGuard, AdminReviewService],
})
export class AdminReviewModule {}
