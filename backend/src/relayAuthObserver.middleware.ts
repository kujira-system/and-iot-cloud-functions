import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { describeRelayRequest } from './utils/relayAuthObservation';

// 中継の呼び出し元を1リクエスト1行で記録する(DMS-1277)。中身は utils/relayAuthObservation.ts
@Injectable()
export class RelayAuthObserverMiddleware implements NestMiddleware {
  private logger: Logger = new Logger('RelayAuth');

  use(request: Request, _response: Response, next: NextFunction) {
    try {
      this.logger.log(
        JSON.stringify(
          describeRelayRequest(
            request.originalUrl,
            request.method,
            request.headers,
          ),
        ),
      );
    } catch (e) {
      // 観測のために中継を止めない
      this.logger.warn(`relayAuth observation failed: ${e?.message}`);
    }
    next();
  }
}
