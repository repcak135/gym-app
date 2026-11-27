// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { b64u, encryptPayload, sendPush, unb64u, vapidJwt } from './webpush';

// RFC 8291, section 5 and appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function rfcServerKeys(): Promise<CryptoKeyPair> {
  const pub = unb64u(RFC.asPublic);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: RFC.asPrivate };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return { privateKey, publicKey };
}

describe('webpush', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encrypts the RFC 8291 example byte for byte', async () => {
    const out = await encryptPayload(new TextEncoder().encode(RFC.plaintext), RFC.uaPublic, RFC.auth, unb64u(RFC.salt), await rfcServerKeys());
    expect(b64u(out)).toBe(RFC.body);
  });

  it('signs a VAPID JWT that verifies with the public key', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const jwt = await vapidJwt('https://web.push.apple.com', 'https://example.org/', jwk, 1_000_000_000_000);
    const [h, c, s] = jwt.split('.');
    const claims = JSON.parse(new TextDecoder().decode(unb64u(c)));
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', sub: 'https://example.org/', exp: 1_000_000_000 + 12 * 3600 });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, unb64u(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it('posts to the endpoint with the Web Push headers', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const vapidPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
    const res = await sendPush(
      { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: RFC.uaPublic, auth: RFC.auth } },
      { title: 'Koniec przerwy' },
      { publicKey: 'PUB', privateJwk: await crypto.subtle.exportKey('jwk', vapidPair.privateKey), subject: 'https://example.org/' },
    );
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(url).toBe('https://web.push.apple.com/abc');
    expect(h.TTL).toBe('60');
    expect(h.Urgency).toBe('high');
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=PUB$/);
  });
});
