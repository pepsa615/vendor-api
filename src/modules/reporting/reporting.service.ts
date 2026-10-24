import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { RangeQueryDto } from './reporting.dto.js';

const ACTIVE = ['PENDING_MATCH', 'PAIRED', 'PICKED_UP', 'DELIVERED'] as const;
const growth = (current: number, previous: number) =>
  previous === 0
    ? current === 0
      ? 0
      : null
    : Math.round(((current - previous) / previous) * 10_000) / 100;
const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

@Injectable()
export class ReportingService {
  constructor(private readonly db: PrismaService) {}

  range(query: RangeQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 86_400_000);
    if (from >= to || to.getTime() - from.getTime() > 366 * 86_400_000)
      throw new BadRequestException(
        'Date range must be positive and no longer than 366 days',
      );
    return { from, to };
  }

  async dashboard(tenantId: string, query: RangeQueryDto) {
    const { from, to } = this.range(query);
    const duration = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - duration);
    const previousTo = from;
    const [
      active,
      completed,
      recent,
      statuses,
      periodDispatches,
      orderCounts,
      customerCount,
      assignedManifestCount,
      onlineDispatchers,
      previousDispatches,
      previousOrderCounts,
      previousCompleted,
    ] = await Promise.all([
      this.db.dispatch.findMany({
        where: { tenantId, status: { in: [...ACTIVE] } },
        select: {
          batchId: true,
          dispatcherId: true,
          items: {
            select: { id: true, order: { select: { amountMinor: true } } },
          },
        },
      }),
      this.db.vendorSettlementEntry.aggregate({
        where: {
          tenantId,
          status: 'COMPLETED',
          completedAt: { gte: from, lt: to },
        },
        _sum: { earningsMinor: true },
      }),
      this.db.dispatch.findMany({
        where: {
          tenantId,
          status: { in: ['COMPLETED', 'CANCELLED'] },
          createdAt: { gte: from, lt: to },
        },
        select: {
          id: true,
          publicReference: true,
          status: true,
          completedAt: true,
          createdAt: true,
          items: { select: { order: { select: { amountMinor: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.db.dispatch.groupBy({
        where: { tenantId, createdAt: { gte: from, lt: to } },
        by: ['status'],
        _count: { _all: true },
      }),
      this.db.dispatch.findMany({
        where: { tenantId, createdAt: { gte: from, lt: to } },
        select: {
          status: true,
          dispatcherId: true,
          payoutAmountMinor: true,
          optimizedDistanceMetres: true,
          createdAt: true,
          items: {
            select: { order: { select: { amountMinor: true, source: true } } },
          },
        },
      }),
      this.db.order.groupBy({
        where: { tenantId, createdAt: { gte: from, lt: to } },
        by: ['source', 'status'],
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
      this.db.customer.count({ where: { tenantId } }),
      this.db.manifest.count({
        where: {
          destinationTenantId: tenantId,
          status: { in: ['SENT', 'CHANGE_REQUESTED'] },
        },
      }),
      this.db.dispatcher.findMany({
        where: { tenantId, status: 'APPROVED', availability: true },
        include: { approvedRevision: true },
        orderBy: { totalOrdersPicked: 'desc' },
        take: 5,
      }),
      this.db.dispatch.findMany({
        where: {
          tenantId,
          createdAt: { gte: previousFrom, lt: previousTo },
        },
        select: {
          status: true,
          payoutAmountMinor: true,
          optimizedDistanceMetres: true,
          items: { select: { order: { select: { amountMinor: true } } } },
        },
      }),
      this.db.order.groupBy({
        where: {
          tenantId,
          createdAt: { gte: previousFrom, lt: previousTo },
        },
        by: ['source', 'status'],
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
      this.db.vendorSettlementEntry.aggregate({
        where: {
          tenantId,
          status: 'COMPLETED',
          completedAt: { gte: previousFrom, lt: previousTo },
        },
        _sum: { earningsMinor: true },
      }),
    ]);
    const allValue = periodDispatches.reduce(
      (sum, d) =>
        sum +
        d.items.reduce(
          (inner, item) => inner + (item.order.amountMinor ?? 0),
          0,
        ),
      0,
    );
    const completedDispatches = periodDispatches.filter((d) =>
      ['DELIVERED', 'COMPLETED'].includes(d.status),
    );
    const dispatcherPay = periodDispatches.reduce(
      (sum, d) => sum + (d.payoutAmountMinor ?? 0),
      0,
    );
    const orderTotal = orderCounts.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    const orderValue = orderCounts.reduce(
      (sum, row) => sum + (row._sum.amountMinor ?? 0),
      0,
    );
    const customerOrders = orderCounts
      .filter((row) => row.source === 'CUSTOMER_LINK')
      .reduce((sum, row) => sum + row._count._all, 0);
    const completedOrders = orderCounts
      .filter((row) => ['ACCEPTED'].includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
    const previousValue = previousDispatches.reduce(
      (sum, dispatch) =>
        sum +
        dispatch.items.reduce(
          (inner, item) => inner + (item.order.amountMinor ?? 0),
          0,
        ),
      0,
    );
    const previousDelivered = previousDispatches.filter((dispatch) =>
      ['DELIVERED', 'COMPLETED'].includes(dispatch.status),
    ).length;
    const previousDistance = previousDispatches.reduce(
      (sum, dispatch) => sum + dispatch.optimizedDistanceMetres,
      0,
    );
    const previousDispatcherPay = previousDispatches.reduce(
      (sum, dispatch) => sum + (dispatch.payoutAmountMinor ?? 0),
      0,
    );
    const previousOrderTotal = previousOrderCounts.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    const previousOrderValue = previousOrderCounts.reduce(
      (sum, row) => sum + (row._sum.amountMinor ?? 0),
      0,
    );
    const previousCustomerOrders = previousOrderCounts
      .filter((row) => row.source === 'CUSTOMER_LINK')
      .reduce((sum, row) => sum + row._count._all, 0);
    const previousCompletedOrders = previousOrderCounts
      .filter((row) => row.status === 'ACCEPTED')
      .reduce((sum, row) => sum + row._count._all, 0);
    const performerCounts = new Map<string, number>();
    for (const d of completedDispatches)
      if (d.dispatcherId)
        performerCounts.set(
          d.dispatcherId,
          (performerCounts.get(d.dispatcherId) ?? 0) + d.items.length,
        );
    const totalPerformerDeliveries = [...performerCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const bucketDuration = duration / 6;
    const trend = Array.from({ length: 6 }, (_, index) => {
      const cursor = new Date(from.getTime() + bucketDuration * index);
      const next = new Date(
        index === 5
          ? to.getTime()
          : from.getTime() + bucketDuration * (index + 1),
      );
      const rows = periodDispatches.filter(
        (d) => d.createdAt >= cursor && d.createdAt < next,
      );
      return {
        label:
          duration <= 31 * 86_400_000
            ? cursor.toLocaleDateString('en', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              })
            : cursor.toLocaleDateString('en', {
                month: 'short',
                year: '2-digit',
                timeZone: 'UTC',
              }),
        dispatches: rows.length,
        orders: rows.reduce((sum, d) => sum + d.items.length, 0),
        revenueMinor: rows.reduce(
          (sum, d) =>
            sum +
            d.items.reduce(
              (inner, item) => inner + (item.order.amountMinor ?? 0),
              0,
            ),
          0,
        ),
      };
    });
    return {
      generatedAt: new Date(),
      range: { from, to },
      totalDispatchPoints: active.reduce((sum, d) => sum + d.items.length, 0),
      activeBatches: active.filter((d) => d.batchId).length,
      activeDispatchers: new Set(
        active.flatMap((d) => (d.dispatcherId ? [d.dispatcherId] : [])),
      ).size,
      revenueMinor: completed._sum.earningsMinor ?? 0,
      currency: 'NGN',
      statuses: Object.fromEntries(
        statuses.map((s) => [s.status, s._count._all]),
      ),
      currentActivities: {
        activeDispatch: active.length,
        assignedManifest: assignedManifestCount,
        customerOrder: customerOrders,
        onlineDispatchers: onlineDispatchers.length,
      },
      overview: {
        dispatch: {
          all: periodDispatches.length,
          delivered: completedDispatches.length,
          distanceMetres: periodDispatches.reduce(
            (sum, d) => sum + d.optimizedDistanceMetres,
            0,
          ),
          valueMinor: allValue,
          growth: {
            all: growth(periodDispatches.length, previousDispatches.length),
            delivered: growth(completedDispatches.length, previousDelivered),
            distanceMetres: growth(
              periodDispatches.reduce(
                (sum, dispatch) => sum + dispatch.optimizedDistanceMetres,
                0,
              ),
              previousDistance,
            ),
            valueMinor: growth(allValue, previousValue),
          },
        },
        order: {
          all: orderTotal,
          completed: completedOrders,
          customer: customerOrders,
          valueMinor: orderValue,
          growth: {
            all: growth(orderTotal, previousOrderTotal),
            completed: growth(completedOrders, previousCompletedOrders),
            customer: growth(customerOrders, previousCustomerOrders),
            valueMinor: growth(orderValue, previousOrderValue),
          },
        },
        revenue: {
          totalMinor: allValue,
          dispatcherPayMinor: dispatcherPay,
          earningsMinor: completed._sum.earningsMinor ?? 0,
          settlementMinor: completed._sum.earningsMinor ?? 0,
          growth: {
            totalMinor: growth(allValue, previousValue),
            dispatcherPayMinor: growth(dispatcherPay, previousDispatcherPay),
            earningsMinor: growth(
              completed._sum.earningsMinor ?? 0,
              previousCompleted._sum.earningsMinor ?? 0,
            ),
            settlementMinor: growth(
              completed._sum.earningsMinor ?? 0,
              previousCompleted._sum.earningsMinor ?? 0,
            ),
          },
        },
      },
      trend,
      onlineDispatchers: onlineDispatchers.map((d) => ({
        id: d.id,
        name: d.approvedRevision
          ? `${d.approvedRevision.firstName} ${d.approvedRevision.lastName}`
          : 'Dispatcher',
        deliveries: d.totalOrdersPicked,
      })),
      topPerformers: onlineDispatchers
        .map((d) => ({
          id: d.id,
          name: d.approvedRevision
            ? `${d.approvedRevision.firstName} ${d.approvedRevision.lastName}`
            : 'Dispatcher',
          deliveries: performerCounts.get(d.id) ?? 0,
          share: totalPerformerDeliveries
            ? Math.round(
                ((performerCounts.get(d.id) ?? 0) / totalPerformerDeliveries) *
                  1000,
              ) / 10
            : 0,
        }))
        .filter((d) => d.deliveries > 0)
        .slice(0, 4),
      overall: {
        deliveries: completedDispatches.reduce(
          (sum, d) => sum + d.items.length,
          0,
        ),
        orders: orderTotal,
        customers: customerCount,
      },
      recentDeliveries: recent.map((d) => ({
        ...d,
        amountMinor: d.items.reduce(
          (sum, i) => sum + (i.order.amountMinor ?? 0),
          0,
        ),
        items: undefined,
      })),
    };
  }

  async operations(tenantId: string, query: RangeQueryDto) {
    const { from, to } = this.range(query);
    const where = {
      tenantId,
      status: { in: ['COMPLETED', 'CANCELLED'] as any[] },
      createdAt: { gte: from, lt: to },
    };
    const [items, total] = await this.db.$transaction([
      this.db.dispatch.findMany({
        where,
        include: {
          dispatcher: { include: { approvedRevision: true } },
          items: { include: { order: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.dispatch.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      range: { from, to },
    };
  }

  async settlements(tenantId: string, query: RangeQueryDto) {
    const { from, to } = this.range(query);
    const where = { tenantId, createdAt: { gte: from, lt: to } };
    const [items, total] = await this.db.$transaction([
      this.db.vendorSettlementEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.vendorSettlementEntry.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      range: { from, to },
    };
  }

  async operationsCsv(tenantId: string, query: RangeQueryDto) {
    const result = await this.operations(tenantId, {
      ...query,
      page: 1,
      pageSize: 100,
    });
    const rows = result.items.map((d) => [
      d.publicReference,
      d.status,
      d.createdAt.toISOString(),
      d.completedAt?.toISOString() ?? '',
      d.items.length,
      d.items.reduce((s, i) => s + (i.order.amountMinor ?? 0), 0),
      d.currency,
    ]);
    return this.csv(
      [
        'Dispatch reference',
        'Status',
        'Created at',
        'Completed at',
        'Delivery points',
        'Amount minor',
        'Currency',
      ],
      rows,
    );
  }

  async settlementsCsv(tenantId: string, query: RangeQueryDto) {
    const result = await this.settlements(tenantId, {
      ...query,
      page: 1,
      pageSize: 100,
    });
    return this.csv(
      [
        'Reference',
        'Source',
        'Counterparty',
        'Status',
        'Total minor',
        'Earnings minor',
        'Currency',
        'Created at',
      ],
      result.items.map((e) => [
        e.sourceReference,
        e.source,
        e.counterpartyName,
        e.status,
        e.totalAmountMinor,
        e.earningsMinor,
        e.currency,
        e.createdAt.toISOString(),
      ]),
    );
  }

  private csv(headers: string[], rows: unknown[][]) {
    return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  }

  async search(tenantId: string, permissions: readonly string[], q: string) {
    const allowed = (p: string) =>
      permissions.includes('*') || permissions.includes(p);
    const contains = { contains: q, mode: 'insensitive' as const };
    const [orders, dispatches, manifests, customers, dispatchers] =
      await Promise.all([
        allowed('orders.read')
          ? this.db.order.findMany({
              where: { tenantId, publicReference: contains },
              select: { id: true, publicReference: true, status: true },
              take: 5,
            })
          : [],
        allowed('dispatch.read') || allowed('operations.read')
          ? this.db.dispatch.findMany({
              where: { tenantId, publicReference: contains },
              select: { id: true, publicReference: true, status: true },
              take: 5,
            })
          : [],
        allowed('manifests.read') || allowed('operations.read')
          ? this.db.manifest.findMany({
              where: {
                OR: [
                  { originTenantId: tenantId },
                  { destinationTenantId: tenantId },
                ],
                AND: [
                  {
                    OR: [
                      { publicReference: contains },
                      { waybillNumber: contains },
                    ],
                  },
                ],
              },
              select: {
                id: true,
                publicReference: true,
                waybillNumber: true,
                status: true,
              },
              take: 5,
            })
          : [],
        allowed('people.customers.read')
          ? this.db.customer.findMany({
              where: {
                tenantId,
                OR: [
                  { name: contains },
                  { phone: { contains: q } },
                  { email: contains },
                ],
              },
              select: { id: true, name: true, phone: true },
              take: 5,
            })
          : [],
        allowed('people.dispatchers.read')
          ? this.db.dispatcher.findMany({
              where: {
                tenantId,
                revisions: {
                  some: {
                    OR: [
                      { firstName: contains },
                      { lastName: contains },
                      { phone: { contains: q } },
                    ],
                  },
                },
              },
              include: {
                latestRevision: { select: { firstName: true, lastName: true } },
              },
              take: 5,
            })
          : [],
      ]);
    return {
      orders: orders.map((x) => ({
        label: x.publicReference,
        detail: x.status,
        href: `/open-dispatch?search=${encodeURIComponent(x.publicReference)}`,
      })),
      dispatches: dispatches.map((x) => ({
        label: x.publicReference,
        detail: x.status,
        href: `/operations?view=dispatch-activities&search=${encodeURIComponent(x.publicReference)}`,
      })),
      manifests: manifests.map((x) => ({
        label: x.waybillNumber,
        detail: x.status,
        href: `/manifest?view=travel-manifest&search=${encodeURIComponent(x.publicReference)}`,
      })),
      customers: customers.map((x) => ({
        label: x.name,
        detail: x.phone,
        href: `/people/customers?search=${encodeURIComponent(x.name)}`,
      })),
      dispatchers: dispatchers.map((x) => ({
        label:
          `${x.latestRevision?.firstName ?? ''} ${x.latestRevision?.lastName ?? ''}`.trim(),
        detail: x.status,
        href: `/people/dispatchers/${x.id}`,
      })),
    };
  }
}
