import {
  decodeBearerClaims,
  describeRelayRequest,
  integrationFromPath,
  maskSourceAddress,
} from './relayAuthObservation';

const NOW = 1_790_000_000;

const encode = (value: object | string) =>
  Buffer.from(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).toString('base64url');

const bearer = (payload: object | string) =>
  `Bearer ${encode({ alg: 'RS256' })}.${encode(payload)}.c2lnbmF0dXJl`;

const SA = 'and-iot-api-stg@appspot.gserviceaccount.com';
const AUD =
  'https://asia-northeast1-and-iot-api-stg.cloudfunctions.net/and-iot-cloud-functions-stg';

describe('integrationFromPath', () => {
  it.each([
    ['/api/keyvox/getUnits', 'keyvox'],
    ['/api/baycom/rest/devices', 'baycom'],
    ['/api/jtbConnect/api/v1/roomstatus', 'jtbConnect'],
    ['/api/payPay/PROD/v2/codes', 'payPay'],
    ['/api/payPay?x=1', 'payPay'],
    ['/api', 'other'],
    ['/api/hackerNews', 'other'],
    ['/', 'other'],
  ])('%s → %s', (path, expected) => {
    expect(integrationFromPath(path)).toBe(expected);
  });
});

describe('maskSourceAddress', () => {
  it.each([
    ['34.84.117.68', '34.84.x.x'],
    ['34.84.117.68, 169.254.1.1', '34.84.x.x'],
    ['2001:db8:1:2::1', '2001:db8::/32'],
    ['garbage', 'unknown'],
  ])('%s → %s', (input, expected) => {
    expect(maskSourceAddress(input)).toBe(expected);
  });

  it('無ければ undefined', () => {
    expect(maskSourceAddress(undefined)).toBeUndefined();
    expect(maskSourceAddress('')).toBeUndefined();
  });
});

describe('decodeBearerClaims', () => {
  it('Bearer でなければ bearer=false', () => {
    expect(decodeBearerClaims('Basic dXNlcjpwYXNz', NOW)).toEqual({
      bearer: false,
      claims: {},
    });
    expect(decodeBearerClaims(undefined, NOW)).toEqual({
      bearer: false,
      claims: {},
    });
  });

  it('aud・email・期限までの秒数だけを取り出す', () => {
    const token = bearer({
      aud: AUD,
      email: SA,
      exp: NOW + 3000,
      sub: '123',
      google: { compute_engine: { instance_name: 'aef-default-xxx' } },
    });
    expect(decodeBearerClaims(token, NOW)).toEqual({
      bearer: true,
      claims: { aud: AUD, email: SA, expInSec: 3000 },
    });
  });

  it('小文字の bearer も読む', () => {
    const token = bearer({ aud: AUD, email: SA, exp: NOW });
    expect(decodeBearerClaims(token.replace('Bearer', 'bearer'), NOW)).toEqual({
      bearer: true,
      claims: { aud: AUD, email: SA, expInSec: 0 },
    });
  });

  it('壊れたトークンでも落ちない', () => {
    expect(decodeBearerClaims('Bearer not-a-jwt', NOW)).toEqual({
      bearer: true,
      claims: {},
    });
    expect(
      decodeBearerClaims(`Bearer x.${encode('{not json')}.y`, NOW),
    ).toEqual({ bearer: true, claims: {} });
  });

  it('文字列以外のクレームや長すぎる値は出さない・切り詰める', () => {
    const token = bearer({
      aud: ['a', 'b'],
      email: 'x'.repeat(500),
      exp: 'soon',
    });
    expect(decodeBearerClaims(token, NOW)).toEqual({
      bearer: true,
      claims: { aud: undefined, email: 'x'.repeat(200), expInSec: undefined },
    });
  });

  it('長すぎるトークンは読まない', () => {
    expect(decodeBearerClaims(`Bearer ${'a'.repeat(5000)}`, NOW)).toEqual({
      bearer: true,
      claims: {},
    });
  });
});

describe('describeRelayRequest', () => {
  it('付け替え後の api-nest の呼び出し', () => {
    expect(
      describeRelayRequest(
        '/api/keyvox/getUnits',
        'POST',
        {
          authorization: bearer({ aud: AUD, email: SA, exp: NOW + 3500 }),
          'x-upstream-authorization': 'hmac username="acc", signature="s"',
          'user-agent': 'axios/1.16.1',
          'x-forwarded-for': '34.84.117.68',
          'x-appengine-city': 'tokyo',
          'x-appengine-user-ip': '34.84.117.68',
        },
        NOW,
      ),
    ).toEqual({
      event: 'relayAuth',
      integration: 'keyvox',
      method: 'POST',
      bearer: true,
      aud: AUD,
      email: SA,
      expInSec: 3500,
      upstreamAuth: 'renamed',
      ua: 'axios/1.16.1',
      src: '34.84.x.x',
    });
  });

  it('今の api-nest の呼び出し（legacy）', () => {
    expect(
      describeRelayRequest(
        '/api/payPay/STAGING/v2/codes',
        'POST',
        {
          authorization: 'hmac OPA-Auth:client:mac:nonce:1:hash',
          'user-agent': 'x'.repeat(200),
        },
        NOW,
      ),
    ).toEqual({
      event: 'relayAuth',
      integration: 'payPay',
      method: 'POST',
      bearer: false,
      upstreamAuth: 'legacy',
      ua: 'x'.repeat(80),
      src: undefined,
    });
  });

  it('連携以外のパス', () => {
    expect(describeRelayRequest('/api', 'GET', {}, NOW)).toMatchObject({
      integration: 'other',
      bearer: false,
      upstreamAuth: 'none',
    });
  });

  it('ヘッダの値そのものは出さない', () => {
    const line = JSON.stringify(
      describeRelayRequest(
        '/api/baycom/rest/devices',
        'GET',
        {
          authorization: 'Basic dXNlcjpwYXNz',
          'x-appengine-city': 'tokyo',
          'x-appengine-citylatlong': '35.0,139.0',
        },
        NOW,
      ),
    );
    expect(line).not.toContain('dXNlcjpwYXNz');
    expect(line).not.toContain('tokyo');
    expect(line).not.toContain('139.0');
  });
});
