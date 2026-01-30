export interface Project {
  _id: string;
  repoName: string;
  projectName: string;
  org: string;
  description: string;
  localPath: string;
  githubUrl: string;
  port: number;
  status: "running" | "stopped" | "unknown";
  pid?: number;
  createdAt: number;
}
