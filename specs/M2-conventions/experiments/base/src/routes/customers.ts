import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const Params = z.object({ id: z.string().uuid() });
const Query = z.object({ currency: z.enum(['USD', 'EUR']).optional() });

interface Customer {
  id: string;
  name: string;
  email: string;
  balanceCents: number;
}

const customers = new Map<string, Customer>();

/** GET /customers/:id — one customer with their open balance. Consumed by the web app. */
export default async function customerRoutes(app: FastifyInstance) {
  app.get('/customers/:id', async (req, reply) => {
    const { id } = Params.parse(req.params);
    const { currency = 'USD' } = Query.parse(req.query);
    const customer = customers.get(id);
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      balance: { amount: customer.balanceCents / 100, currency },
    };
  });
}
