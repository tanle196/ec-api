import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface OrderConfirmationItem {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface OrderConfirmationDetails {
  orderNumber: string;
  items: OrderConfirmationItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
}

export interface OrderStatusUpdateDetails {
  orderNumber: string;
  fromStatus: string | null;
  toStatus: string;
}

export interface RefundRequestDetails {
  reason: string;
  amount: number;
  adminNote?: string;
}

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendVerificationEmail(email: string, verifyUrl: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify your email address',
      template: './verify-email',
      context: {
        email,
        url: verifyUrl,
        year: new Date().getFullYear().toString(),
      },
    });
  }

  async sendForgotPassword(email: string, resetUrl: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify your email address',
      template: './forgot-password',
      context: {
        email,
        url: resetUrl,
        year: new Date().getFullYear().toString(),
      },
    });
  }

  async sendOrderConfirmation(
    email: string,
    order: OrderConfirmationDetails,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      template: './order-confirmation',
      context: {
        email,
        orderNumber: order.orderNumber,
        items: order.items.map((item) => ({
          ...item,
          unitPrice: item.unitPrice.toFixed(2),
          total: item.total.toFixed(2),
        })),
        subtotal: order.subtotal.toFixed(2),
        shippingFee: order.shippingFee.toFixed(2),
        discount: order.discount.toFixed(2),
        total: order.total.toFixed(2),
        year: new Date().getFullYear().toString(),
      },
    });
  }

  async sendOrderStatusUpdate(
    email: string,
    order: OrderStatusUpdateDetails,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: `Order ${order.orderNumber} status updated to ${order.toStatus}`,
      template: './order-status-update',
      context: {
        email,
        orderNumber: order.orderNumber,
        fromStatus: order.fromStatus,
        toStatus: order.toStatus,
        year: new Date().getFullYear().toString(),
      },
    });
  }

  async sendRefundRequestReceived(
    email: string,
    details: RefundRequestDetails,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'We received your refund request',
      template: './refund-request-received',
      context: {
        email,
        reason: details.reason,
        amount: details.amount.toFixed(2),
        year: new Date().getFullYear().toString(),
      },
    });
  }

  async sendRefundRequestApproved(
    email: string,
    details: RefundRequestDetails,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Your refund request has been approved',
      template: './refund-request-approved',
      context: {
        email,
        reason: details.reason,
        amount: details.amount.toFixed(2),
        adminNote: details.adminNote,
        year: new Date().getFullYear().toString(),
      },
    });
  }

  async sendRefundRequestRejected(
    email: string,
    details: RefundRequestDetails,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Your refund request has been rejected',
      template: './refund-request-rejected',
      context: {
        email,
        reason: details.reason,
        amount: details.amount.toFixed(2),
        adminNote: details.adminNote,
        year: new Date().getFullYear().toString(),
      },
    });
  }
}
