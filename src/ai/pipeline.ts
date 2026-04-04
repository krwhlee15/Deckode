import type { Deck, Slide, SlideElement } from "@/types/deck";
import { useDeckStore } from "@/stores/deckStore";
import { callGemini, buildFunctionDeclarations, type GeminiModel, type DeckodeTool, getModelForAgent } from "./geminiClient";
import { buildPlannerPrompt, buildGeneratorPrompt, buildReviewerPrompt, buildWriterPrompt } from "./prompts";
import { generatorTools, reviewerTools, writerTools } from "./tools";
import { validateDeck, buildFixInstructions } from "./validation";
import type { Content } from "@google/generative-ai";

// ---------- Types ----------

export type PipelineIntent = "create" | "modify" | "notes" | "review" | "chat";

export interface SlidePlan {
  id: string;
  title: string;
  type: string;
  keyPoints: string[];
  elementTypes: string[];
}

export interface PlanResult {
  intent: PipelineIntent;
  plan?: {
    topic: string;
    audience: string;
    slideCount: number;
    slides: SlidePlan[];
  };
  actions?: string[];
  response?: string;
  reasoning: string;
}

export interface PipelineCallbacks {
  onStageChange: (stage: string) => void;
  onLog: (message: string) => void;
  onPlanReady: (plan: PlanResult) => Promise<boolean>; // returns true if approved
  onComplete: (summary: string) => void;
  onError: (error: string) => void;
}

// ---------- Tool Execution ----------

/** Fix literal \n sequences in text content and auto-add missing waypoints to arrows */
function sanitizeToolArgs(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) sanitizeToolArgs(item);
    return;
  }
  const rec = obj as Record<string, unknown>;
  // Fix literal \n in string fields commonly containing text
  for (const key of ["content", "notes"]) {
    if (typeof rec[key] === "string") {
      rec[key] = (rec[key] as string).replace(/\\n/g, "\n");
    }
  }
  // Auto-add waypoints to arrows that are missing them
  if (rec.shape === "arrow" && rec.style && rec.size) {
    const style = rec.style as Record<string, unknown>;
    const size = rec.size as { w: number; h: number };
    if (!style.waypoints) {
      // Horizontal arrow by default; vertical if h > w
      if (size.h > size.w) {
        style.waypoints = [{ x: 0, y: 0 }, { x: 0, y: size.h }];
      } else {
        style.waypoints = [{ x: 0, y: 0 }, { x: size.w, y: 0 }];
      }
    }
  }
  // Recurse into nested objects/arrays
  for (const val of Object.values(rec)) {
    if (val && typeof val === "object") sanitizeToolArgs(val);
  }
}

