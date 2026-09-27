import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');

  await app.listen(Number(process.env.PORT) || 3300);
}
bootstrap();
