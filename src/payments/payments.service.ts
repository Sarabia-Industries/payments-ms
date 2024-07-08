import { HttpStatus, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import Stripe from 'stripe';

import { envs } from 'config';
import { PaymentSessionDto } from './dto/payment-session.dto';

@Injectable()
export class PaymentsService {
  constructor() {}

  private readonly stripe = new Stripe(envs.stripeSecret);

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
    return session;
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

          console.log(chargeSucceeded.metadata);

          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
          break;
      }

      return response.status(200).json({ signature });
    } catch (error) {
      response.status(HttpStatus.BAD_REQUEST);
      return;
    }
  }
}
