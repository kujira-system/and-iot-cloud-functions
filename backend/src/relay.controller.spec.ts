import { HttpService } from '@nestjs/axios';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import * as request from 'supertest';
import { AppModule } from './app.module';

// 中継の各 controller が、上流へ許可リストのヘッダだけを送ることを HTTP 越しに確かめる(DMS-1277)
describe('relay controllers', () => {
  let app: INestApplication;
  const httpService = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };

  const GOOGLE_TOKEN = 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJ4In0.c2ln';
  const KEYVOX_AUTH = 'hmac username="acc", signature="s"';
  const BAYCOM_AUTH = 'Basic dXNlcjpwYXNz';
  const PAYPAY_AUTH = 'hmac OPA-Auth:client:mac:nonce:1:hash';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HttpService)
      .useValue(httpService)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const fn of Object.values(httpService)) {
      fn.mockReset().mockReturnValue(of({ data: { ok: true } }));
    }
  });

  it('keyvox: 付け替え後の呼び出しは Bearer を送らず、先方の認証を戻す', async () => {
    await request(app.getHttpServer())
      .post('/api/keyvox/getUnits')
      .set('Authorization', GOOGLE_TOKEN)
      .set('X-Upstream-Authorization', KEYVOX_AUTH)
      .set('date', 'Sun, 27 Sep 2026 00:00:00 GMT')
      .set('digest', 'SHA-256=abc')
      .set('x-target-host', 'default.pms')
      .set('x-appengine-user-ip', '34.84.117.68')
      .send({ a: 1 })
      .expect(201, { ok: true });

    expect(httpService.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = httpService.post.mock.calls[0];
    expect(url).toBe('https://eco.blockchainlock.io/api/eagle-pms/v1/getUnits');
    expect(body).toEqual({ a: 1 });
    expect(config.headers).toEqual({
      'content-type': 'application/json',
      date: 'Sun, 27 Sep 2026 00:00:00 GMT',
      digest: 'SHA-256=abc',
      'x-target-host': 'default.pms',
      authorization: KEYVOX_AUTH,
    });
  });

  it('keyvox: 今の呼び出し（Authorization に HMAC）は PUT でもそのまま送る', async () => {
    await request(app.getHttpServer())
      .put('/api/keyvox/changeLockPin')
      .set('Authorization', KEYVOX_AUTH)
      .set('date', 'Sun, 27 Sep 2026 00:00:00 GMT')
      .set('digest', 'SHA-256=abc')
      .set('x-target-host', 'default.pms')
      .set('forwarded', 'for="34.84.117.68";proto=https')
      .send({ a: 1 })
      .expect(200);

    const [url, body, config] = httpService.put.mock.calls[0];
    expect(url).toBe(
      'https://eco.blockchainlock.io/api/eagle-pms/v1/changeLockPin',
    );
    expect(body).toEqual({ a: 1 });
    expect(config.headers).toEqual({
      'content-type': 'application/json',
      date: 'Sun, 27 Sep 2026 00:00:00 GMT',
      digest: 'SHA-256=abc',
      'x-target-host': 'default.pms',
      authorization: KEYVOX_AUTH,
    });
  });

  it('baycom: 今の呼び出し（Authorization に Basic）はそのまま送る', async () => {
    await request(app.getHttpServer())
      .get('/api/baycom/rest/devices')
      .set('Authorization', BAYCOM_AUTH)
      .set('Content-Type', 'application/json;charset=utf-8')
      .set('traceparent', '00-abc-def-01')
      .expect(200);

    const [url, config] = httpService.get.mock.calls[0];
    expect(url).toBe('https://api.connected-platform.com/v1/rest/devices');
    expect(config.headers).toEqual({
      'content-type': 'application/json;charset=utf-8',
      authorization: BAYCOM_AUTH,
    });
  });

  it('jtbConnect: Bearer を送らない', async () => {
    // 接続先は NODE_ENV で決まる（jest は test になり、HOST_PATH に無い）
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'develop';
    try {
      await request(app.getHttpServer())
        .post('/api/jtbConnect/api/v1/roomstatus')
        .set('Authorization', GOOGLE_TOKEN)
        .set('Ocp-Apim-Subscription-Key', 'sub-key')
        .send({ a: 1 })
        .expect(201);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }

    const [url, , config] = httpService.post.mock.calls[0];
    expect(url).toBe('https://stg.dch.jtb.co.jp/api/v1/roomstatus');
    expect(config.headers).toEqual({
      'Ocp-Apim-Subscription-Key': 'sub-key',
      'content-type': 'application/json',
    });
  });

  it('payPay: 付け替え後の呼び出しは先方の認証を Authorization に戻す', async () => {
    await request(app.getHttpServer())
      .delete('/api/payPay/STAGING/v2/codes/code-1')
      .set('Authorization', GOOGLE_TOKEN)
      .set('X-Upstream-Authorization', PAYPAY_AUTH)
      .set('X-ASSUME-MERCHANT', 'merchant-1')
      .expect(200);

    const [url, config] = httpService.delete.mock.calls[0];
    expect(url).toBe('https://apigw.sandbox.paypay.ne.jp/v2/codes/code-1');
    expect(config.headers).toEqual({
      'X-ASSUME-MERCHANT': 'merchant-1',
      Authorization: PAYPAY_AUTH,
    });
  });

  it('CORS のヘッダを返さない', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/keyvox/getUnits')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('サンプルの hackerNews は無い', async () => {
    await request(app.getHttpServer()).get('/api/hackerNews').expect(404);
    expect(httpService.get).not.toHaveBeenCalled();
  });
});
