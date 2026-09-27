import type { IncomingHttpHeaders } from 'http';
import {
  buildUpstreamHeaders,
  resolveUpstreamAuthorization,
} from './upstreamHeaders';

const KEYVOX_AUTH =
  'hmac username="acc", algorithm="hmac-sha256", headers="date request-line digest", signature="c2ln"';
const BAYCOM_AUTH = 'Basic dXNlcjpwYXNz';
const PAYPAY_AUTH = 'hmac OPA-Auth:client:mac:nonce:1700000000:hash';
const GOOGLE_TOKEN = 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJ4In0.c2ln';

// App Engine から中継へ届くヘッダ(stg の実ログのヘッダ名を元にした)。先方の認証以外は上流へ送らない
const platformHeaders: IncomingHttpHeaders = {
  host: 'asia-northeast1-and-iot-api-stg.cloudfunctions.net',
  accept: 'application/json, text/plain, */*',
  'accept-encoding': 'gzip, compress, deflate, br',
  'user-agent': 'axios/1.16.1',
  forwarded: 'for="34.84.117.68";proto=https',
  'function-execution-id': 'abc123',
  traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
  'transfer-encoding': 'chunked',
  'x-appengine-city': 'tokyo',
  'x-appengine-citylatlong': '35.0,139.0',
  'x-appengine-country': 'JP',
  'x-appengine-user-ip': '34.84.117.68',
  'x-cloud-trace-context': '0af7651916cd43dd8448eb211c80319c/1',
  'x-forwarded-for': '34.84.117.68',
  'x-forwarded-proto': 'https',
  'content-length': '42',
  cookie: 'a=b',
};

