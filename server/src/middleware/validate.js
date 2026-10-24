import { badRequest } from '../errors.js';

/** validate(schema, 'body' | 'query' | 'params') - replaces req[source] with the parsed value. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(badRequest('Validation failed', details));
  }
  Object.defineProperty(req, source, { value: result.data, writable: true });
  next();
};
