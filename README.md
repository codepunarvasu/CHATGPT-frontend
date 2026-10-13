# ChatGPT Clone

A ChatGPT-style chat interface built with plain HTML, CSS and JavaScript. No frameworks, no build step.

**Live demo:** https://YOUR-USERNAME.github.io/chatgpt-clone/

## Features

- Streaming replies that appear word by word, with a Stop button
- Chat history in the sidebar, with search and delete
- Markdown rendering: headings, lists, tables, links and code blocks with a Copy button
- Copy and Regenerate on every reply
- Dark and light theme
- Responsive layout with a slide-over sidebar on phones
- Works with OpenAI-compatible APIs (OpenAI, Groq, OpenRouter and others) and Anthropic
- Demo mode when no API key is set, so the page still works for visitors

## Run it

Open `index.html` in a browser. To chat for real, click **Settings & API key**, choose a provider and paste your key.

## Deploy on GitHub Pages

1. Push these files to a public repository.
2. Go to **Settings > Pages**, set the source to the `main` branch and `/ (root)`, then save.
3. Your site appears at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## About the API key

This is a frontend-only project, so the key you enter is stored in your own browser (localStorage) and sent directly to the provider. It is never part of the code. Do not hard-code a key in `script.js` or commit one to GitHub, because anyone could read and use it. For a production app, send requests through your own backend server instead.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and the settings dialog |
| `style.css` | Layout, themes and Markdown styling |
| `script.js` | Chat logic, API streaming, Markdown renderer, storage |
