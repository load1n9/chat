import {
  bold,
  brightMagenta,
  cyan,
  gray,
  white,
} from "jsr:@std/fmt@1.0.2/colors";

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
