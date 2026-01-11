import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return setting?.value;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("settings", { key: args.key, value: args.value });
    }
  },
});

// Default templates
export const DEFAULT_TECH_STACK = `# Tech Stack

## Frontend
- **Framework**: Next.js (latest stable, App Router)
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui with sidebar-08 layout

## Backend
- **Database & Functions**: Convex
- **Real-time**: Convex subscriptions

## Infrastructure
- **Hosting**: Vercel
- **CLI Tools**: Vercel CLI, Convex CLI

## Development Setup
1. \`npm install\`
2. \`npx convex dev\` (in separate terminal)
3. \`npm run dev\`
4. Open \`http://localhost:{port}\`
`;

export const DEFAULT_CLAUDE_TEMPLATE = `# {projectName}

{description}

## Tech Stack
- Next.js (latest stable, App Router)
- Tailwind CSS 4 with shadcn/ui (sidebar-08 variant)
- Convex for database/backend
- Vercel for hosting
- Use Vercel CLI and Convex CLI for all deployments

## Development
- Run \`npm run dev\` for Next.js dev server
- Run \`npx convex dev\` for Convex in development mode
- Local dev server runs on port {port}

## Commands
- \`vercel\` - Deploy to Vercel
- \`npx convex deploy\` - Deploy Convex functions
`;
