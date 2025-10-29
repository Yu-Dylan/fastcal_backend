import { GoogleGenAI } from "npm:@google/genai";
import "jsr:@std/dotenv/load";

export interface ParseResult {
  intent: "create" | "edit" | "delete" | "query" | "search";
  eventId?: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location: string;
  participants: string[];
  tags: string[];
  confidence: number;
  message?: string;
  searchResults?: string[];
  timeFrame?: { start: string; end: string };
}

export async function parseWithGemini(
  utterance: string,
  context: {
    currentDate: Date;
    timezone: string;
    existingEvents: any[];
  }
): Promise<ParseResult> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash-exp";
  
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // Format existing events for context with their actual IDs
  const eventsContext = context.existingEvents.map((evt: any, idx: number) => 
    `Event ${idx + 1} (ID: ${evt.id}): "${evt.title}" on ${new Date(evt.startTime).toLocaleString()}`
  ).join('\n');

  const tools = [
    {
      name: "create_event",
      description: "Create a new calendar event. Use this when the user wants to schedule something new.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A clear, descriptive title for the event. Be specific - instead of 'Lunch', use 'Lunch with Sarah at Chipotle'. Include key details like who, what, where when appropriate."
          },
          startTime: {
            type: "string",
            description: "ISO 8601 datetime for when the event starts. Parse relative dates like 'tomorrow', 'next Tuesday', 'in 2 days'. Current time is " + context.currentDate.toISOString()
          },
          endTime: {
            type: "string",
            description: "ISO 8601 datetime for when the event ends. Default to 1 hour after start if not specified."
          },
          location: {
            type: "string",
            description: "Where the event takes place. Empty string if not mentioned."
          },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "List of participant names extracted from phrases like 'with Sarah', 'and Alex', 'Sarah and John'"
          },
          confidence: {
            type: "number",
            description: "Confidence score 0.0-1.0. Use 0.9+ for clear requests, 0.5-0.8 for ambiguous, <0.5 for unclear"
          }
        },
        required: ["title", "startTime", "endTime", "confidence"]
      }
    },
    {
      name: "delete_event",
      description: "Delete an existing calendar event. Use this when the user says 'delete event X', 'remove event X', 'cancel event X' where X is the event number.",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "The event number to delete. Extract from phrases like 'delete event 3' -> '3', 'remove event 1' -> '1'"
          },
          confidence: {
            type: "number",
            description: "Confidence score 0.0-1.0"
          }
        },
        required: ["eventId", "confidence"]
      }
    },
    {
      name: "edit_event",
      description: "Modify an existing calendar event. Use this when the user wants to change details of an existing event like 'change event 2 to 3pm' or 'move event 1 to tomorrow'.",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "The event number to edit. Extract from phrases like 'change event 2' -> '2'"
          },
          title: { type: "string", description: "New title if being changed" },
          startTime: { type: "string", description: "New start time if being changed (ISO 8601)" },
          endTime: { type: "string", description: "New end time if being changed (ISO 8601)" },
          location: { type: "string", description: "New location if being changed" },
          participants: { 
            type: "array",
            items: { type: "string" },
            description: "New participants if being changed"
          },
          confidence: { type: "number", description: "Confidence score 0.0-1.0" }
        },
        required: ["eventId", "confidence"]
      }
    }
  ];

  // Load prompt from file
  const promptPath = new URL("./gemini_prompt.txt", import.meta.url);
  let promptTemplate: string;
  try {
    promptTemplate = await Deno.readTextFile(promptPath);
  } catch (e) {
    // Fallback if file can't be loaded
    promptTemplate = `You are a calendar assistant. Current time: {CURRENT_DATE}, Timezone: {TIMEZONE}

Existing events:
{EXISTING_EVENTS}

User request: "{USER_INPUT}"

Analyze the request and call the appropriate function. Be specific with titles - include relevant details like who, what, and where when appropriate.`;
  }

  const prompt = promptTemplate
    .replace("{CURRENT_DATE}", context.currentDate.toISOString())
    .replace("{TIMEZONE}", context.timezone)
    .replace("{EXISTING_EVENTS}", eventsContext || "No existing events")
    .replace("{USER_INPUT}", utterance);

  console.log("=== PROMPT SENT TO GEMINI ===");
  console.log(prompt);
  console.log("=== EXISTING EVENTS CONTEXT ===");
  console.log("Events array:", JSON.stringify(context.existingEvents, null, 2));
  console.log("Formatted:", eventsContext);
  console.log("=== END PROMPT ===");

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    generationConfig: {
      temperature: 0.7,
    },
    // Remove tools for now - just use JSON mode
    // tools: [{ functionDeclarations: tools }],
  });

  console.log("Gemini result:", JSON.stringify(result, null, 2));

  // Extract function call from response - try both result.response and result directly
  const candidate = result?.response?.candidates?.[0] || result?.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  const functionCall = part?.functionCall;
  
  // Fallback: If no function call, try to parse JSON from text response
  if (!functionCall) {
    console.log("No function call, trying to parse text response");
    console.log("Candidate:", JSON.stringify(candidate, null, 2));
    console.log("Part:", JSON.stringify(part, null, 2));
    
    let responseText: string | undefined;
    
    // Try all possible locations for text
    if (result?.response?.text && typeof result.response.text === 'function') {
      try {
        responseText = result.response.text();
      } catch (e) {
        console.log("Error calling text():", e);
      }
    }
    
    if (!responseText && part?.text) {
      responseText = part.text;
    }
    
    if (!responseText && candidate?.content?.text) {
      responseText = candidate.content.text;
    }
    
    // Try to get all parts and concatenate
    if (!responseText && candidate?.content?.parts) {
      const textParts = candidate.content.parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text);
      if (textParts.length > 0) {
        responseText = textParts.join('');
      }
    }

    console.log("Extracted response text:", responseText);

    if (responseText) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Map JSON response to our format
        const intent = parsed.intent || "create";
        
        return {
          intent: intent,
          eventId: parsed.eventId || undefined,
          title: parsed.title || (intent === "delete" || intent === "query" || intent === "search" ? "" : "Event"),
          startTime: parsed.startTime ? new Date(parsed.startTime) : new Date(),
          endTime: parsed.endTime ? new Date(parsed.endTime) : new Date(),
          location: parsed.location || "",
          participants: parsed.participants || [],
          tags: parsed.tags || [],
          confidence: parsed.confidence || 0.8,
          message: parsed.message || undefined,
          searchResults: parsed.searchResults || undefined,
          timeFrame: parsed.timeFrame || undefined,
        };
      }
    }
    
    throw new Error("No function call or valid JSON in Gemini response");
  }

  console.log("Function call:", JSON.stringify(functionCall, null, 2));

  const functionName = functionCall.name;
  const args = functionCall.args;

  // Map function call to our result format
  if (functionName === "create_event") {
    return {
      intent: "create",
      eventId: undefined,
      title: args.title || "Event",
      startTime: new Date(args.startTime),
      endTime: new Date(args.endTime),
      location: args.location || "",
      participants: args.participants || [],
      tags: [],
      confidence: args.confidence || 0.8,
    };
  } else if (functionName === "delete_event") {
    return {
      intent: "delete",
      eventId: args.eventId,
      title: "Delete Event",
      startTime: new Date(),
      endTime: new Date(),
      location: "",
      participants: [],
      tags: [],
      confidence: args.confidence || 0.9,
    };
  } else if (functionName === "edit_event") {
    return {
      intent: "edit",
      eventId: args.eventId,
      title: args.title || "Event",
      startTime: args.startTime ? new Date(args.startTime) : new Date(),
      endTime: args.endTime ? new Date(args.endTime) : new Date(),
      location: args.location || "",
      participants: args.participants || [],
      tags: [],
      confidence: args.confidence || 0.8,
    };
  }

  throw new Error("Unknown function: " + functionName);
}
