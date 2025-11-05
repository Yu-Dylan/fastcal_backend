import { Hono } from "jsr:@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { getDb } from "@utils/database.ts";
import { walk } from "jsr:@std/fs";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { toFileUrl } from "jsr:@std/path/to-file-url";
import RequestingConcept from "./concepts/Requesting/RequestingConcept.ts";
import { registerSyncs, actionConfig } from "./syncs.ts";

// Parse command-line arguments for port and base URL
const flags = parseArgs(Deno.args, {
  string: ["port", "baseUrl"],
  default: {
    port: "8000",
    baseUrl: "/api",
  },
});

const PORT = parseInt(flags.port, 10);
const BASE_URL = flags.baseUrl;
const CONCEPTS_DIR = "src/concepts";

/**
 * Main server function to initialize DB, load concepts, and start the server.
 */
async function main() {
  const [db] = await getDb();
  const app = new Hono();

  // Enable CORS for frontend
  app.use('/*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  app.get("/", (c) => c.text("Concept Server is running with syncs."));
  
  // OAuth callback route - serves HTML page that handles the callback
  app.get("/api/CalendarSync/oauth/callback", async (c) => {
    const html = await Deno.readTextFile("./src/concepts/CalendarSync/oauth_callback.html");
    return c.html(html);
  });

  // --- Initialize Requesting Concept ---
  const requesting = new RequestingConcept(db, actionConfig);
  console.log("Requesting concept initialized.");
  console.log(`Included actions: ${actionConfig.included.length}`);
  console.log(`Excluded actions: ${actionConfig.excluded.length}`);

  // Store concept instances for syncs
  const conceptInstances: Record<string, any> = {};

  // --- Dynamic Concept Loading and Routing ---
  console.log(`Scanning for concepts in ./${CONCEPTS_DIR}...`);

  for await (
    const entry of walk(CONCEPTS_DIR, {
      maxDepth: 1,
      includeDirs: true,
      includeFiles: false,
    })
  ) {
    if (entry.path === CONCEPTS_DIR) continue; // Skip the root directory

    const conceptName = entry.name;
    const conceptFilePath = `${entry.path}/${conceptName}Concept.ts`;

    try {
      const modulePath = toFileUrl(Deno.realPathSync(conceptFilePath)).href;
      const module = await import(modulePath);
      const ConceptClass = module.default;

      if (
        typeof ConceptClass !== "function" ||
        !ConceptClass.name.endsWith("Concept")
      ) {
        console.warn(
          `! No valid concept class found in ${conceptFilePath}. Skipping.`,
        );
        continue;
      }

      const instance = new ConceptClass(db);
      const conceptApiName = conceptName;
      
      // Store instance for syncs (skip Requesting to avoid circular reference)
      if (conceptName !== "Requesting") {
        conceptInstances[conceptName] = instance;
      }
      
      console.log(
        `- Registering concept: ${conceptName} at ${BASE_URL}/${conceptApiName}`,
      );

      const methodNames = Object.getOwnPropertyNames(
        Object.getPrototypeOf(instance),
      )
        .filter((name) =>
          name !== "constructor" && typeof instance[name] === "function"
        );

      for (const methodName of methodNames) {
        const actionName = methodName;
        const route = `${BASE_URL}/${conceptApiName}/${actionName}`;
        const actionPath = `${conceptApiName}/${actionName}`;

        app.post(route, async (c) => {
          try {
            const body = await c.req.json().catch(() => ({})); // Handle empty body
            
            // Check if this action is excluded (requires sync handling)
            if (requesting.isExcluded(actionPath)) {
              console.log(`[SYNC] Handling excluded action: ${actionPath}`);
              const result = await requesting.request({
                path: actionPath,
                params: body,
              });
              return c.json(result);
            }
            
            // Check if explicitly included or default pass-through
            if (requesting.isIncluded(actionPath)) {
              console.log(`[PASS-THROUGH] Handling included action: ${actionPath}`);
            } else {
              console.warn(`[DEFAULT] Action not explicitly configured: ${actionPath} (passing through)`);
            }
            
            // Pass through to concept action directly
            const result = await instance[methodName](body);
            return c.json(result);
          } catch (e) {
            console.error(`Error in ${conceptName}.${methodName}:`, e);
            return c.json({ error: "An internal server error occurred." }, 500);
          }
        });
        
        const status = requesting.isExcluded(actionPath) 
          ? "[EXCLUDED - SYNC]"
          : requesting.isIncluded(actionPath)
          ? "[INCLUDED]"
          : "[DEFAULT]";
        console.log(`  - Endpoint: POST ${route} ${status}`);
      }
    } catch (e) {
      console.error(
        `! Error loading concept from ${conceptFilePath}:`,
        e,
      );
    }
  }

  // --- Register Syncs ---
  console.log("\nRegistering syncs...");
  registerSyncs(requesting, {
    EventDrafts: conceptInstances.EventDrafts,
    CalendarSync: conceptInstances.CalendarSync,
    IntentParser: conceptInstances.IntentParser,
  });
  console.log("Syncs registered successfully.");

  console.log(`\nServer listening on http://localhost:${PORT}`);
  Deno.serve({ port: PORT }, app.fetch);
}

// Run the server
main();
