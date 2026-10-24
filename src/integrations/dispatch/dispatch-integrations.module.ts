import { Module } from '@nestjs/common';
import {
  DispatchFinancePort,
  DispatchProviderPort,
  LocalDispatchFinanceAdapter,
  LocalDispatchProviderAdapter,
  LocalRouteOptimizationAdapter,
  RouteOptimizationPort,
} from './dispatch-ports.js';
import { PepsaOrderDispatchAdapter } from './pepsa-order-dispatch.adapter.js';

@Module({
  providers: [
    { provide: RouteOptimizationPort, useClass: LocalRouteOptimizationAdapter },
    LocalDispatchProviderAdapter,
    { provide: DispatchProviderPort, useClass: PepsaOrderDispatchAdapter },
    { provide: DispatchFinancePort, useClass: LocalDispatchFinanceAdapter },
  ],
  exports: [RouteOptimizationPort, DispatchProviderPort, DispatchFinancePort],
})
export class DispatchIntegrationsModule {}
