# Project Reflection: FastCal Development

## What Went Well

The project was easy to build because I had always wanted this calendar agent app myself, so I was able to rapidly prototype it. Because the backend was concept driven, it was easy to reason about the system and implement new features independently. I was able to keep the frontend simple because the chat interface shouldn't be too distracting.

## Challenges

Several technical challenges emerged during development. OAuth flow debugging proved particularly tricky due to some restrictions between frontend and backend. I wasn't too familiar with some of these pieces, so I had to read some docs/do my own research to understand what was going on (e.g. Docker and Deno).

There were some difficult design decisions like placement and color, but I mostly just iterated on the design until it was good enough.

## Lessons

One recurring mistake was not committing changes frequently enough. This made it hard to roll back, especially when LLMs would write code that would break the build. I should have been more disciplined about committing changes after each logical change.

Another oversight involved forgetting to set critical environment variables during deployment. Missing `VITE_API_BASE_URL` and `REQUESTING_ALLOWED_DOMAIN` caused mysterious failures that took a while to resolve.

## Skills Acquired

I learned many different parts of software development, including deploying Docker containers, setting up Deno server, interacting with OAuth APIs, and managing environment variables. I also learned what good design looks like, and how to iterate on it fast.

## Conclusions on LLMs in Software Development

LLMs have proven to be powerful accelerators in software development, particularly for handling boilerplate code, repetitive tasks, and implementing standard patterns. They serve effectively as debugging partners.

However, LLMs have clear limitations. They're not autonomous require a lot of human direction and oversight. Context awareness can be an issue because they may lose track of project state without explicit reminders. While they can suggest working solutions, these aren't always perfect.

## Overall Assessment

Overall, this project was fun and I learned a lot. I'm excited to continue learning and using LLMs in my future projects!
