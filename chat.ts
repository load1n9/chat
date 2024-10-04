/**
 * @module chat.ts
 * @description A simple chatbot that uses the Hugging Face transformers pipeline.
 */
// deno-lint-ignore-file no-explicit-any
import { pipeline } from "npm:@huggingface/transformers@3.0.0-alpha.19";
import { brightRed, cyan, gray, yellow } from "jsr:@std/fmt@1.0.2/colors";
import { parse } from "jsr:@std/toml@1.0.1";
import { exists } from "jsr:@std/fs@1.0.4";
import { parseArgs } from "jsr:@std/cli@1.0.6/parse-args";
import { help, modelCallback } from "./utils.ts";

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

let systemStuff: string[] | undefined = undefined;
let model: string | undefined = undefined;
let config: any;

if (await exists("./chat-config.toml")) {
  console.log(gray("Loading configuration from chat-config.toml...\n"));
  config = parse(await Deno.readTextFile("chat-config.toml"))
    .config as any;
  model = config.model;
  systemStuff = config.system;
}

if (args.model) {
  model = args.model;
}

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

/**
 * The chat messages
 */
export const messages: {
  role: string;
  content: string;
}[] = [
  {
    role: "system",
    content: systemStuff
      ? systemStuff.join("\n")
      : "You are a helpful assistant with knowledge of many things." +
        "Here is some information about the system:\n" +
        `Platform: ${Deno.build.target}\n` +
        `Architecture: ${Deno.build.arch}\n` +
        `Operating System: ${Deno.build.os}\n` +
        `Deno Version: ${Deno.version.deno}\n` +
        `V8 Version: ${Deno.version.v8}\n` +
        `TypeScript Version: ${Deno.version.typescript}\n` +
        `current Deno instance PID: ${Deno.pid}\n` +
        `Deno Memory Usage: ${Deno.memoryUsage().rss} bytes\n`,
  },
];

/**
 * Parse a command
 */
export async function parseCommand(command: string) {
  if (command === "/help") {
    console.log(
      gray(
        `
      /help - Show this help message.
      /exit - Exit the chat.
      /save [file] - Save the chat history to a file.
      /load [file] - Load a chat history from a file.`,
      ),
    );
  }
  if (command === "/save") {
    console.log(yellow("Please provide a file name."));
  }
  if (command === "/load") {
    console.log(yellow("Please provide a file name."));
  }
  if (command.startsWith("/save")) {
    const fileName = command.split(" ")[1];
    await Deno.writeTextFile(
      fileName,
      JSON.stringify(messages, null, 2),
    );
    console.log(yellow(`Chat history saved to ${fileName}.`));
  }
  if (command.startsWith("/load")) {
    const fileName = command.split(" ")[1];
    const file = JSON.parse(await Deno.readTextFile(fileName));
    messages.push(...file);
    console.log(yellow(`Chat history loaded from ${fileName}.`));
  }
  if (command === "/exit") {
    Deno.exit(0);
  }
}

/**
 * Send a message to the model
 */
export async function sendMessage(message: string): Promise<any> {
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

console.log(
  gray(
    `Model: ${
      model ? cyan(model.split("/")[1]) : cyan("Llama-3.2-1B-Instruct")
    }`,
  ),
);
console.log(gray("Type a message to chat with the model."));
console.log(brightRed("'/exit' or ctrl+c to quit."));
console.log(yellow("'/help for a list of commands.'"));

while (true) {
  console.log(gray("\n\n════════════════"));
  const message = prompt("Enter a message ▪ ");

  if (!message || message.length < 1) {
    continue;
  }

  if (message.startsWith("/")) {
    await parseCommand(message);
    continue;
  }
  messages.push({ role: "user", content: message });
  const response = await sendMessage(message);
  console.log("\n" + response);
  messages.push({ role: "system", content: response });
}
