import type { ScoringMode, ScoringModeChange, ScoringModeConfig } from "@aharadar/db";
import type { FastifyInstance } from "fastify";
import { getDb, getUserIdWithFallback } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Format ScoringMode for API response */
function formatScoringMode(mode: ScoringMode) {
  return {
    id: mode.id,
    userId: mode.userId,
    name: mode.name,
    description: mode.description,
    config: mode.config,
    notes: mode.notes,
    isDefault: mode.isDefault,
    createdAt: mode.createdAt.toISOString(),
    updatedAt: mode.updatedAt.toISOString(),
  };
}

/** Format ScoringModeChange for API response */
function formatScoringModeChange(change: ScoringModeChange) {
  return {
    id: change.id,
    userId: change.userId,
    topicId: change.topicId,
    previousModeId: change.previousModeId,
    newModeId: change.newModeId,
    reason: change.reason,
    changedAt: change.changedAt.toISOString(),
  };
}

/** Validate partial ScoringModeConfig weights */
function validateWeights(
  weights: unknown,
):
  | { valid: true; weights: Partial<ScoringModeConfig["weights"]> }
  | { valid: false; error: string } {
  if (weights === undefined || weights === null) {
    return { valid: true, weights: {} };
  }

  if (typeof weights !== "object" || Array.isArray(weights)) {
    return { valid: false, error: "weights must be an object" };
  }

  const w = weights as Record<string, unknown>;
  const validated: Partial<ScoringModeConfig["weights"]> = {};

  for (const key of ["wAha", "wHeuristic", "wPref", "wNovelty"] as const) {
    if (w[key] !== undefined) {
      if (typeof w[key] !== "number" || !Number.isFinite(w[key] as number)) {
        return { valid: false, error: `${key} must be a finite number` };
      }
      const val = w[key] as number;
      if (val < 0 || val > 1) {
        return { valid: false, error: `${key} must be between 0 and 1` };
      }
      validated[key] = val;
    }
  }

  return { valid: true, weights: validated };
}

/** Validate partial ScoringModeConfig features */
function validateFeatures(
  features: unknown,
):
  | { valid: true; features: Partial<ScoringModeConfig["features"]> }
  | { valid: false; error: string } {
  if (features === undefined || features === null) {
    return { valid: true, features: {} };
  }

  if (typeof features !== "object" || Array.isArray(features)) {
    return { valid: false, error: "features must be an object" };
  }

  const f = features as Record<string, unknown>;
  const validated: Partial<ScoringModeConfig["features"]> = {};

  for (const key of [
    "perSourceCalibration",
    "aiPreferenceInjection",
    "embeddingPreferences",
  ] as const) {
    if (f[key] !== undefined) {
      if (typeof f[key] !== "boolean") {
        return { valid: false, error: `${key} must be a boolean` };
      }
      validated[key] = f[key] as boolean;
    }
  }

  return { valid: true, features: validated };
}

/** Validate partial ScoringModeConfig calibration */
function validateCalibration(
  calibration: unknown,
):
  | { valid: true; calibration: Partial<ScoringModeConfig["calibration"]> }
  | { valid: false; error: string } {
  if (calibration === undefined || calibration === null) {
    return { valid: true, calibration: {} };
  }

  if (typeof calibration !== "object" || Array.isArray(calibration)) {
    return { valid: false, error: "calibration must be an object" };
  }

  const c = calibration as Record<string, unknown>;
  const validated: Partial<ScoringModeConfig["calibration"]> = {};

  if (c.windowDays !== undefined) {
    if (typeof c.windowDays !== "number" || !Number.isInteger(c.windowDays)) {
      return { valid: false, error: "windowDays must be an integer" };
    }
    if (c.windowDays < 1 || c.windowDays > 365) {
      return { valid: false, error: "windowDays must be between 1 and 365" };
    }
    validated.windowDays = c.windowDays;
  }

  if (c.minSamples !== undefined) {
    if (typeof c.minSamples !== "number" || !Number.isInteger(c.minSamples)) {
      return { valid: false, error: "minSamples must be an integer" };
    }
    if (c.minSamples < 1 || c.minSamples > 1000) {
      return { valid: false, error: "minSamples must be between 1 and 1000" };
    }
    validated.minSamples = c.minSamples;
  }

  if (c.maxOffset !== undefined) {
    if (typeof c.maxOffset !== "number" || !Number.isFinite(c.maxOffset)) {
      return { valid: false, error: "maxOffset must be a finite number" };
    }
    if (c.maxOffset < 0 || c.maxOffset > 1) {
      return { valid: false, error: "maxOffset must be between 0 and 1" };
    }
    validated.maxOffset = c.maxOffset;
  }

  return { valid: true, calibration: validated };
}

