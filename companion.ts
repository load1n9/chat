/**
 * @module chat.ts
 * @description A more complex chatbot that uses the Hugging Face transformers pipeline and tries to reason about code and find its own bugs. Hugely inspired by https://github.com/Doriandarko/o1-engineer
 */
// deno-lint-ignore-file no-explicit-any
import { pipeline } from "npm:@huggingface/transformers@3.0.0-alpha.19";
import {
  blue,
  brightRed,
  gray,
  green,
  magenta,
  red,
  yellow,
} from "jsr:@std/fmt@1.0.2/colors";
import { parseArgs } from "jsr:@std/cli@1.0.6/parse-args";
import {
  help,
  isBinaryFile,
  loadGitignorePatterns,
  modelCallback,
  Prompts,
  shouldIgnore,
} from "./utils.ts";
import { ensureDir } from "jsr:@std/fs@1.0.4/ensure-dir";
import { dirname } from "jsr:@std/path@1.0.6/dirname";
import { existsSync } from "jsr:@std/fs@1.0.4/exists";
import { walk } from "jsr:@std/fs@1.0.4/walk";

/**
 * Parse the command line arguments
 */
const args = parseArgs(Deno.args, {
  boolean: ["help"],
  string: ["device", "model"],
  alias: { help: ["h"], model: ["m"], device: ["d"] },
});

if (args.help) {
  help();
}

const model = args.model || "onnx-community/Llama-3.2-1B-Instruct";

/**
 * The model
 */
const generator = await pipeline(
  "text-generation",
  model,
  {
    device: args.device as any,
    progress_callback: modelCallback,
  },
);

/**
 * The chat messages
 */
export let history: {
  role: string;
  content: string;
}[] = [];

let lastAIResponse: string | undefined;

async function applyEditInstructions(
  editInstructions: Record<string, string>,
  originalFiles: Record<string, string>,
): Promise<Record<string, string>> {
  const modifiedFiles: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(originalFiles)) {
    if (editInstructions[filePath]) {
      const instructions = editInstructions[filePath];
      const promptMessage =
        `${Prompts.APPLY_EDITS}\n\nOriginal File: ${filePath}\nContent:\n${content}\n\nEdit Instructions:\n${instructions}\n\nUpdated File Content:`;
      const response = await chatWithAI(promptMessage, true);
      if (response) {
        modifiedFiles[filePath] = response.trim();
      }
    } else {
      modifiedFiles[filePath] = content;
    }
  }
  return modifiedFiles;
}

async function chatWithAI(
  userMessage: string,
  isEditRequest = false,
  retryCount = 0,
  addedFiles?: Record<string, string>,
): Promise<string | null> {
  try {
    if (addedFiles) {
      let fileContext = "Added files:\n";
      for (const [filePath, content] of Object.entries(addedFiles)) {
        fileContext += `File: ${filePath}\nContent:\n${content}\n\n`;
      }
      userMessage = `${fileContext}\n${userMessage}`;
    }

    if (!isEditRequest) {
      const convoHistory = history
        .map((
          msg,
          idx,
        ) => (idx % 2 === 0 ? `User: ${msg}` : `AI: ${msg}`))
        .join("\n");
      if (convoHistory) {
        userMessage = `${convoHistory}\nUser: ${userMessage}`;
      }
    }

    let messageContent = userMessage;

    if (isEditRequest) {
      const prompt = retryCount === 0 ? Prompts.EDIT : Prompts.APPLY_EDITS;
      messageContent = `${prompt}\n\nUser request: ${userMessage}`;
    }

    const messages = [{ role: "user", content: messageContent }];

    if (isEditRequest && retryCount === 0) {
      console.log(
        magenta(
          "Analyzing files and generating modifications...",
        ),
      );
    } else if (!isEditRequest) {
      console.log(magenta("companion is thinking..."));
    }

    const response = await generator(messages, {
      max_length: 6000,
    });

    lastAIResponse = (response[0] as any).generated_text.at(-1).content;

    if (!isEditRequest) {
      history.push({ role: "user", content: userMessage });
      history.push({ role: "system", content: lastAIResponse! });
      if (history.length > 20) {
        history = history.slice(-20);
      }
    }

    return lastAIResponse!;
  } catch (e) {
    console.log(red(`Error while communicating with OpenAI: ${e}`));
    return null;
  }
}

