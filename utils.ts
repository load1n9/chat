import { existsSync } from "jsr:@std/fs@1.0.4/exists";
import {
  bold,
  brightMagenta,
  cyan,
  gray,
  white,
} from "jsr:@std/fmt@1.0.2/colors";
import { join } from "jsr:@std/path@1.0.6/join";

export function modelCallback(
  data: {
    status: "done" | "ready" | "download" | "progress" | "initiate";
    name: string;
    file: string;
    progress?: number;
    loaded?: number;
    total?: number;
  },
) {
  if (data.status === "download") {
    console.log(
      gray(
        `Downloading ${bold(white(data.name))} from ${
          bold(white(data.file))
        }...`,
      ),
    );
  }
  if (data.status === "progress") {
    console.log(
      gray(
        `Downloading ${bold(white(data.name))} from ${
          bold(white(data.file))
        }: ${data.progress}%`,
      ),
    );
  }
  if (data.status === "done") {
    console.log(
      brightMagenta(
        `Downloaded ${bold(white(data.name))} from ${bold(white(data.file))}.`,
      ),
    );
  }
}

export function help(_scope: string = ".") {
  console.log(
    gray(
      cyan(`
                                                Cat Sounds
                                          /\\_/\\  / 
                                         ( o.o )
                                          > ^ <
                                         (_/^\\_)    
    
                                         by Dean Srebnik
                                         MIT License
          `) + `
                           Usage: deno run -A jsr:@loading/chat [options]
                  An llm in your terminal that uses the Hugging Face transformers pipeline.
    
    
                        Chat with the model using the default settings and model unless a chat-config.toml file is present.
       --help,-h        Show this help message.
       --model, -m          The model to use. Defaults to onnx-community/Llama-3.2-1B-Instruct.
       --device, -d         The device to use. Defaults to "cpu".
        ),
       `,
    ),
  );
  Deno.exit(0);
}

/**
 * Get the current working directory and its contents
 */
export async function cwdToFile(): Promise<string> {
  const dir = Deno.cwd();
  let output = "Here is the structure of the user's current directory:\n";
  async function readDirRecursive(
    path: string,
    indent: string = "",
  ): Promise<void> {
    for await (const dirEntry of Deno.readDir(path)) {
      if (dirEntry.isDirectory) {
        output += `${indent}Directory: ${dirEntry.name}\n`;
        await readDirRecursive(`${path}/${dirEntry.name}`, indent + "  ");
      } else if (dirEntry.isFile) {
        output += `${indent}File: ${dirEntry.name}\n`;
        if (dirEntry.name === "README.md") {
          output += `${indent}Contents: ${await Deno.readTextFile(
            `${path}/${dirEntry.name}`,
          )}\n`;
        }
      } else if (dirEntry.isSymlink) {
        output += `${indent}Symlink: ${dirEntry.name}\n`;
      }
    }
  }

  await readDirRecursive(dir);
  output += "\n";
  if (output.length > 1000) {
    output = output.slice(0, 1000) + "\n...output truncated...";
  }
  return output;
}

export async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const file = await Deno.open(filePath, { read: true });
    const buffer = new Uint8Array(1024);
    const bytesRead = await file.read(buffer);
    file.close();

    if (bytesRead === null) return false;
    const chunk = buffer.subarray(0, bytesRead);

    if (chunk.includes(0)) return true;

    const textDecoder = new TextDecoder();
    const text = textDecoder.decode(chunk);
    // deno-lint-ignore no-control-regex
    const nonText = text.replace(/[\x09\x0A\x0D\x20-\x7E]/g, "");
    if (nonText.length / chunk.length > 0.3) return true;
  } catch (e) {
    console.error(`Error reading file ${filePath}: ${e}`);
    return true;
  }
  return false;
}

export async function loadGitignorePatterns(
  directory: string,
): Promise<string[]> {
  const gitignorePath = join(directory, ".gitignore");
  const patterns: string[] = [];
  if (existsSync(gitignorePath)) {
    const content = await Deno.readTextFile(gitignorePath);
    content.split("\n").forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        patterns.push(line);
      }
    });
  }
  return patterns;
}

export const shouldIgnore = (filePath: string, patterns: string[]): boolean =>
  patterns.some((pattern) => filePath.includes(pattern));

/**
 * Prompts for reasoning chains
 * Completely stolen from https://github.com/Doriandarko/o1-engineer
 */
