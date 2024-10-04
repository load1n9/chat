// deno-lint-ignore-file no-explicit-any
import { pipeline } from "npm:@huggingface/transformers@3.0.0-alpha.19";
import { delay } from "jsr:@std/async";
import { parseArgs } from "jsr:@std/cli@1.0.6/parse-args";
import { help, modelCallback } from "./utils.ts";
import { gray } from "jsr:@std/fmt@1.0.2/colors";

/**
 * Parse the command line arguments
 */
const args = parseArgs(Deno.args, {
  boolean: ["help"],
  string: ["model", "device"],
  alias: { help: ["h"], model: ["m"], device: ["d"] },
});

if (args.help) {
  help();
}

const model = args.model || "onnx-community/Llama-3.2-1B-Instruct";
const temperature = 0.2;
const maxLength = 300;

/**
 * The model
 */
const generator = await pipeline(
  "text-generation",
  model || "onnx-community/Llama-3.2-1B-Instruct",
  {
    device: args.device as any,
    progress_callback: modelCallback,
  },
);

async function makeApiCall(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  isFinalAnswer = false,
): Promise<any> {
  const userPrompt = messages.map((msg) => msg.content).join("\n");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const output = await generator(userPrompt, {
        max_new_tokens: maxTokens,
        temperature,
        max_length: maxLength,
      });
      const parsedOutput = JSON.parse((output[0] as any).generated_text);
      return parsedOutput;
    } catch (e: any) {
      if (attempt === 2) {
        if (isFinalAnswer) {
          return {
            title: "Error",
            content:
              `Failed to generate final answer after 3 attempts. Error: ${e.message}`,
          };
        } else {
          return {
            title: "Error",
            content:
              `Failed to generate step after 3 attempts. Error: ${e.message}`,
            next_action: "final_answer",
          };
        }
      }
      await delay(1000);
    }
  }
}
/**
 * Create a generator function that generates responses step by step
 */
async function* generateResponse(prompt: string) {
  const messages = [
    {
      role: "system",
      content:
        `You are an expert AI assistant that explains your reasoning step by step. For each step, provide a title that describes what you're doing in that step, along with the content. Decide if you need another step or if you're ready to give the final answer. Respond in JSON format with 'title', 'content', and 'next_action' (either 'continue' or 'final_answer') keys.`,
    },
    { role: "user", content: prompt },
    {
      role: "assistant",
      content:
        "Thank you! I will now think step by step following my instructions, starting at the beginning after decomposing the problem.",
    },
  ];

  const steps: Array<
    { title: string; content: string; thinkingTime: number }
  > = [];
  let stepCount = 1;
  let totalThinkingTime = 0;

  while (true) {
    const startTime = performance.now();
    const stepData = await makeApiCall(messages, 300);
    const endTime = performance.now();
    const thinkingTime = (endTime - startTime) / 1000;
    totalThinkingTime += thinkingTime;

    steps.push({
      title: `Step ${stepCount}: ${stepData.title}`,
      content: stepData.content,
      thinkingTime,
    });

    messages.push({ role: "assistant", content: JSON.stringify(stepData) });

    if (stepData.next_action === "final_answer" || stepCount > 25) {
      break;
    }

    stepCount++;

    yield { steps, totalThinkingTime: null };
  }

  messages.push({
    role: "user",
    content: "Please provide the final answer based on your reasoning above.",
  });

  const finalStartTime = performance.now();
  const finalData = await makeApiCall(messages, 200, true);
  const finalEndTime = performance.now();
  const finalThinkingTime = (finalEndTime - finalStartTime) / 1000;
  totalThinkingTime += finalThinkingTime;

  steps.push({
    title: "Final Answer",
    content: finalData.content,
    thinkingTime: finalThinkingTime,
  });

  yield { steps, totalThinkingTime };
}

while (true) {
  console.log(gray("\n\n════════════════"));
  const res = prompt("Enter a message ▪ ");

  if (!res || res.length < 1) {
    continue;
  }
  if (res === "/exit") {
    Deno.exit(0);
  }
  if (res) {
    console.log("Generating response...");

    const responseContainer: string[] = [];
    let totalThinkingTime: number | null = null;

    for await (const result of generateResponse(res)) {
      responseContainer.length = 0;
      result.steps.forEach((step) => {
        responseContainer.push(
          step.title === "Final Answer"
            ? `### ${step.title}\n${step.content}`
            : `\n**${step.title}**\n${step.content}`,
        );
      });

      console.clear();
      responseContainer.forEach((step) => console.log(step));

      if (result.totalThinkingTime !== null) {
        totalThinkingTime = result.totalThinkingTime;
        console.log(
          `\nTotal thinking time: ${totalThinkingTime.toFixed(2)} seconds`,
        );
      }
    }
  }
}
