export function notFoundHandler(req, res) {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "API endpoint not found." });
  }
  return res.status(404).json({ message: "Resource not found." });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const status =
    Number(error.statusCode || error.status) ||
    (error.name === "ValidationError" ? 400 : 500);

  const message =
    error.name === "ValidationError"
      ? Object.values(error.errors || {}).map(x => x.message).join("; ") || error.message
      : error.message || "Internal server error.";

  const body = { message };
  if (process.env.NODE_ENV !== "production" && error.stack) body.stack = error.stack;

  console.error("[API ERROR]", {
    method: req.method,
    path: req.originalUrl,
    status,
    error: error.message
  });

  return res.status(status).json(body);
}
