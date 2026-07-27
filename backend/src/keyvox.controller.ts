import { Controller, HttpException, Request, Get, Post, Put, Delete, Req, Param, Query, Logger, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios'
import { catchError, map } from 'rxjs';
import { maskHeadersForLog, formatErrorForLog } from './utils/logSanitizer';
const qs = require('qs');

const baseUrl = 'https://eco.blockchainlock.io/api/eagle-pms/v1/';

@Controller('keyvox')
export class KeyvoxController {
  private logger: Logger = new Logger(KeyvoxController.name);
  
  constructor(
    private readonly httpService: HttpService,
  ) {}

  @Get('*')
  getApi(
    @Param() params: string[],
    @Query() queries: string[],
    @Req() request: Request,
  ) {
    const queryStr = qs.stringify(queries);
    const url = baseUrl + params['0'] + (queryStr ? '?' + queryStr : '');
    const requestHeaders: any = request.headers;
    if (requestHeaders.host !== undefined) {
      delete requestHeaders.host
    }
    this.logger.log(`url = ${url}`);
    this.logger.log(`headers = ${JSON.stringify(maskHeadersForLog(requestHeaders))}`);
    return this.httpService.get(url, {
      headers: requestHeaders
    }).pipe(
      map(response => response.data),
      catchError(e => this.errorHandler(e)),
    );
  }

  @Post('*')
  postApi(
    @Param() params: string[],
    @Query() queries: string[],
    @Req() request: Request,
  ) {
    const queryStr = qs.stringify(queries);
    const url = baseUrl + params['0'] + (queryStr ? '?' + queryStr : '');
    const requestBody = request.body;
    const requestHeaders: any = request.headers;
    if (requestHeaders.host !== undefined) {
      delete requestHeaders.host
    }
    this.logger.log(`url = ${url}`);
    this.logger.log(`body = ${JSON.stringify(requestBody)}`);
    this.logger.log(`headers = ${JSON.stringify(maskHeadersForLog(requestHeaders))}`);
    return this.httpService.post(url, requestBody, {
      headers: requestHeaders
    }).pipe(
      map(response => response.data),
      catchError(e => this.errorHandler(e)),
    );
  }

  @Put('*')
  putApi(
    @Param() params: string[],
    @Query() queries: string[],
    @Req() request: Request,
  ) {
    const queryStr = qs.stringify(queries);
    const url = baseUrl + params['0'] + (queryStr ? '?' + queryStr : '');
    const requestBody = request.body;
    const requestHeaders: any = request.headers;
    if (requestHeaders.host !== undefined) {
      delete requestHeaders.host
    }
    this.logger.log(`url = ${url}`);
    this.logger.log(`body = ${JSON.stringify(requestBody)}`);
    this.logger.log(`headers = ${JSON.stringify(maskHeadersForLog(requestHeaders))}`);
    return this.httpService.put(url, requestBody, {
      headers: requestHeaders
    }).pipe(
      map(response => response.data),
      catchError(e => this.errorHandler(e)),
    );
  }

  @Delete('*')
  deleteApi(
    @Param() params: string[],
    @Query() queries: string[],
    @Req() request: Request,
  ) {
    const queryStr = qs.stringify(queries);
    const url = baseUrl + params['0'] + (queryStr ? '?' + queryStr : '');
    const requestBody = request.body;
    const requestHeaders: any = request.headers;
    if (requestHeaders.host !== undefined) {
      delete requestHeaders.host
    }
    this.logger.log(`url = ${url}`);
    this.logger.log(`body = ${JSON.stringify(requestBody)}`);
    this.logger.log(`headers = ${JSON.stringify(maskHeadersForLog(requestHeaders))}`);
    return this.httpService.delete(url, {
      headers: requestHeaders
    }).pipe(
      map(response => response.data),
      catchError(e => this.errorHandler(e)),
    );
  }

  private async errorHandler(error: any) {
    this.logger.log(`error = ${formatErrorForLog(error)}`);
    if (error.response) {
      throw new HttpException(error.response.data, error.response.status);
    }
    // errorオブジェクトをそのまま渡すとtoJSON()経由でconfig.headers(認証ヘッダー含む)がレスポンスに載る
    throw new InternalServerErrorException(error.message);
  }
}
