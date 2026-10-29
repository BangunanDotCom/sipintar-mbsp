const string = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const email = { type: "string", format: "email" };
const date = { type: "string", format: "date-time" };
const password = {
  type: "string",
  minLength: 12,
  maxLength: 128,
  description: "Huruf besar, huruf kecil, nombor dan simbol.",
};
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required });
const appointment = {
  roleId: string,
  departmentId: string,
  districtId: { type: "string", enum: ["SPU", "SPT", "SPS"] },
  reference: string,
  startsAt: date,
  endsAt: date,
};
const bodies: Record<string, unknown> = {
  "POST /api/auth/register": object({
    name: string,
    identificationNumber: {
      type: "string",
      minLength: 6,
      maxLength: 30,
      description:
        "MyKad/pasport; dinormalisasi. Hanya nombor bertopeng dipulangkan.",
    },
    email,
    phone: string,
    password,
    consent: { type: "boolean", const: true },
  }),
  "POST /api/auth/login": object({ email, password: { type: "string" } }),
  "POST /api/auth/role": object({ roleId: string }),
  "POST /api/auth/activate": object(
    {
      token: { type: "string", minLength: 64, maxLength: 64 },
      type: {
        type: "string",
        enum: ["VERIFY_EMAIL", "OFFICER_INVITE", "RESET_PASSWORD"],
      },
      password,
    },
    ["token", "type"],
  ),
  "POST /api/auth/recover": object(
    {
      email,
      type: { type: "string", enum: ["RESET_PASSWORD", "VERIFY_EMAIL"] },
    },
    ["email"],
  ),
  "POST /api/auth/password": object({ currentPassword: string, password }),
  "POST /api/auth/mfa/verify": object({
    code: { type: "string", pattern: "^\\d{6}$" },
  }),
  "POST /api/auth/mfa/recovery": object({ code: uuid }),
  "PATCH /api/profile": object({ name: string, phone: string }),
  "POST /api/companies": object(
    {
      name: string,
      registrationNumber: string,
      address: string,
      phone: string,
      email,
      authorityType: {
        type: "string",
        enum: ["PENGARAH", "PEKERJA", "WAKIL_DIBERI_KUASA"],
      },
      endsAt: date,
    },
    [
      "name",
      "registrationNumber",
      "address",
      "phone",
      "email",
      "authorityType",
    ],
  ),
  "PATCH /api/companies/:id": object({
    name: string,
    address: string,
    phone: string,
    email,
  }),
  "POST /api/profile/identification": object({
    identificationNumber: string,
    currentPassword: string,
  }),
  "POST /api/companies/:id/invitations": object(
    { email, authorityType: string, endsAt: date },
    ["email", "authorityType"],
  ),
  "POST /api/company-invitations/preview": object({
    token: { type: "string", minLength: 64, maxLength: 64 },
  }),
  "POST /api/company-invitations/accept": object({
    token: { type: "string", minLength: 64, maxLength: 64 },
  }),
  "POST /api/companies/:id/representatives": object(
    { email, authorityType: string, endsAt: date },
    ["email", "authorityType"],
  ),
  "POST /api/companies/:id/documents": object(
    {
      fileName: {
        type: "string",
        description: "Nama fail .pdf tanpa pemisah laluan.",
      },
      content: {
        type: "string",
        contentEncoding: "base64",
        description: "PDF maksimum 2 MiB, tandatangan %PDF- diperlukan.",
      },
      validUntil: date,
    },
    ["fileName", "content"],
  ),
  "POST /api/representations/:id/verify": object({
    status: { type: "string", enum: ["VERIFIED", "DOCUMENT_UPDATE_REQUIRED"] },
    reason: string,
  }),
  "POST /api/admin/officers": object(
    { name: string, email, phone: string, ...appointment },
    ["name", "email", "phone", "roleId", "departmentId", "reference"],
  ),
  "PATCH /api/admin/users/:id/status": object({
    status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
    reason: string,
  }),
  "POST /api/admin/users/:id/mfa-reset": object({
    reason: { type: "string", minLength: 10 },
  }),
  "POST /api/admin/users/:id/roles": object(appointment, [
    "roleId",
    "departmentId",
    "reference",
    "startsAt",
  ]),
  "POST /api/areas": object({
    name: string,
    districtId: { type: "string", enum: ["SPU", "SPT", "SPS"] },
  }),
  "POST /api/areas/assign": object({
    areaId: uuid,
    userId: uuid,
    reason: { type: "string", minLength: 10 },
  }),
  "POST /api/templates": object({
    name: string,
    category: string,
    content: string,
  }),
  "POST /api/templates/:id/versions": object({ content: string }),
  "POST /api/config/:scope": object({
    key: string,
    value: { oneOf: [string, { type: "number" }, { type: "boolean" }] },
    reason: string,
  }),
};
export const transformOpenApi = ({ schema, url, route }: any) => {
  const method = Array.isArray(route.method) ? route.method[0] : route.method;
  const publicRoute =
    url.startsWith("/api/public/") ||
    url === "/api/health" ||
    [
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/activate",
      "/api/auth/recover",
    ].includes(url);
  const group = url.startsWith("/api/auth")
    ? "Authentication"
    : url.startsWith("/api/admin")
      ? "Administration"
      : "Services";
  return {
    url,
    schema: {
      ...schema,
      tags: [group],
      summary: `${method} ${url}`,
      security: publicRoute ? [] : [{ sessionCookie: [] }],
      ...(bodies[`${method} ${url}`]
        ? { body: bodies[`${method} ${url}`] }
        : {}),
      description: publicRoute
        ? "Endpoint awam. Kadar permintaan dihadkan."
        : "Memerlukan sesi sah. Pegawai memerlukan MFA. Mutasi memerlukan Origin sepadan APP_ORIGIN dan header X-CSRF-Token. RBAC dan skop pelantikan disemak dalam backend.",
    },
  };
};
