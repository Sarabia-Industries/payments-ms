import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import Stripe from 'stripe';

import { envs, NATS_SERVICE } from 'config';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger(PaymentsService.name);

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const lineItems = items.map(({ name, price, quantity }) => {
      return {
        price_data: {
          currency: currency,
          product_data: {
            name,
          },
          unit_amount: price * 100,
        },
        quantity,
      };
    });

    const session = await this.stripe.checkout.sessions.create({
      payment_intent_data: {
        metadata: {
          orderId,
        },
      },
      line_items: lineItems,
      mode: 'payment',
      success_url: envs.stripeSuccessUrl,
      cancel_url: envs.stripeCancelUrl,
    });
    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }
  success() {}
  cancel() {}
  async paymentWebhook(request: Request, response: Response) {
    try {
      const signature = request.headers['stripe-signature'];
      const endpointSecret = envs.stripeEndpointSecret;

      let event: Stripe.Event;
      event = this.stripe.webhooks.constructEvent(
        request['rawBody'],
        signature,
        endpointSecret,
      );

      switch (event.type) {
        case 'charge.succeeded':
          const chargeSucceeded = event.data.object;

          const payload = {
            paymentId: chargeSucceeded.id,
            orderId: chargeSucceeded.metadata.orderId,
            receiptUrl: chargeSucceeded.receipt_url,
          };

          this.client.emit('payment.succeeded', payload);

          break;
        default:
          this.logger.log(`Unhandled event type ${event.type}`);
          break;
      }

      return response.status(200).json({ signature });
    } catch (error) {
      response.status(HttpStatus.BAD_REQUEST);
      return;
    }
  }
}
