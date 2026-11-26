import { isIP } from "node:net";
import { closeMailer } from "./core.js";
import { transformOpenApi } from "./openapi.js";
import Fastify, { LogController } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import {
  postgresRepositories,
  registerRepositoryRoutes,
  type DatabaseRepositories,
} from "./database-provider.js";

import { safeServerFailure } from "./errors.js";
import type { OracleLabRepositories } from "./oracle/provider.js";
import { syntheticPortalRoutes } from "./synthetic-portal.js";
export const requestLogRedactions = [
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers['x-csrf-token']",
  "req.headers['x-staylink-synthetic-signature']",
  "req.body",
  "res.headers.set-cookie",
];

export async function buildApp() {
  return buildWithRepositories(postgresRepositories);
}

export async function buildOracleLabApp(repositories: OracleLabRepositories) {
  if (process.env.NODE_ENV !== "test")
    throw Error("API Oracle separa hanya tersedia dalam proses ujian.");
  const app = await buildWithRepositories(
    repositories,
    repositories.checkConnection,
    repositories.training,
  );
  await repositories.registerDelegationLab(app);
  await repositories.registerSyntheticLab(app);
  return app;
}

async function buildWithRepositories(
  repositories: DatabaseRepositories,
  oracleLabHealth?: () => Promise<void>,
  training?: () => { review: boolean; completion: boolean; reminders: boolean },
) {
  const app = Fastify({
    // Base64 JSON uploads up to 10 MiB require approximately 13.34 MiB.
    // Per-document validation remains mandatory in the upload route.
    bodyLimit: 29 * 1024 * 1024,
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
      redact: requestLogRedactions,
    },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator(request) {
      const client = request.headers["x-staylink-demo-client"];
      // The approved reverse proxy replaces this header and Fastify binds to loopback.
      return process.env.STAYLINK_DEMO_HOST === "true" &&
        request.ip === "127.0.0.1" &&
        typeof client === "string" &&
        isIP(client)
        ? client
        : request.ip;
    },
  });
  await app.register(swagger, {
    transform: transformOpenApi,
    openapi: {
      info: { title: "STAYLink MBSP API", version: "0.1.0" },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: "staylink" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });
  app.setErrorHandler(async (error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ message: error.issues.map((i) => i.message).join(" ") });
    const e = error as any;
    if (e.code === "P2002")
      return reply
        .code(409)
        .send({ message: "Rekod bertindih. Semak maklumat yang dimasukkan." });
    if (e.code === "P2025")
      return reply.code(404).send({ message: "Rekod tidak ditemui." });
    if (!e.statusCode || e.statusCode >= 500) {
      const failure = safeServerFailure(error);
      app.log.error(
        {
          code: failure.code,
          diagnosticCode: failure.diagnosticCode,
          requestId: req.id,
          operation: req.routeOptions.url || "unknown",
        },
        "Ralat dalaman",
      );
      return reply.code(failure.status).send({
        message: failure.message,
        code: failure.code,
        requestId: req.id,
      });
    }
    return reply.code(e.statusCode).send({ message: e.message });
  });
  app.get("/api/health", async () => {
    await oracleLabHealth?.();
    return { status: "ok", service: "STAYLink MBSP" };
  });
  app.addHook("onClose", async () => {
    closeMailer();
  });
  await registerRepositoryRoutes(app, repositories, training);
  if (!oracleLabHealth) {
    await syntheticPortalRoutes(app);
  }
  return app;
}