function executeTool(name: string, args: Record<string, unknown>): string {
  // Sanitize text content and fix missing arrow waypoints
  sanitizeToolArgs(args);

  const store = useDeckStore.getState();
  const deck = store.deck;

  switch (name) {
    case "read_deck": {
      if (!deck) return "No deck loaded.";
      // Return summary only — use read_slide for details
      const summary = {
        title: deck.meta.title,
        author: deck.meta.author,
        slideCount: deck.slides.length,
        slides: deck.slides.map((s) => ({
          id: s.id,
          elementCount: s.elements.length,
          elementTypes: [...new Set(s.elements.map((e) => e.type))],
          hasNotes: !!s.notes,
          firstText: s.elements.find((e) => e.type === "text")
            ? (s.elements.find((e) => e.type === "text") as { content: string }).content.slice(0, 60)
            : null,
        })),
      };
      return JSON.stringify(summary, null, 2);
    }
    case "read_slide": {
      const slideId = args.slideId as string;
      if (!deck) return "No deck loaded.";
      const slide = deck.slides.find((s) => s.id === slideId);
      if (!slide) return `Slide "${slideId}" not found.`;
      return JSON.stringify(slide, null, 2);
    }
    case "create_deck": {
      const newDeck = args.deck as Deck;
      store.replaceDeck(newDeck);
      return `Deck created with ${newDeck.slides.length} slides.`;
    }
    case "add_slide": {
      const slide = args.slide as Slide;
      const afterSlideId = args.afterSlideId as string | undefined;
      let afterIndex: number | undefined;
      if (afterSlideId && deck) {
        const idx = deck.slides.findIndex((s) => s.id === afterSlideId);
        if (idx !== -1) afterIndex = idx;
      }
      store.addSlide(slide, afterIndex);
      return `Slide "${slide.id}" added with ${slide.elements.length} elements.`;
    }
    case "update_slide": {
      const slideId = args.slideId as string;
      const patch = args.patch as Partial<Slide>;
      store.updateSlide(slideId, patch);
      return `Slide "${slideId}" updated.`;
    }
    case "delete_slide": {
      const slideId = args.slideId as string;
      store.deleteSlide(slideId);
      return `Slide "${slideId}" deleted.`;
    }
    case "add_element": {
      const slideId = args.slideId as string;
      const element = args.element as SlideElement;
      store.addElement(slideId, element);
      return `Element "${element.id}" added to slide "${slideId}".`;
    }
    case "update_element": {
      const slideId = args.slideId as string;
      const elementId = args.elementId as string;
      const patch = args.patch as Partial<SlideElement>;
      store.updateElement(slideId, elementId, patch);
      return `Element "${elementId}" updated.`;
    }
    case "delete_element": {
      const slideId = args.slideId as string;
      const elementId = args.elementId as string;
      store.deleteElement(slideId, elementId);
      return `Element "${elementId}" deleted from slide "${slideId}".`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// ---------- Agent Call with Tool Loop ----------

async function callAgentWithTools(
  model: GeminiModel,
  systemPrompt: string,
  tools: DeckodeTool[],
  message: string,
  history: Content[],
  onLog: (msg: string) => void,
): Promise<string> {
  const geminiTools = buildFunctionDeclarations(tools);
  let currentHistory = [...history];
  let currentMessage = message;
  let iterations = 0;
  let toolCallsMade = false;
  const maxIterations = 20;

  while (iterations < maxIterations) {
    iterations++;
    const response = await callGemini({
      model,
      systemInstruction: systemPrompt,
      history: currentHistory,
      tools: geminiTools,
      message: currentMessage,
    });

    onLog(`  [iter ${iterations}] text=${response.text.length}chars, tools=${response.functionCalls.length}`);

    if (response.functionCalls.length === 0) {
      // If no tool calls have been made yet, nudge the model to use tools.
      if (!toolCallsMade && iterations <= 2 && response.text) {
        onLog("Model responded with text only, nudging to use tools...");
        currentHistory = [
          ...currentHistory,
          { role: "user", parts: [{ text: currentMessage }] },
          { role: "model", parts: [{ text: response.text }] },
        ];
        currentMessage = "Now execute the plan by calling the provided tools (add_slide, add_element, etc.). Do not just describe what you would do — actually call the tools.";
        continue;
      }
      return response.text;
    }

    // Execute each function call and build function response
    toolCallsMade = true;
    const functionResponses: string[] = [];
    for (const fc of response.functionCalls) {
      onLog(`  → ${fc.name}(${JSON.stringify(fc.args).slice(0, 120)}...)`);
      try {
        const result = executeTool(fc.name, fc.args);
        functionResponses.push(`${fc.name} result: ${result}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        onLog(`  ✗ ${fc.name} failed: ${errMsg}`);
        functionResponses.push(`${fc.name} ERROR: ${errMsg}. Try a different approach.`);
      }
    }

    // Add to history and continue
    currentHistory = [
      ...currentHistory,
      { role: "user", parts: [{ text: currentMessage }] },
      { role: "model", parts: [{ text: response.text || "Calling tools..." }] },
    ];
    currentMessage = `Tool results:\n${functionResponses.join("\n")}\n\nContinue executing the plan. If all done, provide a summary.`;
  }

  return "Reached maximum iterations. Some actions may be incomplete.";
}

// ---------- Pipeline Stages ----------

async function runPlanner(
  userMessage: string,
  cb: PipelineCallbacks,
): Promise<PlanResult | null> {
  cb.onStageChange("plan");
  cb.onLog("Analyzing intent and creating plan...");

  const deck = useDeckStore.getState().deck;
  const prompt = buildPlannerPrompt(deck);

  const response = await callGemini({
    model: getModelForAgent("planner"),
    systemInstruction: prompt,
    message: userMessage,
  });

  try {
    // Clean response text - remove markdown code fences if present
    let text = response.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    return JSON.parse(text) as PlanResult;
  } catch {
    cb.onError(`Planner returned invalid JSON: ${response.text.slice(0, 200)}`);
    return null;
  }
}

async function runGenerator(
  plan: PlanResult,
  cb: PipelineCallbacks,
): Promise<string> {
  cb.onStageChange("generate");
  cb.onLog("Generating slides...");

  const deck = useDeckStore.getState().deck;
  const prompt = buildGeneratorPrompt(deck);

  const planMessage = plan.plan
    ? `Execute this approved plan:\n${JSON.stringify(plan.plan, null, 2)}`
    : `Execute these modifications:\n${plan.actions?.join("\n")}`;

  return callAgentWithTools(
    getModelForAgent("generator"),
    prompt,
    generatorTools,
    planMessage,
    [],
    cb.onLog,
  );
}

async function runReviewer(cb: PipelineCallbacks): Promise<string> {
  cb.onStageChange("review");
  cb.onLog("Reviewing deck for issues...");

  const deck = useDeckStore.getState().deck;
  if (!deck) return "No deck to review.";

  // Local validation first
  const localResult = validateDeck(deck);
  const fixInstructions = buildFixInstructions(localResult);

  if (localResult.issues.length === 0) {
    cb.onLog("Local validation passed — no issues found.");
    return "All validation checks passed. No issues found.";
  }

  cb.onLog(`Found ${localResult.issues.length} issues. Running AI reviewer...`);
  const prompt = buildReviewerPrompt(deck);
  const message = fixInstructions
    ? `Review the deck and fix these issues:\n${fixInstructions}`
    : "Review the deck for any issues.";

  return callAgentWithTools(
    getModelForAgent("reviewer"),
    prompt,
    reviewerTools,
    message,
    [],
    cb.onLog,
  );
}

async function runWriter(
  userMessage: string,
  cb: PipelineCallbacks,
): Promise<string> {
  cb.onStageChange("notes");
  cb.onLog("Generating speaker notes...");

  const deck = useDeckStore.getState().deck;
  const prompt = buildWriterPrompt(deck);

  return callAgentWithTools(
    getModelForAgent("writer"),
    prompt,
    writerTools,
    userMessage,
    [],
    cb.onLog,
  );
}

// ---------- Main Pipeline ----------

export async function runPipeline(
  userMessage: string,
  cb: PipelineCallbacks,
): Promise<void> {
  try {
    // Stage 1: Plan
    const plan = await runPlanner(userMessage, cb);
    if (!plan) return;

    // Direct chat response — no pipeline needed
    if (plan.intent === "chat") {
      cb.onComplete(plan.response ?? plan.reasoning);
      return;
    }

    // Notes-only path
    if (plan.intent === "notes") {
      const result = await runWriter(userMessage, cb);
      cb.onComplete(result);
      return;
    }

    // Review-only path
    if (plan.intent === "review") {
      const result = await runReviewer(cb);
      cb.onComplete(result);
      return;
    }

    // Create / Modify path — approval gate
    if (plan.intent === "create" || plan.intent === "modify") {
      const approved = await cb.onPlanReady(plan);
      if (!approved) {
        cb.onComplete("Plan rejected by user.");
        return;
      }

      // Stage 2: Generate
      const genResult = await runGenerator(plan, cb);
      cb.onLog(genResult);

      // Stage 3: Review
      const reviewResult = await runReviewer(cb);

      cb.onComplete(`Generation complete. ${reviewResult}`);
    }
  } catch (err) {
    cb.onError(err instanceof Error ? err.message : String(err));
  }
}
