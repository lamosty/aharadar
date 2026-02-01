import type { ExperimentOutcome, ScoringExperiment } from "@aharadar/db";
import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const VALID_OUTCOMES = ["positive", "neutral", "negative"] as const;

function isValidOutcome(value: unknown): value is ExperimentOutcome {
  return typeof value === "string" && VALID_OUTCOMES.includes(value as ExperimentOutcome);
}

/** Format ScoringExperiment for API response */
function formatExperiment(exp: ScoringExperiment) {
  return {
    id: exp.id,
    userId: exp.userId,
    topicId: exp.topicId,
    modeId: exp.modeId,
    name: exp.name,
    hypothesis: exp.hypothesis,
    startedAt: exp.startedAt.toISOString(),
    endedAt: exp.endedAt?.toISOString() ?? null,
    itemsShown: exp.itemsShown,
    itemsLiked: exp.itemsLiked,
    itemsDisliked: exp.itemsDisliked,
    itemsSkipped: exp.itemsSkipped,
    digestsGenerated: exp.digestsGenerated,
    notes: exp.notes,
    outcome: exp.outcome,
    learnings: exp.learnings,
    createdAt: exp.createdAt.toISOString(),
    updatedAt: exp.updatedAt.toISOString(),
  };
}

export async function scoringExperimentsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /scoring-experiments - List all experiments for current user
  fastify.get<{ Querystring: { topicId?: string; activeOnly?: string; limit?: string } }>(
    "/scoring-experiments",
    async (request, reply) => {
      const ctx = await getSingletonContext();
      if (!ctx) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: "NOT_INITIALIZED",
            message: "Database not initialized: no user or topic found",
          },
        });
      }

      const { topicId, activeOnly, limit: limitStr } = request.query;

      if (topicId !== undefined && !isValidUuid(topicId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "topicId must be a valid UUID",
          },
        });
      }

      const limit = limitStr ? parseInt(limitStr, 10) : 100;
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
      const experiments = await db.scoringExperiments.list({
        userId: ctx.userId,
        topicId,
        activeOnly: activeOnly === "true",
        limit,
      });

      return {
        ok: true,
        experiments: experiments.map(formatExperiment),
      };
    },
  );

  // GET /scoring-experiments/active - Get currently active experiments for the user
  fastify.get("/scoring-experiments/active", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
        },
      });
    }

    const db = getDb();
    const experiments = await db.scoringExperiments.getActiveForUser(ctx.userId);

    return {
      ok: true,
      experiments: experiments.map(formatExperiment),
    };
  });

  // GET /scoring-experiments/:id - Get a specific experiment
  fastify.get<{ Params: { id: string } }>("/scoring-experiments/:id", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
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
    const experiment = await db.scoringExperiments.getById(id);

    if (!experiment) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Experiment not found: ${id}`,
        },
      });
    }

    if (experiment.userId !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Experiment does not belong to current user",
        },
      });
    }

    return {
      ok: true,
      experiment: formatExperiment(experiment),
    };
  });

  // POST /scoring-experiments - Start a new experiment
  fastify.post("/scoring-experiments", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
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

    const { topicId, modeId, name, hypothesis } = body as Record<string, unknown>;

    // Validate topicId
    if (!isValidUuid(topicId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "topicId is required and must be a valid UUID",
        },
      });
    }

    // Validate modeId
    if (!isValidUuid(modeId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "modeId is required and must be a valid UUID",
        },
      });
    }

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

    const db = getDb();

    // Verify topic belongs to user
    const topic = await db.topics.getById(topicId);
    if (!topic || topic.user_id !== ctx.userId) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Topic not found: ${topicId}`,
        },
      });
    }

    // Verify mode belongs to user
    const mode = await db.scoringModes.getById(modeId);
    if (!mode || mode.userId !== ctx.userId) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Scoring mode not found: ${modeId}`,
        },
      });
    }

    // Set the topic's scoring mode to the experiment mode
    await db.query(`UPDATE topics SET scoring_mode_id = $1, updated_at = NOW() WHERE id = $2`, [
      modeId,
      topicId,
    ]);

    // Log the mode change
    await db.scoringModes.logChange({
      userId: ctx.userId,
      topicId,
      previousModeId: topic.scoring_mode_id,
      newModeId: modeId,
      reason: `Started experiment: ${name.trim()}`,
    });

    const experiment = await db.scoringExperiments.create({
      userId: ctx.userId,
      topicId,
      modeId,
      name: name.trim(),
      hypothesis: typeof hypothesis === "string" ? hypothesis.trim() : null,
    });

    return reply.code(201).send({
      ok: true,
      experiment: formatExperiment(experiment),
    });
  });

  // PUT /scoring-experiments/:id - Update experiment (notes, hypothesis, name)
  fastify.put<{ Params: { id: string } }>("/scoring-experiments/:id", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
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

    const { name, hypothesis, notes } = body as Record<string, unknown>;

    const db = getDb();
    const existing = await db.scoringExperiments.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Experiment not found: ${id}`,
        },
      });
    }

    if (existing.userId !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Experiment does not belong to current user",
        },
      });
    }

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

    const experiment = await db.scoringExperiments.update(id, {
      name: typeof name === "string" ? name.trim() : undefined,
      hypothesis:
        hypothesis === null ? null : typeof hypothesis === "string" ? hypothesis.trim() : undefined,
      notes: notes === null ? null : typeof notes === "string" ? notes.trim() : undefined,
    });

    return {
      ok: true,
      experiment: formatExperiment(experiment),
    };
  });

  // POST /scoring-experiments/:id/end - End an experiment with outcome
  fastify.post<{ Params: { id: string } }>(
    "/scoring-experiments/:id/end",
    async (request, reply) => {
      const ctx = await getSingletonContext();
      if (!ctx) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: "NOT_INITIALIZED",
            message: "Database not initialized: no user or topic found",
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
      const { outcome, learnings } = body;

      // Validate outcome if provided
      if (outcome !== undefined && outcome !== null && !isValidOutcome(outcome)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "outcome must be one of: positive, neutral, negative",
          },
        });
      }

      const db = getDb();
      const existing = await db.scoringExperiments.getById(id);

      if (!existing) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Experiment not found: ${id}`,
          },
        });
      }

      if (existing.userId !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Experiment does not belong to current user",
          },
        });
      }

      if (existing.endedAt) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_OPERATION",
            message: "Experiment has already ended",
          },
        });
      }

      const experiment = await db.scoringExperiments.end(id, {
        outcome: isValidOutcome(outcome) ? outcome : null,
        learnings: typeof learnings === "string" ? learnings.trim() : null,
      });

      return {
        ok: true,
        experiment: formatExperiment(experiment),
      };
    },
  );

  // DELETE /scoring-experiments/:id - Delete an experiment
  fastify.delete<{ Params: { id: string } }>("/scoring-experiments/:id", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
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
    const existing = await db.scoringExperiments.getById(id);

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Experiment not found: ${id}`,
        },
      });
    }

    if (existing.userId !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Experiment does not belong to current user",
        },
      });
    }

    await db.scoringExperiments.delete(id);

    return {
      ok: true,
      message: `Experiment "${existing.name}" deleted`,
    };
  });
}
