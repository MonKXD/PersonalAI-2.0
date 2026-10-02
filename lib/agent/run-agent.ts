// The agent loop: Claude thinks → calls tools → we run them → Claude answers.
import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS, executeTool, loadMemories, nowInIST, type ClientAction, type ToolContext } from "./tools";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentResult = {
  reply: string;
  clientActions: ClientAction[];
  toolsUsed: string[];
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MAX_STEPS = 8;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

function systemPrompt(name: string, memories: string[]) {
  return `You are Harsh's personal voice assistant — like Siri or Gemini, but his own.
Your replies are SPOKEN ALOUD, so:
- Keep answers short: 1–3 sentences unless he asks for detail.
- Plain conversational English. No markdown, bullet points, emojis, URLs or tables.
- Say amounts naturally ("four hundred and fifty rupees"). Currency is INR.
- Don't mention sources or citations out loud.

About Harsh: ${name || "Harsh"}, final-year EXTC engineering student in Mumbai (timezone Asia/Kolkata). He is job-hunting for product / data / research analyst roles.
Current time: ${nowInIST()}.

How to act:
- When he asks you to DO something (log, add, remind, open, call, search), use a tool, then confirm in one short sentence.
- For anything current (news, scores, weather, prices, openings), use web_search. Never guess live facts.
- If a request is ambiguous and the action can't be undone, ask one short question first. Otherwise just do it.
- If a tool returns an error, say what went wrong simply.
- Gmail is read-only: you can summarise mail but never send, delete or reply. Calendar events can be listed and created. If a Google tool says Google isn't connected, tell him to connect it in Talk settings.
- You cannot read his notifications, change phone settings, or control other apps beyond device_action. Say so honestly if asked.

Things Harsh has asked you to remember:
${memories.length ? memories.map((m) => `- ${m}`).join("\n") : "- (nothing yet)"}`;
}

export async function runAgent(opts: {
  uid: string;
  userName?: string;
  history: ChatTurn[];
  message: string;
}): Promise<AgentResult> {
  const ctx: ToolContext = { uid: opts.uid, clientActions: [] };
  const toolsUsed: string[] = [];
  const memories = await loadMemories(opts.uid).catch(() => []);

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.slice(-12).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: opts.message },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(opts.userName ?? "", memories),
      tools: TOOL_DEFINITIONS,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    // Server tools (web search) can pause a long turn — just continue it.
    if (res.stop_reason === "pause_turn") continue;

    if (res.stop_reason === "tool_use") {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        toolsUsed.push(block.name);
        let output: unknown;
        try {
          output = await executeTool(block.name, (block.input ?? {}) as Record<string, unknown>, ctx);
        } catch (err) {
          console.error(`Tool ${block.name} failed`, err);
          output = { error: err instanceof Error ? err.message : "Tool failed" };
        }
        const isError = typeof output === "object" && output !== null && "error" in output;
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output), is_error: isError });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn / max_tokens → collect the spoken reply.
    for (const block of res.content) {
      if (block.type === "server_tool_use") toolsUsed.push(block.name);
    }
    const reply = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { reply: reply || "Done.", clientActions: ctx.clientActions, toolsUsed };
  }

  return {
    reply: "Sorry, that took too many steps. Could you try asking in a simpler way?",
    clientActions: ctx.clientActions,
    toolsUsed,
  };
}
