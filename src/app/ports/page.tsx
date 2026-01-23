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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Check, Copy, ExternalLink, Scan, Square } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/types/project";
import { isLightColor } from "@/lib/colors";

interface TinkerConfig {
  name?: string;
  description?: string;
  port?: number;
  org?: string;
  repo?: string;
  terminal?: {
    background?: string;
    dark?: string;
    light?: string;
  };
  terminalColorHex?: string;
  favicon?: string;
  projectPath?: string;
}

interface PortInfo {
  port: number;
  pid: number;
  command: string;
  cwd?: string;
  project?: TinkerConfig;
  portName?: string;
  favicon?: string;
}

export default function PortsPage() {
  const projectsData = useQuery(api.projects.list, {});
  const projects = projectsData as Project[] | undefined;
  const updateStatus = useMutation(api.projects.updateStatus);

  const [scanning, setScanning] = useState(false);
  const [systemPorts, setSystemPorts] = useState<PortInfo[]>([]);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [yamlCopied, setYamlCopied] = useState(false);

  const tinkerYamlTemplate = `name: Project Name
description: Brief description of the project
port: 3002
org: todd-g
repo: repo-name

# Terminal appearance (syncs on port scan)
terminal:
  background: "hsl(240, 50%, 10%)"  # Dark blue`;

  const sortedProjects = projects?.slice().sort((a, b) => a.port - b.port) ?? [];

  const scanPorts = useCallback(async () => {
    setScanning(true);
    try {
      const response = await fetch("/api/scan-ports");
      const data = await response.json();
      if (data.success) {
        setSystemPorts(data.ports);
        setLastScan(new Date());

        // Update project statuses based on scan
        if (projects) {
          for (const project of projects) {
            const portInfo = data.ports.find((p: PortInfo) => p.port === project.port);
            const newStatus = portInfo ? "running" : "stopped";
            if (project.status !== newStatus) {
              await updateStatus({
                id: project._id as never,
                status: newStatus,
                pid: portInfo?.pid,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to scan ports:", error);
    }
    setScanning(false);
  }, [projects, updateStatus]);

  // Scan on initial load
  useEffect(() => {
    const doScan = async () => {
      await scanPorts();
    };
    doScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Find project for a port
  const getProjectForPort = (port: number) => {
    return projects?.find((p) => p.port === port);
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Copy YAML template
  const copyYamlTemplate = () => {
    navigator.clipboard.writeText(tinkerYamlTemplate);
    setYamlCopied(true);
    setTimeout(() => setYamlCopied(false), 2000);
  };

  // Kill a process by PID
  const killPort = async (pid: number, port: number, displayName?: string) => {
    const name = displayName || `port ${port}`;
    if (!confirm(`Stop ${name}?`)) return;

    try {
      const response = await fetch("/api/kill-port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh the port list
        setTimeout(() => scanPorts(), 500);
      }
    } catch (error) {
      console.error("Failed to kill process:", error);
    }
  };


  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Port Registry</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2">
            {lastScan && (
              <span className="text-xs text-muted-foreground">
                Last scan: {lastScan.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={scanPorts}
              disabled={scanning}
            >
              <Scan className={`h-4 w-4 mr-1 ${scanning ? "animate-pulse" : ""}`} />
              {scanning ? "Scanning..." : "Scan Ports"}
            </Button>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Card>
            <CardHeader>
              <CardTitle>Active Dev Servers</CardTitle>
              <CardDescription>
                Scanning ports 3000-3100, 4000-4100, 5000-5200, 8000-8100
              </CardDescription>
            </CardHeader>
            <CardContent>
              {systemPorts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {scanning ? "Scanning..." : "No active ports found in range 3000-3100"}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Port</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {systemPorts.map((portInfo) => {
                      const project = getProjectForPort(portInfo.port);
                      // Use portName (specific to this port) or fall back to project name
                      const displayName = portInfo.portName
                        ? `${portInfo.project?.name} — ${portInfo.portName}`
                        : portInfo.project?.name || project?.projectName;
                      const subtitle = portInfo.project?.org && portInfo.project?.repo
                        ? `${portInfo.project.org}/${portInfo.project.repo}`
                        : portInfo.cwd?.replace(/^\/Users\/[^/]+/, "~");
                      const terminalColor = portInfo.project?.terminalColorHex;
                      return (
                        <TableRow
                          key={`${portInfo.port}-${portInfo.pid}`}
                          className="relative"
                          style={terminalColor ? {
                            background: `linear-gradient(90deg, ${terminalColor}30 0%, transparent 60%)`,
                          } : undefined}
                        >
                          <TableCell className="w-28">
                            {terminalColor ? (
                              <div
                                className="w-20 h-14 rounded-md shadow-lg flex items-center justify-center"
                                style={{ backgroundColor: terminalColor }}
                                title={`Terminal: ${portInfo.project?.terminal?.background}`}
                              >
                                <code
                                  className={`text-xl font-mono font-bold drop-shadow-md ${
                                    isLightColor(terminalColor) ? "text-gray-900" : "text-white"
                                  }`}
                                >
                                  {portInfo.port}
                                </code>
                              </div>
                            ) : (
                              <code className="text-lg font-mono font-bold pl-2">
                                {portInfo.port}
                              </code>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {portInfo.project?.favicon && (
                                <img
                                  src={`/api/favicon?path=${encodeURIComponent(portInfo.project.favicon)}`}
                                  alt=""
                                  className="w-8 h-8 rounded"
                                />
                              )}
                              <div className="flex flex-col">
                                {displayName ? (
                                  <a
                                    href={`http://localhost:${portInfo.port}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-lg font-semibold hover:underline"
                                  >
                                    {displayName}
                                  </a>
                                ) : (
                                  <a
                                    href={`http://localhost:${portInfo.port}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-lg text-muted-foreground italic hover:underline"
                                  >
                                    Unidentified
                                  </a>
                                )}
                                {subtitle && (
                                  <span className="text-xs text-muted-foreground">
                                    {subtitle}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" asChild>
                                <a
                                  href={`http://localhost:${portInfo.port}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => killPort(portInfo.pid, portInfo.port, displayName)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              >
                                <Square className="h-4 w-4 fill-current" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* .tinker.yaml Template */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="font-mono">.tinker.yaml</CardTitle>
                  <CardDescription>
                    Add this file to your project root to register it in the port scanner
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyYamlTemplate}
                  className="shrink-0"
                >
                  {yamlCopied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
                {tinkerYamlTemplate}
              </pre>
            </CardContent>
          </Card>

          {/* Registered Projects */}
          <Card>
            <CardHeader>
              <CardTitle>Registered Projects</CardTitle>
              <CardDescription>
                Projects created through Tinker Launch with assigned ports
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sortedProjects.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No projects registered yet
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Port</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedProjects.map((project) => {
                      const isRunning = systemPorts.some((p) => p.port === project.port);
                      return (
                        <TableRow key={project._id}>
                          <TableCell>
                            <code className="text-lg font-mono font-bold">
                              {project.port}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{project.projectName}</span>
                              <span className="text-xs text-muted-foreground">
                                {project.org}/{project.repoName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isRunning ? "default" : "outline"}
                              className={
                                isRunning
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : ""
                              }
                            >
                              {isRunning ? "Running" : "Stopped"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {project.localPath.replace(/^\/Users\/[^/]+/, "~")}
                            </code>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  copyToClipboard(`http://localhost:${project.port}`)
                                }
                                title="Copy URL"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" asChild title="Open">
                                <a
                                  href={`http://localhost:${project.port}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
