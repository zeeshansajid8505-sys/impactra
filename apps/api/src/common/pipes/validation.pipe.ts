import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

export const defaultValidationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};

export class AppValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    super({
      ...defaultValidationPipeOptions,
      ...options,
    });
  }
}
