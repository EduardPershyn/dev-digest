import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const Params = z.object({ invoiceId: z.string().uuid() });
const Query = z.object({ currency: z.enum(['USD', 'EUR']) });

interface Invoice {
  id: string;
  amountCents: number;
  status: 'open' | 'paid' | 'void';
}

const invoices = new Map<string, Invoice>();

/** GET /invoices/:invoiceId — one invoice. Consumed by the web app and the mobile app. */
export default async function invoiceRoutes(app: FastifyInstance) {
  app.get('/invoices/:invoiceId', async (req, reply) => {
    const { invoiceId } = Params.parse(req.params);
    const { currency } = Query.parse(req.query);
    const invoice = invoices.get(invoiceId);
    if (!invoice) return reply.code(404).send({ error: 'not_found' });
    return {
      id: invoice.id,
      amount_cents: invoice.amountCents,
      currency,
      status: invoice.status,
    };
  });
}
