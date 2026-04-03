"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BookOpen, Brain, FolderPlus, Folders, MessageSquare, Network, Rocket, Settings, Sparkles, Timer } from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

interface Account {
  name: string;
  vercel_token: string;
}

interface Credentials {
  accounts: Record<string, Account>;
  org_mapping: Record<string, string>;
}

const staticNavMain = [
  {
    title: "Ports",
    url: "/ports",
    icon: Network,
    items: [
      {
        title: "Port Registry",
        url: "/ports",
      },
    ],
  },
  {
    title: "Activity",
    url: "/activity",
    icon: Timer,
    items: [
      {
        title: "Activity Log",
        url: "/activity",
      },
      {
        title: "Day Timeline",
        url: "/activity/timeline",
      },
      {
        title: "Claude Code",
        url: "/activity/claude-code",
      },
    ],
  },
  {
    title: "Skills",
    url: "/skills",
    icon: Sparkles,
    items: [
      {
        title: "Registry",
        url: "/skills",
      },
      {
        title: "New Skill",
        url: "/skills/new",
      },
    ],
  },
  {
    title: "Messages",
    url: "/messages",
    icon: MessageSquare,
    items: [
      {
        title: "Analysis",
        url: "/messages",
      },
    ],
  },
  {
    title: "Knowledge Base",
    url: "/knowledge-base",
    icon: Brain,
    items: [
      {
        title: "Browse",
        url: "/knowledge-base",
      },
    ],
  },
  {
    title: "Documentation",
    url: "/docs",
    icon: BookOpen,
    items: [
      {
        title: "Guide",
        url: "/docs",
      },
    ],
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    items: [
      {
        title: "Projects",
        url: "/settings/projects",
      },
      {
        title: "Orgs",
        url: "/settings/orgs",
      },
      {
        title: "Credentials",
        url: "/settings/credentials",
      },
      {
        title: "Templates",
        url: "/settings",
      },
      {
        title: "Import Projects",
        url: "/settings/import",
      },
    ],
  },
];

const navSecondary = [
  {
    title: "New Project",
    url: "/new",
    icon: FolderPlus,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  useEffect(() => {
    fetch("/api/credentials")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCredentials(data.credentials);
        }
      })
      .catch(() => {});
  }, []);

  const orgItems: { title: string; url: string }[] = [
    { title: "All Projects", url: "/" },
  ];

  if (credentials) {
    const orgs = Object.keys(credentials.org_mapping);
    if (orgs.length > 0) {
      for (const org of orgs) {
        const accountKey = credentials.org_mapping[org];
        const account = credentials.accounts[accountKey];
        const label = account ? `${account.name} (${org})` : org;
        orgItems.push({ title: label, url: `/?org=${org}` });
      }
    } else {
      orgItems.push({ title: "Configure orgs...", url: "/settings/credentials" });
    }
  }

  const navMain = [
    {
      title: "Projects",
      url: "/",
      icon: Folders,
      isActive: true,
      items: orgItems,
    },
    ...staticNavMain,
  ];

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Rocket className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Tinker Launch</span>
                  <span className="truncate text-xs">Project Dashboard</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
