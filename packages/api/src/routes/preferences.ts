import type { FastifyInstance } from "fastify";
import {
  createUserPreferencesRepo,
  type ViewingProfile,
  PROFILE_DECAY_HOURS,
} from "@aharadar/db";
import { getDb, getSingletonContext } from "../lib/db.js";

interface UpdatePreferencesBody {
  viewingProfile?: ViewingProfile;
  decayHours?: number;
  customSettings?: Record<string, unknown>;
}

export async function preferencesRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /preferences - Get current user preferences
  fastify.get("/preferences", async (request, reply) => {
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
    const prefsRepo = createUserPreferencesRepo(db);
    const prefs = await prefsRepo.getOrCreate(ctx.userId);

    return {
      ok: true,
      preferences: {
        viewingProfile: prefs.viewingProfile,
        decayHours: prefs.decayHours,
        lastCheckedAt: prefs.lastCheckedAt?.toISOString() ?? null,
        customSettings: prefs.customSettings,
        updatedAt: prefs.updatedAt.toISOString(),
      },
      profileOptions: [
        {
          value: "power",
          label: "Power User",
          description: "For checking multiple times per day",
          decayHours: PROFILE_DECAY_HOURS.power,
        },
        {
          value: "daily",
          label: "Daily",
          description: "For checking once per day",
          decayHours: PROFILE_DECAY_HOURS.daily,
        },
        {
          value: "weekly",
          label: "Weekly",
          description: "For weekly catch-up sessions",
          decayHours: PROFILE_DECAY_HOURS.weekly,
        },
        {
          value: "research",
          label: "Research",
          description: "For monthly deep dives",
          decayHours: PROFILE_DECAY_HOURS.research,
        },
        {
          value: "custom",
          label: "Custom",
          description: "Set your own decay rate",
          decayHours: null,
        },
      ],
    };
  });

  // PATCH /preferences - Update user preferences
  fastify.patch<{ Body: UpdatePreferencesBody }>("/preferences", async (request, reply) => {
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

    const { viewingProfile, decayHours, customSettings } = request.body ?? {};

    // Validate viewingProfile
    if (viewingProfile !== undefined) {
      const validProfiles: ViewingProfile[] = ["power", "daily", "weekly", "research", "custom"];
      if (!validProfiles.includes(viewingProfile)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: `Invalid viewingProfile: must be one of ${validProfiles.join(", ")}`,
          },
        });
      }
    }

    // Validate decayHours
    if (decayHours !== undefined) {
      if (typeof decayHours !== "number" || decayHours < 1 || decayHours > 720) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "Invalid decayHours: must be a number between 1 and 720",
          },
        });
      }
    }

    const db = getDb();
    const prefsRepo = createUserPreferencesRepo(db);
    const prefs = await prefsRepo.update({
      userId: ctx.userId,
      viewingProfile,
      decayHours,
      customSettings,
    });

    return {
      ok: true,
      preferences: {
        viewingProfile: prefs.viewingProfile,
        decayHours: prefs.decayHours,
        lastCheckedAt: prefs.lastCheckedAt?.toISOString() ?? null,
        customSettings: prefs.customSettings,
        updatedAt: prefs.updatedAt.toISOString(),
      },
    };
  });

  // POST /preferences/mark-checked - Mark feed as "caught up"
  fastify.post("/preferences/mark-checked", async (request, reply) => {
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
    const prefsRepo = createUserPreferencesRepo(db);
    const prefs = await prefsRepo.markChecked(ctx.userId);

    return {
      ok: true,
      preferences: {
        viewingProfile: prefs.viewingProfile,
        decayHours: prefs.decayHours,
        lastCheckedAt: prefs.lastCheckedAt?.toISOString() ?? null,
        customSettings: prefs.customSettings,
        updatedAt: prefs.updatedAt.toISOString(),
      },
      message: "Feed marked as caught up",
    };
  });
}
