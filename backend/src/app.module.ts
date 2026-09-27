// import { HttpModule } from '@nestjs/axios';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BaycomController } from './baycom.controller';
import { KeyvoxController } from './keyvox.controller';
import { PaymentByPayPayController } from './payPay.controller';
import { PmsJtbConnectController } from './jtbConnect.controller';
import { RelayAuthObserverMiddleware } from './relayAuthObserver.middleware';

@Module({
  imports: [
    HttpModule,
  ],
  controllers: [
    AppController,
    BaycomController,
    KeyvoxController,
    PaymentByPayPayController,
    PmsJtbConnectController,
  ],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RelayAuthObserverMiddleware).forRoutes('*');
  }
}
