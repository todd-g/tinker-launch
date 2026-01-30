import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    repoName: v.string(),
    projectName: v.string(),
    org: v.string(), // GitHub org or username
    description: v.string(),
    localPath: v.string(),
    githubUrl: v.string(),
    port: v.number(),
    status: v.union(v.literal("running"), v.literal("stopped"), v.literal("unknown")),
    pid: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["org"])
    .index("by_port", ["port"])
    .index("by_repoName", ["repoName"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
  }).index("by_key", ["key"]),
});
