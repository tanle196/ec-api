// /* eslint-disable @typescript-eslint/no-unsafe-member-access */
// /* eslint-disable @typescript-eslint/no-unsafe-assignment */
// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Profile, Strategy } from 'passport-google-oauth20';
// import { TypedConfigService } from '@/config/TypedConfigService';
// import { AuthService } from '../auth.service';
// import { UserResponseDto } from '../dtos/user-response.dto';
// import { AuthProvider } from '../enums/AuthProvider';

// @Injectable()
// export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
//   constructor(
//     private readonly authService: AuthService,
//     private readonly configService: TypedConfigService,
//   ) {
//     const googleConfig = configService.getGoogleConfig();
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-call
//     super({
//       clientID: googleConfig.googleClientId,
//       clientSecret: googleConfig.googleClientSecret,
//       callbackURL: googleConfig.googleCallbackUrl,
//       scope: ['email', 'profile'],
//     });
//   }

//   async validate(
//     accessToken: string,
//     refreshToken: string,
//     profile: Profile,
//   ): Promise<UserResponseDto> {
//     const email = profile?.emails?.[0]?.value;
//     const user = await this.authService.validateOAuthLogin(
//       AuthProvider.GOOGLE,
//       profile.id,
//       email,
//     );

//     return user;
//   }
// }
