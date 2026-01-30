"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ProjectList } from "@/components/project-list";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

interface Account {
  name: string;
  vercel_token: string;
}

interface Credentials {
  accounts: Record<string, Account>;
  org_mapping: Record<string, string>;
}

function ProjectsPageContent() {
  const searchParams = useSearchParams();
  const orgFilter = searchParams.get("org") as string | null;
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

  let pageTitle = "All Projects";
  if (orgFilter && credentials) {
    const accountKey = credentials.org_mapping[orgFilter];
    const account = accountKey ? credentials.accounts[accountKey] : null;
    pageTitle = account ? `${account.name} Projects` : `${orgFilter} Projects`;
  } else if (orgFilter) {
    pageTitle = `${orgFilter} Projects`;
  }

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
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Button asChild size="sm">
            <Link href="/new">
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Link>
          </Button>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="rounded-xl border bg-card">
            <ProjectList orgFilter={orgFilter ?? undefined} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProjectsPageContent />
    </Suspense>
  );
}
