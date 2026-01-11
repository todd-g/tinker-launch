"use client";

import * as React from "react";
import Link from "next/link";
import { FolderPlus, Folders, Rocket, Settings, Network } from "lucide-react";

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

const data = {
  navMain: [
    {
      title: "Projects",
      url: "/",
      icon: Folders,
      isActive: true,
      items: [
        {
          title: "All Projects",
          url: "/",
        },
        {
          title: "Personal (todd-g)",
          url: "/?org=todd-g",
        },
        {
          title: "Company (minimagroup)",
          url: "/?org=minimagroup",
        },
      ],
    },
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
      title: "Settings",
      url: "/settings",
      icon: Settings,
      items: [
        {
          title: "Defaults",
          url: "/settings",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "New Project",
      url: "/new",
      icon: FolderPlus,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
