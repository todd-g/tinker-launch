"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
        <Sun className="h-4 w-4" />
        <span>Theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-4 w-4" />
          <span>Light Mode</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4" />
          <span>Dark Mode</span>
        </>
      )}
    </Button>
  );
}
