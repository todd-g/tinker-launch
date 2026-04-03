"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useDbQuery } from "@/hooks/use-db";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

interface PromptPattern {
  pattern: string;
  count: number;
  examples: string[];
  projects: string[];
  lastUsed: string;
}

interface ProjectStats {
  projectPath: string;
  projectName: string | null;
  sessionCount: number;
  totalMessages: number;
  firstSession: string;
  lastSession: string;
}

interface ToolUsageStats {
  tool: string;
  count: number;
  sessions: number;
}

interface SessionSummary {
  sessionId: string;
  projectName: string | null;
  summary: string;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
}

interface AnalysisResult {
  totalProjects: number;
  totalSessions: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  projectStats: ProjectStats[];
  promptPatterns: PromptPattern[];
  toolUsage: ToolUsageStats[];
  recentSessions: SessionSummary[];
  slashCommandUsage: { command: string; count: number }[];
}

type Tab = "overview" | "patterns" | "tools" | "sessions" | "commands";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("overview");

  const { data, loading, refetch } = useDbQuery<{
    success: boolean;
    analysis: AnalysisResult;
  }>("/api/messages");

  const analysis = data?.analysis;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Message Analysis</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Tabs */}
          <div className="flex gap-1">
            {(
              [
                ["overview", "Overview"],
                ["patterns", "Prompt Patterns"],
                ["commands", "Slash Commands"],
                ["tools", "Tool Usage"],
                ["sessions", "Recent Sessions"],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <Button
                key={t}
                variant={tab === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTab(t)}
                className="text-xs"
              >
                {label}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Analyzing conversations...
              </span>
            </div>
          ) : !analysis ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No conversation data found.
            </p>
          ) : (
            <>
              {/* Overview Tab */}
              {tab === "overview" && (
                <div className="space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-muted-foreground font-normal">
                          Projects
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {analysis.totalProjects}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-muted-foreground font-normal">
                          Sessions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {analysis.totalSessions}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-muted-foreground font-normal">
                          Your Messages
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatNumber(analysis.totalUserMessages)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-muted-foreground font-normal">
                          Tokens (In/Out)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatNumber(analysis.totalInputTokens)}/
                          {formatNumber(analysis.totalOutputTokens)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Project Breakdown */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Projects by Session Count
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Sessions</TableHead>
                          <TableHead>Messages</TableHead>
                          <TableHead>First</TableHead>
                          <TableHead>Last</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.projectStats.map((p) => (
                          <TableRow key={p.projectPath}>
                            <TableCell className="font-medium">
                              {p.projectName}
                            </TableCell>
                            <TableCell>{p.sessionCount}</TableCell>
                            <TableCell>{p.totalMessages}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.firstSession
                                ? formatDate(p.firstSession)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.lastSession
                                ? formatDate(p.lastSession)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Patterns Tab */}
              {tab === "patterns" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Repeated prompt patterns across your conversations. High-count
                    patterns are candidates for skills.
                  </p>
                  {analysis.promptPatterns.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No repeated patterns detected yet. Keep using Claude Code!
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pattern</TableHead>
                          <TableHead>Count</TableHead>
                          <TableHead>Projects</TableHead>
                          <TableHead>Last Used</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.promptPatterns.slice(0, 30).map((p, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="space-y-1">
                                <span className="text-sm font-medium">
                                  {p.examples[0]}
                                </span>
                                {p.examples.length > 1 && (
                                  <div className="text-xs text-muted-foreground">
                                    also: {p.examples.slice(1).join(", ")}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.count >= 5 ? "default" : "secondary"
                                }
                              >
                                {p.count}x
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {p.projects.map((proj) => (
                                  <Badge
                                    key={proj}
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {proj}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(p.lastUsed)}
                            </TableCell>
                            <TableCell>
                              {p.count >= 5 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  Skill candidate
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}

              {/* Slash Commands Tab */}
              {tab === "commands" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Slash commands you&apos;ve used across all conversations.
                  </p>
                  {analysis.slashCommandUsage.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No slash command usage detected.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Command</TableHead>
                          <TableHead>Times Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.slashCommandUsage.map((c) => (
                          <TableRow key={c.command}>
                            <TableCell className="font-mono text-sm font-medium">
                              {c.command}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{c.count}x</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}

              {/* Tools Tab */}
              {tab === "tools" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Tools Claude uses most across your sessions.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tool</TableHead>
                        <TableHead>Invocations</TableHead>
                        <TableHead>Sessions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.toolUsage.slice(0, 20).map((t) => (
                        <TableRow key={t.tool}>
                          <TableCell className="font-mono text-sm">
                            {t.tool}
                          </TableCell>
                          <TableCell>
                            {formatNumber(t.count)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {t.sessions}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Sessions Tab */}
              {tab === "sessions" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Most recent Claude Code sessions.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Messages</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.recentSessions.map((s) => (
                        <TableRow key={s.sessionId}>
                          <TableCell>
                            <Badge variant="outline">
                              {s.projectName}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm line-clamp-1 max-w-[300px]">
                              {s.summary || s.firstPrompt || "—"}
                            </span>
                          </TableCell>
                          <TableCell>{s.messageCount}</TableCell>
                          <TableCell>
                            {s.gitBranch ? (
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                {s.gitBranch}
                              </code>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(s.modified)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
