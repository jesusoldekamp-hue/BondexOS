import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { expedientesRouter } from "./routes/expedientes.js";
import { healthRouter } from "./routes/health.js";
import { originadoresRouter } from "./routes/originadores.js";
import { createSupabaseServices } from "./services/supabaseServices.js";
import type { AppServices } from "./services/types.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";

export interface CreateAppOptions {
  services?: AppServices;
  webOrigin?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const services = options.services ?? createSupabaseServices();

  app.locals.services = services;

  app.use(helmet());
  app.use(
    cors({
      origin: options.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:3000",
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("combined"));

  app.use(healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/originadores", originadoresRouter);
  app.use("/api/v1/expedientes", expedientesRouter);
  app.use("/api/v1/ai", aiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