async function addFileToContext(
  filePath: string,
  addedFiles: Record<string, string>,
  action = "to the chat context",
): Promise<void> {
  const excludedDirs = new Set([
    "__pycache__",
    ".git",
    "node_modules",
    "venv",
    "env",
    ".vscode",
    ".idea",
    "dist",
    "build",
    "__mocks__",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
    "logs",
    "temp",
    "tmp",
    "secrets",
    "private",
    "cache",
    "addons",
  ]);

  const gitignorePatterns = await loadGitignorePatterns(".");

  const stat = await Deno.stat(filePath);
  if (stat.isFile) {
    if ([...excludedDirs].some((dir) => filePath.includes(dir))) {
      console.log(yellow(`Skipped excluded directory file: ${filePath}`));
      return;
    }

    if (
      gitignorePatterns.length &&
      shouldIgnore(filePath, gitignorePatterns)
    ) {
      console.log(
        yellow(`Skipped file matching .gitignore pattern: ${filePath}`),
      );
      return;
    }

    if (await isBinaryFile(filePath)) {
      console.log(yellow(`Skipped binary file: ${filePath}`));
      return;
    }

    try {
      const content = await Deno.readTextFile(filePath);
      addedFiles[filePath] = content;
      console.log(green(`Added ${filePath} ${action}.`));
    } catch (e) {
      console.log(red(`Error reading file ${filePath}: ${e}`));
    }
  } else {
    console.log(red(`Error: ${filePath} is not a file.`));
  }
}
async function applyModifications(
  newContent: string,
  filePath: string,
): Promise<boolean> {
  try {
    const oldContent = await Deno.readTextFile(filePath);

    if (oldContent.trim() === newContent.trim()) {
      console.log(red(`No changes detected in ${filePath}`));
      return true;
    }

    // Display diff (you can implement a diff function or use an existing library)
    console.log(blue(`Changes for ${filePath}:`));
    console.log(red(`- Original Content:\n${oldContent}`));
    console.log(green(`+ New Content:\n${newContent}`));

    const shouldApply = confirm(
      `Apply these changes to ${filePath}?`,
    );
    if (shouldApply) {
      await Deno.writeTextFile(filePath, newContent);
      console.log(
        green(
          `Modifications applied to ${filePath} successfully.`,
        ),
      );
      return true;
    } else {
      console.log(red(`Changes not applied to ${filePath}.`));
      return false;
    }
  } catch (e) {
    console.log(
      red(
        `An error occurred while applying modifications to ${filePath}: ${e}`,
      ),
    );
    return false;
  }
}

