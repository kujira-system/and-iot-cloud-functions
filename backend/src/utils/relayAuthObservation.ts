// 中継の呼び出し元の観測(DMS-1277)。IAM 認証へ切り替える前に、次のことをログで確かめる。
// - すべての呼び出しが api-nest の ID トークン付きになったか
// - api-nest 以外からの呼び出しが無いか
//
// トークンは署名を検証せず、中身を読むだけ。関数が公開のうちは偽造できるので、判断ではなく観測だけに使う。
// ヘッダの値そのものや、x-appengine-city などの位置情報は出さない。
import type { IncomingHttpHeaders } from 'http';
import {
  RELAY_INTEGRATIONS,
  RelayIntegration,
  UpstreamAuthorizationSource,
  resolveUpstreamAuthorization,
} from './upstreamHeaders';

const MAX_TOKEN_LENGTH = 4096;
const MAX_CLAIM_LENGTH = 200;
const MAX_USER_AGENT_LENGTH = 80;

export type RelayAuthObservation = {
  event: 'relayAuth';
  integration: RelayIntegration | 'other';
  method: string;
  bearer: boolean;
  aud?: string;
  email?: string;
  expInSec?: number;
  upstreamAuth: UpstreamAuthorizationSource;
  ua?: string;
  src?: string;
};

// 関数の中では、パスは /api/<連携>/... で届く(関数名の部分は剥がされる)
export const integrationFromPath = (
  path: string,
): RelayIntegration | 'other' => {
  const matched = /^\/api\/([^/?]+)/.exec(path ?? '');
  const name = matched?.[1] as RelayIntegration | undefined;
  return name && RELAY_INTEGRATIONS.includes(name) ? name : 'other';
};

const truncate = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? value.slice(0, max) : undefined;

const firstHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// 送信元は、IPv4 なら上位2オクテット、IPv6 なら上位2ブロックまでにする
export const maskSourceAddress = (
  forwardedFor: string | undefined,
): string | undefined => {
  const first = forwardedFor?.split(',')[0]?.trim();
  if (!first) {
    return undefined;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(first)) {
    const [a, b] = first.split('.');
    return `${a}.${b}.x.x`;
  }
  if (first.includes(':')) {
    const [a, b] = first.split(':');
    return `${a}:${b}::/32`;
  }
  return 'unknown';
};

type BearerClaims = Pick<RelayAuthObservation, 'aud' | 'email' | 'expInSec'>;

export const decodeBearerClaims = (
  authorization: string | undefined,
  nowSec: number,
): { bearer: boolean; claims: BearerClaims } => {
  const matched = /^bearer\s+(\S+)$/i.exec(authorization ?? '');
  if (!matched) {
    return { bearer: false, claims: {} };
  }
  const token = matched[1];
  if (token.length > MAX_TOKEN_LENGTH) {
    return { bearer: true, claims: {} };
  }
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    const exp = typeof payload?.exp === 'number' ? payload.exp : undefined;
    return {
      bearer: true,
      claims: {
        aud: truncate(payload?.aud, MAX_CLAIM_LENGTH),
        email: truncate(payload?.email, MAX_CLAIM_LENGTH),
        expInSec: exp === undefined ? undefined : Math.round(exp - nowSec),
      },
    };
  } catch {
    return { bearer: true, claims: {} };
  }
};

export const describeRelayRequest = (
  path: string,
  method: string,
  headers: IncomingHttpHeaders,
  nowSec: number = Date.now() / 1000,
): RelayAuthObservation => {
  const integration = integrationFromPath(path);
  const { bearer, claims } = decodeBearerClaims(
    firstHeader(headers['authorization']),
    nowSec,
  );
  return {
    event: 'relayAuth',
    integration,
    method,
    bearer,
    ...claims,
    upstreamAuth:
      integration === 'other'
        ? 'none'
        : resolveUpstreamAuthorization(integration, headers).source,
    ua: truncate(firstHeader(headers['user-agent']), MAX_USER_AGENT_LENGTH),
    src: maskSourceAddress(firstHeader(headers['x-forwarded-for'])),
  };
};