export async function scoringModesRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /scoring-modes - List all scoring modes for current user
  fastify.get("/scoring-modes", async (request, reply) => {
    const userId = await getUserIdWithFallback(request);
    if (!userId) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "No user context available",
        },
      });
    }

    const db = getDb();
    const modes = await db.scoringModes.listByUser(userId);

    return {
      ok: true,
      modes: modes.map(formatScoringMode),
    };
  });

  // GET /scoring-modes/default - Get the default scoring mode for current user
  fastify.get("/scoring-modes/default", async (request, reply) => {
    const userId = await getUserIdWithFallback(request);
    if (!userId) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "No user context available",
        },
      });
    }

    const db = getDb();
    const mode = await db.scoringModes.getDefaultForUser(userId);

    if (!mode) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No default scoring mode found",
        },
      });
    }

    return {
      ok: true,
      mode: formatScoringMode(mode),
    };
  });

  // GET /scoring-modes/audit - Get audit log of mode changes
  fastify.get<{ Querystring: { topicId?: string; limit?: string } }>(
    "/scoring-modes/audit",
    async (request, reply) => {
      const userId = await getUserIdWithFallback(request);
      if (!userId) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: "NOT_INITIALIZED",
            message: "No user context available",
          },
        });
      }

      const { topicId, limit: limitStr } = request.query;

      if (topicId !== undefined && !isValidUuid(topicId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "topicId must be a valid UUID",
          },
        });
      }

      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      if (Number.isNaN(limit) || limit < 1 || limit > 500) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "limit must be a number between 1 and 500",
          },
        });
      }

      const db = getDb();
      const changes = await db.scoringModes.getChanges({
        userId,
        topicId: topicId ?? null,
        limit,
      });

      return {
        ok: true,
        changes: changes.map(formatScoringModeChange),
      };
    },
  );

  // GET /scoring-modes/:id - Get a specific scoring mode
  fastify.get<{ Params: { id: string } }>("/scoring-modes/:id", async (request, reply) => {
    const userId = await getUserIdWithFallback(request);
    if (!userId) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "No user context available",
        },
      });
    }

    const { id } = request.params;

    if (!isValidUuid(id)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "id must be a valid UUID",
        },
      });
    }

    const db = getDb();
    const mode = await db.scoringModes.getById(id);

    if (!mode) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Scoring mode not found: ${id}`,
        },
      });
    }

    // Verify ownership
    if (mode.userId !== userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Scoring mode does not belong to current user",
        },
      });
    }

    return {
      ok: true,
      mode: formatScoringMode(mode),
    };
  });

  // POST /scoring-modes - Create a new scoring mode
  fastify.post("/scoring-modes", async (request, reply) => {
    const userId = await getUserIdWithFallback(request);
    if (!userId) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "No user context available",
        },
      });
    }

    const body = request.body as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "Request body must be a JSON object",
        },
      });
    }

    const { name, description, notes, isDefault, weights, features, calibration } = body as Record<
      string,
      unknown
    >;

    // Validate name
    if (typeof name !== "string" || name.trim().length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "name is required and must be a non-empty string",
        },
      });
    }

    if (name.trim().length > 100) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "name must be 100 characters or less",
        },
      });
    }

    // Validate weights
    const weightsResult = validateWeights(weights);
    if (!weightsResult.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: weightsResult.error,
        },
      });
    }

    // Validate features
    const featuresResult = validateFeatures(features);
    if (!featuresResult.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: featuresResult.error,
        },
      });
    }

    // Validate calibration
    const calibrationResult = validateCalibration(calibration);
    if (!calibrationResult.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: calibrationResult.error,
        },
      });
    }

    const db = getDb();

    try {
      const mode = await db.scoringModes.create({
        userId,
        name: name.trim(),
        description: typeof description === "string" ? description.trim() : null,
        notes: typeof notes === "string" ? notes.trim() : null,
        isDefault: isDefault === true,
        config: {
          weights: weightsResult.weights,
          features: featuresResult.features,
          calibration: calibrationResult.calibration,
        } as Partial<ScoringModeConfig>,
      });

      return reply.code(201).send({
        ok: true,
        mode: formatScoringMode(mode),
      });
    } catch (err) {
      // Check for unique constraint violation
      if ((err as Error).message?.includes("duplicate key")) {
        return reply.code(409).send({
          ok: false,
          error: {
            code: "DUPLICATE",
            message: `A scoring mode named "${name.trim()}" already exists`,
          },
        });
      }
      throw err;
    }
  });

  // PUT /scoring-modes/:id - Update a scoring mode
  fastify.put<{ Params: { id: string } }>("/scoring-modes/:id", async (request, reply) => {
    const userId = await getUserIdWithFallback(request);
    if (!userId) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "No user context available",
        },
      });
    }

    const { id } = request.params;

    if (!isValidUuid(id)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "id must be a valid UUID",
        },
      });
    }

    const body = request.body as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "Request body must be a JSON object",
        },
      });
    }

    const { name, description, notes, weights, features, calibration } = body as Record<
      string,
      unknown
    >;

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "name must be a non-empty string",
          },
        });
      }
      if (name.trim().length > 100) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "name must be 100 characters or less",
          },
        });
      }
    }

    // Validate weights
    const weightsResult = validateWeights(weights);
    if (!weightsResult.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: weightsResult.error,
        },
      });
    }

    // Validate features
    const featuresResult = validateFeatures(features);
    if (!featuresResult.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: featuresResult.error,
        },
      });
    }

    // Validate calibration
    const calibrationResult = validateCalibration(calibration);
    if (!calibrationResult.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: calibrationResult.error,
        },
      });
    }

    const db = getDb();
    const existing = await db.scoringModes.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Scoring mode not found: ${id}`,
        },
      });
    }

    if (existing.userId !== userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Scoring mode does not belong to current user",
        },
      });
    }

    try {
      // Build partial config if any config fields were provided
      const hasConfigUpdates =
        Object.keys(weightsResult.weights).length > 0 ||
        Object.keys(featuresResult.features).length > 0 ||
        Object.keys(calibrationResult.calibration).length > 0;

      const configUpdate = hasConfigUpdates
        ? ({
            weights: weightsResult.weights as ScoringModeConfig["weights"],
            features: featuresResult.features as ScoringModeConfig["features"],
            calibration: calibrationResult.calibration as ScoringModeConfig["calibration"],
          } as Partial<ScoringModeConfig>)
        : undefined;

      const mode = await db.scoringModes.update(id, {
        name: typeof name === "string" ? name.trim() : undefined,
        description:
          description === null
            ? null
            : typeof description === "string"
              ? description.trim()
              : undefined,
        notes: notes === null ? null : typeof notes === "string" ? notes.trim() : undefined,
        config: configUpdate,
      });

      return {
        ok: true,
        mode: formatScoringMode(mode),
      };
    } catch (err) {
      if ((err as Error).message?.includes("duplicate key")) {
        return reply.code(409).send({
          ok: false,
          error: {
            code: "DUPLICATE",
            message: `A scoring mode named "${(name as string).trim()}" already exists`,
          },
        });
      }
      throw err;
    }
  });

  // POST /scoring-modes/:id/set-default - Set a mode as the default
  fastify.post<{ Params: { id: string } }>(
    "/scoring-modes/:id/set-default",
    async (request, reply) => {
      const userId = await getUserIdWithFallback(request);
      if (!userId) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: "NOT_INITIALIZED",
            message: "No user context available",
          },
        });
      }

      const { id } = request.params;

      if (!isValidUuid(id)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "id must be a valid UUID",
          },
        });
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      const reason = typeof body.reason === "string" ? body.reason.trim() : null;

      const db = getDb();
      const existing = await db.scoringModes.getById(id);

      if (!existing) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Scoring mode not found: ${id}`,
          },
        });
      }

      if (existing.userId !== userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Scoring mode does not belong to current user",
          },
        });
      }

      // Get current default for audit log
      const currentDefault = await db.scoringModes.getDefaultForUser(userId);

      await db.scoringModes.setDefault(userId, id);

      // Log the change
      await db.scoringModes.logChange({
        userId,
        previousModeId: currentDefault?.id ?? null,
        newModeId: id,
        reason,
      });

      const updated = await db.scoringModes.getById(id);

      return {
        ok: true,
        mode: formatScoringMode(updated!),
      };
    },
  );

  // DELETE /scoring-modes/:id - Delete a scoring mode
  fastify.delete<{ Params: { id: string } }>("/scoring-modes/:id", async (request, reply) => {
    const userId = await getUserIdWithFallback(request);
    if (!userId) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "No user context available",
        },
      });
    }

    const { id } = request.params;

    if (!isValidUuid(id)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "id must be a valid UUID",
        },
      });
    }

    const db = getDb();
    const existing = await db.scoringModes.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Scoring mode not found: ${id}`,
        },
      });
    }

    if (existing.userId !== userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Scoring mode does not belong to current user",
        },
      });
    }

    // Don't allow deleting the default mode
    if (existing.isDefault) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_OPERATION",
          message: "Cannot delete the default scoring mode. Set another mode as default first.",
        },
      });
    }

    await db.scoringModes.delete(id);

    return {
      ok: true,
      message: `Scoring mode "${existing.name}" deleted`,
    };
  });
}
