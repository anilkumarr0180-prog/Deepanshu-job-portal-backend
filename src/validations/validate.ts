import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";

const setRequestProperty = (
  req: Request,
  key: "body" | "query" | "params",
  value: any
) => {
  try {
    req[key] = value;
  } catch {
    Object.defineProperty(req, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
};

export const validate =
  (schema: ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      if (result) {
        const parsed = result as { body?: any; query?: any; params?: any };
        if (parsed.body !== undefined) setRequestProperty(req, "body", parsed.body);
        if (parsed.query !== undefined) setRequestProperty(req, "query", parsed.query);
        if (parsed.params !== undefined) setRequestProperty(req, "params", parsed.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: "Validation failed.",
          errors: error.issues.map((issue) => ({
            field: issue.path.join(".").replace(/^(body|query|params)\./, ""),
            message: issue.message,
          })),
        });
        return;
      }

      next(error);
    }
  };


