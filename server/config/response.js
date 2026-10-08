export function sendError(res, status, message, details = undefined) {
  const body = { message: String(message || "Request failed.") };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
