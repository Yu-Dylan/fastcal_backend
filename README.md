# 6.104 Assignment 4: Implementing Concepts

In this assignment, you'll begin creating your backend by implementing your concepts in TypeScript. You'll learn to use Context, a simple CLI tool and a new way to both collaborate with LLMs and drive your implementation through design.

# Setup (Prep)

## 0. Fork this repository

First, [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo#forking-a-repository) this repository, and **rename** it to your desired project name, and give a description of your project.

## 1. Install Deno

[Install from Deno's website](https://deno.com)

Deno is a successor to Node.js (by the same creator, Ryan Dahl) that greatly simplifies tooling, is more secure by default, and is backwards-compatible with the larger ecosystem. Check out Deno's [extensive documentation](https://docs.deno.com/runtime/) for various helpful guides on a wide variety of common application needs and [integrations](https://docs.deno.com/examples/).

**Note:** when importing from `npm` packages, prefix with `npm:` as in: 
```typescript
import { MongoClient } from "npm:mongo"
```

For VSCode users, consider also installing the Deno [extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) and referring to the [docs](https://docs.deno.com/runtime/reference/vscode/) if you'd like to configure behavior.
## 2. Compile Context

To create a convenient binary, run the following command from the root of the directory:
```shell
deno compile -A --output ctx .ctx/context.ts
```

## 3. Setup Gemini

Copy or change `.env.template` to the environment file: `.env` and insert your Gemini API key:

```env
GEMINI_API_KEY=YOUR_KEY_HERE
GEMINI_MODEL=gemini-2.5-flash
```
You can choose any [models](https://ai.google.dev/gemini-api/docs/models) using `GEMINI_MODEL`, such as `gemini-2.5-flash-lite` for faster responses, or `gemini-2.5-pro` for higher quality.

You may also edit the `./geminiConfig.json` file to change the parameters according to any of the [GenerationConfig](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig) options, including turning on/off thinking, limiting tokens, etc.

## 4. Setup your MongoDB Atlas Cluster (free)

For this project, we'll be using MongoDB as the database. To get started, use either the slides or the instructions:
### Slides
[MongoDB Setup](https://docs.google.com/presentation/d/1DBOWIQ2AAGQPDRgmnad8wN9S9M955LcHYZQlnbu-QCs/edit?usp=sharing)
### Instructions
1. Create your [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) account.
2. When selecting a template, choose the __free__ option, M0.
4. At the Security Quickstart page, select how you want to authenticate your connection and keep the rest of the defaults. Make sure to allow access to all IPs as shown in [this slide](https://docs.google.com/presentation/d/1DBOWIQ2AAGQPDRgmnad8wN9S9M955LcHYZQlnbu-QCs/edit?usp=sharing).
5. Once created, click the __CONNECT__ button, select __driver__, and copy the srv connection string. If using username and password, the url should look something like this: `mongodb+srv://<username>:<password>@cluster0.p82ijqd.mongodb.net/?retryWrites=true&w=majority`. Make sure to replace username and password with your actual values.
6. Add your connection url (without `<` and `>`) to `MONGODB_URL=<connection url>` to your `.env` file. 
7. Give your database a name under `DB_NAME=<your database name>`.

## 5. Install Obsidian

[Obsidian](https://obsidian.md)

Obsidian is an open-source Markdown editor and personal knowledge management solution. The Context tool **does not** require use of Obsidian, and you may use any preferred editor, but we highly recommend using Obsidian to navigate your assignment and the generated context to write, view, and structure your prompts and design documents. 

### Link settings

This should be correctly set already, but under Obsidian -> Settings -> Files and links, make sure that:
1. `New link format` is set to `Relative path to file`
2. `Use [[Wikilinks]]` is disabled
3. `Detect all file extensions` is enabled (so you can easily view code and drop links to code files)

![](media/obsidian_settings.png)

# Exercise 0 

Context is a simple Markdown-based framework for building design knowledge and collaborating with an LLM. There is no additional syntax: any text-based repository with code of any language with documentation written as Markdown is compatible.

## 0. Note

**Important:** do not delete or modify anything from the `context` directory. Content is hashed by ID, meaning that corruption can be detected, but not recovered from automatically. This pairs nicely with git in case you mess up, so don't forget to commit once in a while!

## 1. Getting started with Context

Context allows you to treat any Markdown document as a conversation with an LLM: everything in the document is exactly what both you and the LLM sees. Each step is broken up by `# Heading 1` sections, and you should begin every new prompt or chunk of interesting information using a new section 1 heading. 

### Task:

In `design/brainstorming/questioning.md`, complete the `# prompt: Why ... ?` with your burning question for the universe. Then, from the root of the repository, run this command in the terminal (if you're using Obsidian, you should be able to copy the command by clicking on `Shell` in the top right):

```shell
./ctx prompt design/brainstorming/questioning.md
```

You should see any thinking appear in the terminal, with the rest of the completion streamed into the file. In general, you can `prompt` a LLM to chime in with 

```shell
./ctx prompt <path_to_file>.md
```

where `<path_to_file>` is also a link **relative to the root** of the repository.

## 2. Including context

You can **include** other documents to embed their contents, allowing you to compose exactly the context that you want. In Obsidian's file explorer on the left, expand the `design/background` and `design/learning` folders, then click on `understanding-concepts`. This should open a blank document.

### Task:

Drag and drop `concept-design-overview` into the body of `understanding-concepts`. This should show up as a normal link. Then, to make it a link that Context will include, simply add the `@` sign to the beginning of the link text (the part in the brackets), like so:

![](media/linking.png)

**Important:** includes should be on their own paragraph - make sure that there's an empty line between them and other content. 

Next, type `# question: ...` and fill in any question you have about concepts, then prompt through Context. 

**Tip:** you can easily get the relative link you need to paste into a terminal after `./ctx prompt` by right/ctrl clicking the file in the explorer directly:

![](media/relative_linking.png)

## 3. Viewing context

The `context` directory is an immutable and complete history of every file that the tool interacts with - this means that you shouldn't be afraid of editing or deleting files! This directory is a mirror of the rest of the repository, just nested one layer deeper. In addition, files such as `understanding-concepts.md` become a directory, as in `understanding-concepts.md/` and contain a timestamped version of its entire history. 

### Context folders

Each Markdown file within these directories have the format `timestamp.hash_id.md`, where the `hash_id` is a **content-based hash** that helps you identify, across the entire repository, usages of the same document or content. 

### Individual steps

Inside the `steps` directory one layer deeper are granular files of the form `step.hash_id.md` that contain all the unique steps (`# heading 1` blocks) ever present in the file. This helps identify at-a-glance what the contents of each document are, such as prompts or responses. By default, the `step` in the file name is a `_` character, unless the heading contains a prefix of the form `# prefix: ...`, which can be a useful way to break up a document (that you can follow yourself, or prompt an LLM to do so).

**Important:** this is the reason for the previous warning about not modifying the `context` directory. The content-based hashes means we can detect such edits/deletes, but the more important point is that you keep a legible history of your design choices and explorations (which can be invaluable for prompting!)

### Task:

1. Consider again `design/brainstorming/questioning`, and **find** the version of the document in `context` containing the LLM's response. Note that `ctx prompt` will save both a before and after version. Drag or insert a link to this in `design/learning/exercise-0`
2. Go back to `questioning`, and **edit** the response to put in your own typed answer. **Tip:** you can collapse the entire response heading (hover to the left of the heading, and click the downwards arrow) and select it quickly to delete the entire block.
3. Use `./ctx save <link_to_questioning.md>` to manually **save** the file to `context`, then find the updated version and link to it in the `exercise-0` document.
4. Use Context to save `exercise-0` as well. (Optional): delete any of these files - if you've properly saved/prompted, we'll be able to find it in the context. We encourage you to continue to prompt/save your brainstorming and learning, and they will help with finding interesting moments for your assignment!

**Note:** `ctx save` is only necessary if you manually edit files, such as your second response to `questioning` or your solutions that you copy paste into `exercise-0`. Any time you `ctx prompt`, both the before and after versions are automatically saved.
# Implementing concepts

You're now ready to create the context that you need to implement concepts with (or without) the aid of an LLM! We've provided you with a number of documents/prompts in `design/background`, each its own self-contained bit of knowledge about concept design in general and implementing them in TypeScript. 

- `design/background`: Background knowledge that you should treat as both prompts and documentation for you to read about concept design. Feel free to add any additional background documents that you think are good prompts. Also, if you think you can contribute, you may also edit any existing prompts and point them out!
- `design/brainstorm`: Plan, chat with an LLM, use as a scratch pad - create and synthesize context about your potential ideas.
- `design/concepts`: Place your actual concept spec documents here. Feel free to copy a whole document from `brainstorm` if you started there and trim down, or simply mutate in place (with `ctx prompt` or `ctx save` throughout).
- `design/learning`: When you feel like you've learned something significant, such as important decisions or caveats/challenges you encounter, record them here. **Tip:** you can always copy an entire document from another place (like `brainstorm`), add a `# summarize: extract the important lessons from everything above`, followed by a `ctx prompt`, then simply delete the original parts.

### Task:

Implement your concepts, either using LLM assistance through `ctx prompt`, or implementing by hand and documenting your progress with `ctx save`. The following tips may help:

### Sample concept: LikertSurvey

We've included a sample concept called LikertSurvey. This is a different version than shown in lecture, where the specification itself was also completely generated. You can inspect `design/concepts/LikertSurvey` to see exactly how this was done, and its history in `context`. This concept is saved, so feel free to delete the design or the source code (useful to delete at least the testing file to prevent it from running when you execute all tests). 

**Generated concept:** notice that `LikertSurvey/LikertSurvey.md` is actually a link pointing to the specific **step** of that previous generation in the context! This is also an embedded link, meaning that Obsidian previews it for you automatically. You can upgrade any link to an embedded link by putting an `!` in front of it, and as long as you still have the `@` sign in the link text, Context will treat it as an include all the same.

### Implementation

Look around the background folder and see which might help you implement concepts, depending on how much of an existing design you already have. The `LikertSurvey/implementation` document gives one example of how this was done. The file that contains most of the information about the technical details of concept implementations is `implementing-concepts.md`.
### Testing

You can read about testing in `testing-concepts.md`. In general, we're using all the standard options, and for testing the current prompts use the [Deno testing framework](https://docs.deno.com/runtime/fundamentals/testing/). Tests are defined by any file with the name `filename.test.ts` in your directory. To run all tests, simply run:

```shell
deno test -A
```

where the `-A` flag means to give all permissions. Be careful with this - it's convenient, but Deno's default security model helps you find if a package you import is sneakily trying to do something your program doesn't (like load local files). There's plenty of [documentation](https://docs.deno.com/runtime/fundamentals/security/) about a more scoped approach to this.

**Confirming your setup:** run the command above to make sure that you've configured everything correctly. You should see in your MongoDB Atlas console the created collections in the test database! These are temporary and will be wiped every time you start a new test.
### Tips for including code

Since `.ts` files don't show up in Obsidian, VSCode has a similar option where you can right/ctrl click a code file, and `Copy Relative Path` to get a repo-based link to include in your context. 

Context understands both the relative links generated by default when dragging files in Obsidian, as well as repo-based links. When you copy-paste these kinds of links from outside sources, you'll need to additionally prepend the link with a `/` to tell Context that it should look it up from the repo root:
```md
[@MyConceptImplementation](/src/concepts/MyConcept.ts)
```

This also turns out to be the same convention that Github uses, so you'll be able to navigate your links there too!

