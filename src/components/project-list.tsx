"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Project } from "@/types/project";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Github, Terminal, FolderOpen } from "lucide-react";
import Link from "next/link";

type OrgFilter = "todd-g" | "minimagroup" | undefined;

export function ProjectList({ orgFilter }: { orgFilter?: OrgFilter }) {
  const projectsData = useQuery(api.projects.list, { org: orgFilter });
  const projects = projectsData as Project[] | undefined;

  if (!projects) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-muted-foreground">No projects yet</p>
        <Button asChild>
          <Link href="/new">Create your first project</Link>
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Org</TableHead>
          <TableHead>Port</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project._id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{project.projectName}</span>
                <span className="text-xs text-muted-foreground">
                  {project.repoName}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={project.org === "todd-g" ? "default" : "secondary"}>
                {project.org}
              </Badge>
            </TableCell>
            <TableCell>
              <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                :{project.port}
              </code>
            </TableCell>
            <TableCell>
              <Badge
                variant={project.status === "running" ? "default" : "outline"}
                className={
                  project.status === "running"
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : ""
                }
              >
                {project.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" asChild title="Open in browser">
                  <a
                    href={`http://localhost:${project.port}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" asChild title="Open on GitHub">
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Copy terminal command"
                  onClick={() => {
                    navigator.clipboard.writeText(`cd ${project.localPath} && npm run dev`);
                  }}
                >
                  <Terminal className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Open folder"
                  onClick={() => {
                    navigator.clipboard.writeText(`code ${project.localPath}`);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
