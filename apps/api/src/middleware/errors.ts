import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "http_error"
  ) {
    super(message);
  }
}

function isCodedHttpError(error: unknown): error is { statusCode: number; code: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "Ruta no encontrada.", "not_found"));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  if (isCodedHttpError(error)) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Error desconocido.";
  res.status(500).json({
    error: {
      code: "internal_server_error",
      message
    }
  });
};
