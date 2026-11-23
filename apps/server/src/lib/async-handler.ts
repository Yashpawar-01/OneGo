import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/** Express 4 does not forward rejected promises; this wrapper does. */
export function asyncHandler(handler: AsyncRoute): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
