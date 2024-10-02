# [Chat](https://jsr.io/@loading/chat)

![chat](./assets/chat.svg)

## Simply run the following command and thats it

```sh
deno run -A jsr:@loading/chat
```

## [Optional] create a `chat-config.toml` file in the active directory to configure the chat

```toml
"$schema" = 'https://raw.githubusercontent.com/load1n9/chat/refs/heads/main/config-schema.json'

[config]
model = "onnx-community/Llama-3.2-1B-Instruct" # Model to use
system = [
  "You are an assistant designed to help with any questions the user might have."
] # System prompts
max_new_tokens = 128 # Maximum number of tokens to generate
max_length = 20 # Maximum length of the response
temperature = 1.0 # Temperature for sampling
top_p = 1.0 # Top-p for sampling
repetition_penalty = 1.2 # Repetition penalty
```

## Run the server to kinda match a similar api to the openai chat api

```sh
deno serve -A jsr:@loading/chat/server
```

### Try it out

```sh
curl -X POST http://localhost:8000/v1/completions \  -H "Content-Type: application/json" \  -d '{    "prompt": "Once upon a time",    "max_tokens": 50,    "temperature": 0.7  }'
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
