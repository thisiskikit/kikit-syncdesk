import crypto from "crypto";

export function buildCoupangSignedDate(date = new Date()) {
  return `${date.toISOString().slice(2, 19).replace(/[-:]/g, "")}Z`;
}

export function createCoupangAuthorization(input: {
  accessKey: string;
  secretKey: string;
  method: string;
  path: string;
  query: string;
  signedDate?: string;
}) {
  const signedDate = input.signedDate ?? buildCoupangSignedDate();
  const signature = crypto
    .createHmac("sha256", input.secretKey)
    .update(`${signedDate}${input.method.toUpperCase()}${input.path}${input.query}`)
    .digest("hex");

  return {
    signedDate,
    authorization: `CEA algorithm=HmacSHA256, access-key=${input.accessKey}, signed-date=${signedDate}, signature=${signature}`,
  };
}
