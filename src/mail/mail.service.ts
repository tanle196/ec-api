import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
  ) {}

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
}
