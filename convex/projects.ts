import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {
    org: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.org) {
      return await ctx.db
        .query("projects")
        .withIndex("by_org", (q) => q.eq("org", args.org!))
        .collect();
    }
    return await ctx.db.query("projects").collect();
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByRepoName = query({
  args: { repoName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_repoName", (q) => q.eq("repoName", args.repoName))
      .first();
  },
});

export const getNextPort = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    if (projects.length === 0) return 3001;
    const maxPort = Math.max(...projects.map((p) => p.port));
    return maxPort + 1;
  },
});

export const create = mutation({
  args: {
    repoName: v.string(),
    projectName: v.string(),
    org: v.string(),
    description: v.string(),
    localPath: v.string(),
    githubUrl: v.string(),
    port: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projects", {
      ...args,
      status: "stopped",
      createdAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("projects"),
    status: v.union(v.literal("running"), v.literal("stopped"), v.literal("unknown")),
    pid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      pid: args.pid,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