describe('buildUpstreamHeaders', () => {
  describe('今の api-nest（先方の認証を Authorization で送る）', () => {
    it('keyvox は許可リストのヘッダと認証だけを送る', () => {
      expect(
        buildUpstreamHeaders('keyvox', {
          ...platformHeaders,
          'content-type': 'application/json',
          date: 'Sun, 27 Sep 2026 00:00:00 GMT',
          digest: 'SHA-256=abc',
          'x-target-host': 'default.pms',
          authorization: KEYVOX_AUTH,
        }),
      ).toEqual({
        'content-type': 'application/json',
        date: 'Sun, 27 Sep 2026 00:00:00 GMT',
        digest: 'SHA-256=abc',
        'x-target-host': 'default.pms',
        authorization: KEYVOX_AUTH,
      });
    });

    it('baycom は content-type と認証だけを送る', () => {
      expect(
        buildUpstreamHeaders('baycom', {
          ...platformHeaders,
          'content-type': 'application/json;charset=utf-8',
          authorization: BAYCOM_AUTH,
        }),
      ).toEqual({
        'content-type': 'application/json;charset=utf-8',
        authorization: BAYCOM_AUTH,
      });
    });

    it('jtbConnect は今と同じ2つだけを送り、認証ヘッダは送らない', () => {
      expect(
        buildUpstreamHeaders('jtbConnect', {
          ...platformHeaders,
          'content-type': 'application/json',
          'ocp-apim-subscription-key': 'sub-key',
          authorization: 'Basic c29tZXRoaW5n',
        }),
      ).toEqual({
        'Ocp-Apim-Subscription-Key': 'sub-key',
        'content-type': 'application/json',
      });
    });

    it('payPay は今と同じ綴りで送る', () => {
      expect(
        buildUpstreamHeaders('payPay', {
          ...platformHeaders,
          'content-type': 'application/json',
          'x-assume-merchant': 'merchant-1',
          authorization: PAYPAY_AUTH,
        }),
      ).toEqual({
        'X-ASSUME-MERCHANT': 'merchant-1',
        'content-type': 'application/json',
        Authorization: PAYPAY_AUTH,
      });
    });

    it('無いヘッダは送らない（GET の content-type など）', () => {
      expect(
        buildUpstreamHeaders('payPay', {
          'x-assume-merchant': 'merchant-1',
          authorization: PAYPAY_AUTH,
        }),
      ).toEqual({
        'X-ASSUME-MERCHANT': 'merchant-1',
        Authorization: PAYPAY_AUTH,
      });
    });
  });

  describe('付け替え後の api-nest（Authorization は Google の ID トークン）', () => {
    it.each([
      ['keyvox', KEYVOX_AUTH, 'authorization'],
      ['baycom', BAYCOM_AUTH, 'authorization'],
      ['payPay', PAYPAY_AUTH, 'Authorization'],
    ] as const)(
      '%s は X-Upstream-Authorization を上流の認証に戻し、Bearer は送らない',
      (integration, vendorAuth, name) => {
        const upstream = buildUpstreamHeaders(integration, {
          ...platformHeaders,
          authorization: GOOGLE_TOKEN,
          'x-upstream-authorization': vendorAuth,
        });
        expect(upstream[name]).toBe(vendorAuth);
        expect(Object.values(upstream)).not.toContain(GOOGLE_TOKEN);
        expect(
          Object.keys(upstream).map((key) => key.toLowerCase()),
        ).not.toContain('x-upstream-authorization');
      },
    );

    it('jtbConnect は Bearer を送らない', () => {
      const upstream = buildUpstreamHeaders('jtbConnect', {
        ...platformHeaders,
        'ocp-apim-subscription-key': 'sub-key',
        authorization: GOOGLE_TOKEN,
      });
      expect(upstream).toEqual({ 'Ocp-Apim-Subscription-Key': 'sub-key' });
    });
  });

  describe('形の合わない認証は送らない', () => {
    it.each(['keyvox', 'baycom', 'payPay'] as const)(
      '%s: Bearer は大小文字を問わず送らない',
      (integration) => {
        for (const token of [
          GOOGLE_TOKEN,
          GOOGLE_TOKEN.replace('Bearer', 'bearer'),
          GOOGLE_TOKEN.replace('Bearer', 'BEARER'),
        ]) {
          expect(
            buildUpstreamHeaders(integration, { authorization: token }),
          ).toEqual({});
          expect(
            buildUpstreamHeaders(integration, {
              'x-upstream-authorization': token,
            }),
          ).toEqual({});
        }
      },
    );

    it('他の連携の形の認証は送らない', () => {
      expect(
        buildUpstreamHeaders('keyvox', { authorization: BAYCOM_AUTH }),
      ).toEqual({});
      expect(
        buildUpstreamHeaders('baycom', { authorization: KEYVOX_AUTH }),
      ).toEqual({});
      expect(
        buildUpstreamHeaders('payPay', { authorization: KEYVOX_AUTH }),
      ).toEqual({});
    });
  });
});

describe('resolveUpstreamAuthorization', () => {
  it('X-Upstream-Authorization があれば renamed', () => {
    expect(
      resolveUpstreamAuthorization('keyvox', {
        authorization: GOOGLE_TOKEN,
        'x-upstream-authorization': KEYVOX_AUTH,
      }),
    ).toEqual({ value: KEYVOX_AUTH, source: 'renamed' });
  });

  it('Authorization だけなら legacy', () => {
    expect(
      resolveUpstreamAuthorization('baycom', { authorization: BAYCOM_AUTH }),
    ).toEqual({ value: BAYCOM_AUTH, source: 'legacy' });
  });

  it('どちらも形が合わなければ none', () => {
    expect(
      resolveUpstreamAuthorization('payPay', { authorization: GOOGLE_TOKEN }),
    ).toEqual({ source: 'none' });
  });

  it('jtbConnect は常に none', () => {
    expect(
      resolveUpstreamAuthorization('jtbConnect', {
        authorization: BAYCOM_AUTH,
      }),
    ).toEqual({ source: 'none' });
  });
});
