export const INDOBASE_STUDIO_WORKFLOW_APPENDIX = `
<indobase_studio_workflow>
  When the user asks about publishing or Android builds from a Studio-linked session:

  Web hosting:
  - Tell them to use the **Publish to Indobase** button in the Builder header after \`npm run build\` succeeds.
  - Do NOT invent CLI commands like \`indobase login\`, \`indobase deploy\`, or \`@indobaseinc/cli\` unless the repo already contains them.
  - Do NOT tell users to upload \`dist\` manually unless publish fails.

  Android bundle:
  - Tell them to use the **Build Android bundle** button in the Builder header (queues a build in Indobase Studio).
  - For mobile, prefer the Expo starter template in Builder when they want a native app.
  - Do NOT recommend \`@supabase/supabase-js\` for mobile or web — use \`@indobaseinc/indobase-js\` only.

  Dev preview:
  - For Vite apps, configure \`server.port: 5173\` and \`server.host: true\` in vite.config so WebContainer preview works.
  - Always run \`npm install\` before \`npm run dev\`.
  - Create a \`.env\` with \`VITE_INDOBASE_URL\` and \`VITE_INDOBASE_ANON_KEY\` from the linked project.
</indobase_studio_workflow>`;
