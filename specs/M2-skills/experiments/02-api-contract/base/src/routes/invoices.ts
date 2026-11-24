import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const Params = z.object({ id: z.string().uuid() });
const Query = z.object({ currency: z.enum(['USD', 'EUR']).optional() });

interface Invoice {
  id: string;
  amountCents: number;
  status: 'open' | 'paid' | 'void';
}

const invoices = new Map<string, Invoice>();

/** GET /invoices/:id — one invoice. Consumed by the web app and the mobile app. */
export default async function invoiceRoutes(app: FastifyInstance) {
  app.get('/invoices/:id', async (req, reply) => {
    const { id } = Params.parse(req.params);
    const { currency = 'USD' } = Query.parse(req.query);
    const invoice = invoices.get(id);
    if (!invoice) return reply.code(404).send({ error: 'not_found' });
    return {
      id: invoice.id,
      amount: invoice.amountCents / 100,
      currency,
      status: invoice.status,
    };
  });
}
