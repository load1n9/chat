/**
 * @module server.ts
 * @description A simple chatbot server that uses the Hugging Face transformers pipeline.
 */
// deno-lint-ignore-file no-explicit-any
import { pipeline } from "npm:@huggingface/transformers@3.0.0-alpha.19";
import { parse } from "jsr:@std/toml@1.0.1";
import { exists } from "jsr:@std/fs@1.0.4";
import { type Handler, router } from "jsr:@denosaurs/rutt@0.3.0";
import { parseArgs } from "jsr:@std/cli@1.0.6/parse-args";
import { cyan, gray } from "jsr:@std/fmt@1.0.2/colors";
import { help, modelCallback } from "./utils.ts";

let systemStuff: string[] | undefined;
let model: string | undefined;
let config: any;

/**
 * Parse the command line arguments
 */
const args = parseArgs(Deno.args, {
  boolean: ["help", "openai"],
  string: ["model", "device"],
  alias: { help: ["h"], model: ["m"], device: ["d"] },
});

if (args.help) {
  help();
}

if (await exists("./chat-config.toml")) {
  console.log("Loading configuration from chat-config.toml...\n");
  config = parse(await Deno.readTextFile("chat-config.toml")) as any;
  if (config.config?.model) {
    model = config.config.model;
  }
  if (config.config?.system) {
    systemStuff = config.config.system;
  }
}

if (args.model) {
  model = args.model;
}

const generator = await pipeline(
  "text-generation",
  model || "onnx-community/Llama-3.2-1B-Instruct",
  {
    device: args.device as any,
    progress_callback: modelCallback,
  },
);

console.log(
  gray(
    `Model: ${
      model ? cyan(model.split("/")[1]) : cyan("Llama-3.2-1B-Instruct")
    }`,
  ),
);

const routes: Handler = router({
  [args.openai ? "v1/completions" : "/api/completions"]: async (req, _) => {
    try {
      const body = await req.json();
      const prompt = body.prompt;
      const max_tokens = body.max_tokens ||
        (config ? config.config?.max_new_tokens || 128 : 128);
      const temperature = body.temperature || 1.0;
      const top_p = body.top_p || 1.0;

      if (!prompt) {
        return new Response(
          JSON.stringify({ error: "Prompt is required." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const messages = [
        {
          role: "system",
          content: systemStuff
            ? systemStuff.join("\n")
            : "You are a helpful assistant",
        },
        {
          role: "user",
          content: prompt,
        },
      ];

      const output = await generator(messages, {
        max_new_tokens: max_tokens,
        temperature,
        top_p,
      });

      const responseText = (output[0] as any).generated_text?.at(-1)?.content ||
        "";

      const response = {
        id: `cmpl-${crypto.randomUUID()}`,
        object: "text_completion",
        created: Math.floor(Date.now() / 1000),
        model: model || "onnx-community/Llama-3.2-1B-Instruct",
        choices: [
          {
            text: responseText,
            index: 0,
            logprobs: null,
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: responseText.length,
          total_tokens: prompt.length + responseText.length,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error processing request:", error);
      return new Response(
        JSON.stringify({ error: "Internal Server Error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
  [args.openai ? "v1/chat/completions" : "api/chat"]: async (req, _) => {
    try {
      const body = await req.json();
      const messages = body.messages;
      const max_tokens = body.max_tokens ||
        (config ? config.config?.max_new_tokens || 128 : 128);
      const temperature = body.temperature || 1.0;
      const top_p = body.top_p || 1.0;

      if (!messages) {
        return new Response(
          JSON.stringify({ error: "Messages are required." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const output = await generator(messages, {
        max_new_tokens: max_tokens,
        temperature,
        top_p,
      });

      const responseText = (output[0] as any).generated_text?.at(-1)?.content ||
        "";

      const response = {
        id: `cmpl-${crypto.randomUUID()}`,
        object: "text_completion",
        created: Math.floor(Date.now() / 1000),
        model: model || "onnx-community/Llama-3.2-1B-Instruct",
        choices: [
          {
            text: responseText,
            index: 0,
            logprobs: null,
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: responseText.length,
          total_tokens: prompt.length + responseText.length,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error processing request:", error);
      return new Response(
        JSON.stringify({ error: "Internal Server Error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
});
export default {
  /**
   * @description Fetch completions from the model
   */
  fetch: routes,
};
