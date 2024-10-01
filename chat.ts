/**
 * @module chat.ts
 * @description A simple chatbot that uses the Hugging Face transformers pipeline.
 */
// deno-lint-ignore-file no-explicit-any
import { pipeline } from "npm:@huggingface/transformers@3.0.0-alpha.19";
import { cyan, gray, yellow } from "jsr:@std/fmt@1.0.2/colors";
import { parse } from "jsr:@std/toml@1.0.1";
import { exists } from "jsr:@std/fs@1.0.4";

let systemStuff: string[] | undefined = undefined;
let model: string | undefined = undefined;
let config: any;
if (await exists("./chat-config.toml")) {
  console.log(gray("Loading configuration from chat-config.toml...\n"));
  config = parse(await Deno.readTextFile("chat-config.toml"))
    .config as any;
  if (config.model) {
    model = config.model;
  }
  if (config.system) {
    systemStuff = config.system;
  }
}

const generator = await pipeline(
  "text-generation",
  model || "onnx-community/Llama-3.2-1B-Instruct",
);

const messages = [
  {
    role: "system",
    content: systemStuff
      ? systemStuff.join("\n")
      : "You are a helpful assistant",
  },
];

/**
 * Send a message to the model
 */
async function sendMessage(message: string) {
  messages.push({ role: "user", content: message });
  const output = await generator(messages, {
    max_new_tokens: config ? config.max_new_tokens || 128 : 128,
    temperature: config ? config.temperature || 1.0 : 1.0,
    max_length: config ? config.max_length || 20 : 20,
    top_p: config ? config.top_p || 1.0 : 1.0,
    repetition_penalty: config ? config.repetition_penalty || 1.0 : 1.0,
  });
  messages.push({
    role: "system",
    content: (output[0] as any).generated_text.at(-1).content,
  });
  return (output[0] as any).generated_text.at(-1).content;
}

console.log(gray("Type a message to chat with the model."));
console.log(yellow("Type 'exit' or ctrl+c to quit."));
console.log(
  gray(
    `Model: ${
      model ? cyan(model.split("/")[1]) : cyan("Llama-3.2-1B-Instruct")
    }`,
  ),
);

while (true) {
  console.log(gray("\n\n════════════════"));
  const message = prompt("Enter a message ▪ ");

  if (message === null || message === "exit") {
    break;
  }
  messages.push({ role: "user", content: message });
  const response = await sendMessage(message);
  console.log("\n" + response);
  messages.push({ role: "system", content: response });
}
