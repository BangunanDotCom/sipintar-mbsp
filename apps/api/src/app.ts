import { closeMailer } from "./core.js";
import { transformOpenApi } from "./openapi.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { authRoutes } from "./auth.js";
import { routes } from "./routes.js";
export async function buildApp() {
  const app = Fastify({
    bodyLimit: 3 * 1024 * 1024,
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.body",
        "res.headers.set-cookie",
      ],
    },
    disableRequestLogging: true,
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
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
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
  app.setErrorHandler(async (error, _req, reply) => {
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
    const status = e.statusCode || 500;
    if (status >= 500)
      app.log.error({ code: e.code || e.name }, "Ralat dalaman");
    return reply.code(status).send({
      message:
        status >= 500
          ? "Perkhidmatan tidak dapat diproses. Cuba lagi."
          : e.message,
    });
  });
  app.get("/api/health", async () => ({
    status: "ok",
    service: "STAYLink MBSP",
  }));
  app.addHook("onClose", async () => {
    closeMailer();
  });
  await authRoutes(app);
  await routes(app);
  return app;
}
