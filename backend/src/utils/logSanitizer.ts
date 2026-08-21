// 認証系ヘッダーをログに出さないためのマスク
const SENSITIVE_HEADER_NAMES = [
  'authorization',
  'ocp-apim-subscription-key',
  'x-assume-merchant',
  'apikey',
  'api-key',
  'x-api-key',
  'sign',
  'cookie',
  'x-auth-token',
];

export const maskHeadersForLog = (headers: Record<string, any>) => {
  const masked: Record<string, any> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    masked[key] = SENSITIVE_HEADER_NAMES.includes(key.toLowerCase()) ? '***MASKED***' : value;
  }
  return masked;
};

// 障害発生時にベンダーへ問い合わせるための追跡IDだけを抽出する。
// レスポンスヘッダーにはSet-Cookie等の機微情報も含まれうるため、許可リスト方式で絞る。
const TRACE_HEADER_NAMES = [
  'x-request-id',
  'x-correlation-id',
  'x-amzn-requestid',
  'x-amz-request-id',
];

const pickTraceHeadersForLog = (headers: any) => {
  // axiosのレスポンスヘッダーはAxiosHeadersインスタンスのためプレーンオブジェクトに変換する
  const plain = typeof headers?.toJSON === 'function' ? headers.toJSON() : headers;
  const picked: Record<string, any> = {};
  for (const [key, value] of Object.entries(plain ?? {})) {
    if (TRACE_HEADER_NAMES.includes(key.toLowerCase())) {
      picked[key.toLowerCase()] = value;
    }
  }
  return picked;
};

// axiosエラーのtoJSON()はconfig.headers(認証ヘッダー含む)を丸ごと含むため使用禁止
export const formatErrorForLog = (e: any) => JSON.stringify({
  message: e.message,
  code: e.code,
  status: e.response?.status,
  method: e.config?.method,
  url: e.config?.url,
  // PayPayの401はレスポンス本文に追跡IDを含まないため、ここが唯一の手掛かりになる
  traceHeaders: pickTraceHeadersForLog(e.response?.headers),
});
