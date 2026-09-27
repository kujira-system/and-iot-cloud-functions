// 中継が上流(先方)へ送るヘッダを、連携ごとの許可リストで組み立てる(DMS-1277)。
//
// 関数を IAM 認証(gen1)にすると、Authorization は Google の ID トークンで埋まる。
// そのため api-nest は、先方の認証を X-Upstream-Authorization で送ってくる。ここでそれを上流の Authorization に戻す。
// 移行期(api-nest がまだ付け替えていない間)は、受け取った Authorization もそのまま使う。
// どちらも連携ごとの形に合うときだけ送るので、Google の ID トークン(Bearer)は先方へ渡らない。
import type { IncomingHttpHeaders } from 'http';

export type RelayIntegration = 'keyvox' | 'baycom' | 'jtbConnect' | 'payPay';

export const RELAY_INTEGRATIONS: RelayIntegration[] = [
  'keyvox',
  'baycom',
  'jtbConnect',
  'payPay',
];

export const UPSTREAM_AUTHORIZATION_HEADER = 'x-upstream-authorization';

type UpstreamHeaderRule = {
  // 受け取ったヘッダのうち、そのまま上流へ送るもの。上流へはこの綴りで送る
  forward: string[];
  // 上流の認証ヘッダ。形(pattern)に合う値だけを name の綴りで送る。null は認証ヘッダを送らない
  authorization: { name: string; pattern: RegExp } | null;
};

export const UPSTREAM_HEADER_RULES: Record<
  RelayIntegration,
  UpstreamHeaderRule
> = {
  keyvox: {
    forward: ['content-type', 'date', 'digest', 'x-target-host'],
    authorization: { name: 'authorization', pattern: /^hmac\s+username=/i },
  },
  baycom: {
    forward: ['content-type'],
    authorization: { name: 'authorization', pattern: /^basic\s+\S/i },
  },
  jtbConnect: {
    forward: ['Ocp-Apim-Subscription-Key', 'content-type'],
    authorization: null,
  },
  payPay: {
    forward: ['X-ASSUME-MERCHANT', 'content-type'],
    authorization: { name: 'Authorization', pattern: /^hmac\s+OPA-Auth:/i },
  },
};

// renamed: X-Upstream-Authorization から取った / legacy: 受け取った Authorization から取った(移行期) / none: 送らない
export type UpstreamAuthorizationSource = 'renamed' | 'legacy' | 'none';

const headerValue = (
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined => {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value;
};

export const resolveUpstreamAuthorization = (
  integration: RelayIntegration,
  headers: IncomingHttpHeaders,
): { value?: string; source: UpstreamAuthorizationSource } => {
  const rule = UPSTREAM_HEADER_RULES[integration].authorization;
  if (!rule) {
    return { source: 'none' };
  }
  const renamed = headerValue(headers, UPSTREAM_AUTHORIZATION_HEADER);
  if (renamed !== undefined && rule.pattern.test(renamed)) {
    return { value: renamed, source: 'renamed' };
  }
  const legacy = headerValue(headers, 'authorization');
  if (legacy !== undefined && rule.pattern.test(legacy)) {
    return { value: legacy, source: 'legacy' };
  }
  return { source: 'none' };
};

export const buildUpstreamHeaders = (
  integration: RelayIntegration,
  headers: IncomingHttpHeaders,
): Record<string, string> => {
  const rule = UPSTREAM_HEADER_RULES[integration];
  const upstream: Record<string, string> = {};
  for (const name of rule.forward) {
    const value = headerValue(headers, name);
    if (value !== undefined) {
      upstream[name] = value;
    }
  }
  const authorization = resolveUpstreamAuthorization(integration, headers);
  if (rule.authorization && authorization.value !== undefined) {
    upstream[rule.authorization.name] = authorization.value;
  }
  return upstream;
};
