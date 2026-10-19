import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { TypedConfigService } from '@/config/TypedConfigService';
import { formatMoney } from '@/common/utils/money.util';

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
  constructor(
    private readonly mailerService: MailerService,
    private readonly config: TypedConfigService,
  ) {}

  private formatAmount(value: number): string {
    return formatMoney(value, this.config.getStripeConfig().currency);
  }

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
      subject: 'Reset your password',
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
          unitPrice: this.formatAmount(item.unitPrice),
          total: this.formatAmount(item.total),
        })),
        subtotal: this.formatAmount(order.subtotal),
        shippingFee: this.formatAmount(order.shippingFee),
        discount: this.formatAmount(order.discount),
        total: this.formatAmount(order.total),
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
        amount: this.formatAmount(details.amount),
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
        amount: this.formatAmount(details.amount),
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
        amount: this.formatAmount(details.amount),
        adminNote: details.adminNote,
        year: new Date().getFullYear().toString(),
      },
    });
  }
}
