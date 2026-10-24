import { HttpError } from '../errors.js';

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { message: err.message, ...(err.details && { details: err.details }) },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Request body is not valid JSON' } });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.' } });
}