async function applyCreationSteps(
  creationResponse: string,
  addedFiles: Record<string, string>,
  retryCount = 0,
): Promise<boolean> {
  const maxRetries = 3;
  try {
    const codeBlocks = [
      ...creationResponse.matchAll(/```(?:\w+)?\s*([\s\S]*?)```/g),
    ].map(
      (m) => m[1],
    );

    if (!codeBlocks.length) {
      throw new Error("No code blocks found in the AI response.");
    }

    console.log("Successfully extracted code blocks:");

    for (const code of codeBlocks) {
      const infoMatch = code.match(/### (FILE|FOLDER): (.+)/);

      if (infoMatch) {
        const itemType = infoMatch[1];
        const path = infoMatch[2];

        if (itemType === "FOLDER") {
          await ensureDir(path);
          console.log(green(`Folder created: ${path}`));
        } else if (itemType === "FILE") {
          const fileContent = code.replace(/### FILE: .+\n/, "")
            .trim();

          const directory = dirname(path);
          if (directory && !existsSync(directory)) {
            await ensureDir(directory);
            console.log(green(`Folder created: ${directory}`));
          }

          await Deno.writeTextFile(path, fileContent);
          console.log(green(`File created: ${path}`));
        }
      } else {
        console.log(
          red(
            "Error: Could not determine the file or folder information from the code block.",
          ),
        );
        continue;
      }
    }

    return true;
  } catch (e: any) {
    if (retryCount < maxRetries) {
      console.log(
        red(`Error: ${e.message} Retrying... (Attempt ${retryCount + 1})`),
      );
      const errorMessage =
        `${e.message} Please provide the creation instructions again using the specified format.`;
      await new Promise((resolve) =>
        setTimeout(resolve, 2 ** retryCount * 1000)
      );
      const newResponse = await chatWithAI(
        errorMessage,
        false,
        retryCount + 1,
        addedFiles,
      );
      if (newResponse) {
        return applyCreationSteps(
          newResponse,
          addedFiles,
          retryCount + 1,
        );
      } else {
        return false;
      }
    } else {
      console.log(
        red(
          `Failed to parse creation instructions after multiple attempts: ${e.message}`,
        ),
      );
      console.log("Creation response that failed to parse:");
      console.log(creationResponse);
      return false;
    }
  }
}

const addedFiles: Record<string, string> = {};

console.log(gray("Type a message to chat with the model."));
console.log(brightRed("'/exit' or ctrl+c to quit."));
console.log(yellow("'/help for a list of commands.'"));

while (true) {
  console.log(gray("\n\n════════════════"));
  const command = prompt("Enter a message ▪ ");

  if (!command || command.length < 1) {
    continue;
  }

  if (command === "/help") {
    console.log(
      gray(
        `
/help - Show this help message.
/edit PATHS - Edit files or directories (followed by paths)
/create INSTRUCTION - Create files or folders (followed by instructions)
/add FILE - Add a file to the chat context (followed by a file path)
/debug - Print the last AI response.
/reset - Reset the chat context.
/review FILE_PATHS - Review code files (followed by file paths)
/planning - Generate a detailed plan based on your request
/exit - Exit the chat.

        `,
      ),
    );
  } else if (command.trim().toLowerCase() === "/debug") {
    if (lastAIResponse) {
      console.log(blue("Last AI Response:"));
      console.log(lastAIResponse);
    } else {
      console.log(red("No AI response available yet."));
    }
  } else if (command.trim().toLowerCase() === "/reset") {
    history = [];
    for (const key in addedFiles) delete addedFiles[key];
    lastAIResponse = undefined;
    console.log(
      green("Chat context and added files have been reset."),
    );
  } else if (command.startsWith("/add")) {
    const paths = command.split(" ").slice(1);
    if (!paths.length) {
      console.log(
        red("Please provide at least one file or folder path."),
      );
      continue;
    }
    for (const path of paths) {
      const stat = await Deno.stat(path).catch(() => null);
      if (stat) {
        if (stat.isFile) {
          await addFileToContext(path, addedFiles);
        } else if (stat.isDirectory) {
          for await (const entry of walk(path)) {
            if (entry.isFile) {
              await addFileToContext(entry.path, addedFiles);
            }
          }
        } else {
          console.log(
            red(
              `Error: ${path} is neither a file nor a directory.`,
            ),
          );
        }
      } else {
        console.log(red(`Error: ${path} does not exist.`));
      }
    }
  } else if (command.startsWith("/edit")) {
    const paths = command.split(" ").slice(1);
    if (!paths.length) {
      console.log(
        red("Please provide at least one file or folder path."),
      );
      continue;
    }
    const editInstructions: Record<string, string> = {};
    for (const path of paths) {
      if (addedFiles[path]) {
        console.log(
          yellow(
            `File ${path} is already added to the chat context. Provide the edit instructions for this file.`,
          ),
        );
        const instructions = prompt("Edit Instructions ▪ ");
        if (instructions) {
          editInstructions[path] = instructions;
        } else {
          console.log(
            yellow(
              `No edit instructions provided for ${path}. Skipping...`,
            ),
          );
        }
      } else {
        console.log(
          yellow(
            `File ${path} is not added to the chat context. Please add it first.`,
          ),
        );
      }
    }

    if (Object.keys(editInstructions).length) {
      const modifiedFiles = await applyEditInstructions(
        editInstructions,
        addedFiles,
      );
      for (
        const [filePath, newContent] of Object.entries(modifiedFiles)
      ) {
        await applyModifications(newContent, filePath);
      }
    } else {
      console.log(
        yellow(
          "No edit instructions provided. Skipping the edit operation.",
        ),
      );
    }
  } else if (command.startsWith("/create")) {
    const instruction = command.split(" ").slice(1).join(" ");
    if (!instruction) {
      console.log(
        red("Please provide the creation instructions for files and folders."),
      );
      continue;
    }
    const success = await applyCreationSteps(instruction, addedFiles);
    if (success) {
      console.log(green("Creation steps applied successfully."));
    } else {
      console.log(red("Failed to apply creation steps."));
    }
  } else if (command.startsWith("/review")) {
    const paths = command.split(" ").slice(1);
    if (!paths.length) {
      console.log(
        red("Please provide at least one file or folder path."),
      );
      continue;
    }
    for (const path of paths) {
      if (addedFiles[path]) {
        console.log(
          yellow(
            `File ${path} is already added to the chat context. Review the file content.`,
          ),
        );
        console.log(addedFiles[path]);
      } else {
        console.log(
          yellow(
            `File ${path} is not added to the chat context. Please add it first.`,
          ),
        );
      }
    }
  } else if (command.startsWith("/planning")) {
    const planningMessage = `${Prompts.PLANNING}\n\nUser request: ${command}`;
    const response = await chatWithAI(planningMessage, false);
    if (response) {
      console.log();
      console.log(blue("companion thing:"));
      console.log(response);
    }
  } else if (command === "/exit") {
    Deno.exit(0);
  } else {
    const aiResponse = await chatWithAI(command, false, 0, addedFiles);
    if (aiResponse) {
      console.log();
      console.log(blue("companion thing:"));
      console.log(aiResponse);
    }
  }
}
