import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const Params = z.object({ id: z.string().uuid() });
const Query = z.object({
  currency: z.enum(['USD', 'EUR']).optional(),
  include_items: z.enum(['true', 'false']).optional(),
});

interface OrderItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

interface Order {
  id: string;
  customerId: string;
  totalCents: number;
  items: OrderItem[];
  status: 'pending' | 'shipped' | 'cancelled';
}

const orders = new Map<string, Order>();

/** GET /orders/:id — one order. Consumed by the web app and the warehouse service. */
export default async function orderRoutes(app: FastifyInstance) {
  app.get('/orders/:id', async (req, reply) => {
    const { id } = Params.parse(req.params);
    const { currency = 'USD', include_items = 'false' } = Query.parse(req.query);
    const order = orders.get(id);
    if (!order) return reply.code(404).send({ error: 'not_found' });
    return {
      id: order.id,
      customer_id: order.customerId,
      amount: order.totalCents / 100,
      currency,
      status: order.status,
      items:
        include_items === 'true'
          ? order.items.map((i) => ({
              sku: i.sku,
              quantity: i.quantity,
              amount: i.unitPriceCents / 100,
              currency,
            }))
          : undefined,
    };
  });
}