export enum Prompts {
  CREATE =
    `You are an advanced o1 engineer designed to create files and folders based on user instructions. Your primary objective is to generate the content of the files to be created as code blocks. Each code block should specify whether it's a file or folder, along with its path.

When given a user request, perform the following steps:

1. Understand the User Request: Carefully interpret what the user wants to create.
2. Generate Creation Instructions: Provide the content for each file to be created within appropriate code blocks. Each code block should begin with a special comment line that specifies whether it's a file or folder, along with its path.
3. You create full functioning, complete,code files, not just snippets. No approximations or placeholders. FULL WORKING CODE.

IMPORTANT: Your response must ONLY contain the code blocks with no additional text before or after. Do not use markdown formatting outside of the code blocks. Use the following format for the special comment line. Do not include any explanations, additional text:

For folders:
\`\`\`
### FOLDER: path/to/folder
\`\`\`

For files:
\`\`\`language
### FILE: path/to/file.extension
File content goes here...
\`\`\`

Example of the expected format:

\`\`\`
### FOLDER: new_app
\`\`\`

\`\`\`html
### FILE: new_app/index.html
<!DOCTYPE html>
<html>
<head>
  <title>New App</title>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>
\`\`\`

\`\`\`css
### FILE: new_app/styles.css
body {
  font-family: Arial, sans-serif;
}
\`\`\`

\`\`\`javascript
### FILE: new_app/script.js
console.log('Hello, World!');
\`\`\`

Ensure that each file and folder is correctly specified to facilitate seamless creation by the script.`,
  CODE_REVIEW =
    `You are an expert code reviewer. Your task is to analyze the provided code files and provide a comprehensive code review. For each file, consider:

1. Code Quality: Assess readability, maintainability, and adherence to best practices
2. Potential Issues: Identify bugs, security vulnerabilities, or performance concerns
3. Suggestions: Provide specific recommendations for improvements

Format your review as follows:
1. Start with a brief overview of all files
2. For each file, provide:
 - A summary of the file's purpose
 - Key findings (both positive and negative)
 - Specific recommendations
3. End with any overall suggestions for the codebase

Your review should be detailed but concise, focusing on the most important aspects of the code.`,
  EDIT =
    `You are an advanced o1 engineer designed to analyze files and provide edit instructions based on user requests. Your task is to:

1. Understand the User Request: Carefully interpret what the user wants to achieve with the modification.
2. Analyze the File(s): Review the content of the provided file(s).
3. Generate Edit Instructions: Provide clear, step-by-step instructions on how to modify the file(s) to address the user's request.

Your response should be in the following format:

\`\`\`
File: [file_path]
Instructions:
1. [First edit instruction]
2. [Second edit instruction]
...

File: [another_file_path]
Instructions:
1. [First edit instruction]
2. [Second edit instruction]
...
\`\`\`

Only provide instructions for files that need changes. Be specific and clear in your instructions."""


APPLY_EDITS_PROMPT = """
Rewrite an entire file or files using edit instructions provided by another AI.

Ensure the entire content is rewritten from top to bottom incorporating the specified changes.

# Steps

1. **Receive Input:** Obtain the file(s) and the edit instructions. The files can be in various formats (e.g., .txt, .docx).
2. **Analyze Content:** Understand the content and structure of the file(s).
3. **Review Instructions:** Carefully examine the edit instructions to comprehend the required changes.
4. **Apply Changes:** Rewrite the entire content of the file(s) from top to bottom, incorporating the specified changes.
5. **Verify Consistency:** Ensure that the rewritten content maintains logical consistency and cohesiveness.
6. **Final Review:** Perform a final check to ensure all instructions were followed and the rewritten content meets the quality standards.
7. Do not include any explanations, additional text, or code block markers (such as \`\`\`html or \`\`\`).

Provide the output as the FULLY NEW WRITTEN file(s).
NEVER ADD ANY CODE BLOCK MARKER AT THE BEGINNING OF THE FILE OR AT THE END OF THE FILE (such as \`\`\`html or \`\`\`). `,
  APPLY_EDITS =
    `Rewrite an entire file or files using edit instructions provided by another AI.

Ensure the entire content is rewritten from top to bottom incorporating the specified changes.

# Steps

1. **Receive Input:** Obtain the file(s) and the edit instructions. The files can be in various formats (e.g., .txt, .docx).
2. **Analyze Content:** Understand the content and structure of the file(s).
3. **Review Instructions:** Carefully examine the edit instructions to comprehend the required changes.
4. **Apply Changes:** Rewrite the entire content of the file(s) from top to bottom, incorporating the specified changes.
5. **Verify Consistency:** Ensure that the rewritten content maintains logical consistency and cohesiveness.
6. **Final Review:** Perform a final check to ensure all instructions were followed and the rewritten content meets the quality standards.
7. Do not include any explanations, additional text, or code block markers (such as \`\`\`html or \`\`\`).

Provide the output as the FULLY NEW WRITTEN file(s).
NEVER ADD ANY CODE BLOCK MARKER AT THE BEGINNING OF THE FILE OR AT THE END OF THE FILE (such as \`\`\`html or \`\`\`). 
`,
  PLANNING =
    `You are an AI planning assistant. Your task is to create a detailed plan based on the user's request. Consider all aspects of the task, break it down into steps, and provide a comprehensive strategy for accomplishment. Your plan should be clear, actionable, and thorough.`,
}
