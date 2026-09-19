import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIpv6(ip: string) {
  const value = ip.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

function isPrivateIp(ip: string) {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return true;
}

export function assertSafeHttpsStructure(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("External fetches require HTTPS.");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Local/private hosts are blocked.");
  if (net.isIP(host) && isPrivateIp(host)) throw new Error("Private IP addresses are blocked.");
  return url;
}

export async function assertPublicHttps(input: string) {
  const url = assertSafeHttpsStructure(input);
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error("Host resolves to a private or invalid address.");
  return url;
}

async function readLimited(response: Response, maxBytes: number) {
  const announced = Number(response.headers.get("content-length") || 0);
  if (announced > maxBytes) throw new Error(`Response is too large (${announced} bytes; max ${maxBytes}).`);
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded the ${maxBytes} byte safety limit.`);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export async function safeFetchText(input: string, options?: { maxBytes?: number; headers?: Record<string, string> }) {
  let current = await assertPublicHttps(input);
  const maxBytes = options?.maxBytes ?? 600_000;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Accept": "application/json,text/plain,text/markdown,text/html,application/xml,text/xml;q=0.8,*/*;q=0.2",
          "User-Agent": "Huthayfa-JARVIS/0.5",
          ...(options?.headers || {}),
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect response had no Location header.");
        current = await assertPublicHttps(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await readLimited(response, Math.min(maxBytes, 20_000))).slice(0, 1000)}`);
      const contentType = response.headers.get("content-type") || "";
      if (/image|audio|video|octet-stream|zip|pdf/i.test(contentType)) throw new Error(`Binary content type is blocked: ${contentType || "unknown"}`);
      return { url: current.toString(), status: response.status, contentType, text: await readLimited(response, maxBytes) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects.");
}
