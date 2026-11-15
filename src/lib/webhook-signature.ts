import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  const received = Buffer.from(signature.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
