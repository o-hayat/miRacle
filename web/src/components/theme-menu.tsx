"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const choices = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const current =
    choices.find((choice) => choice.value === (mounted ? theme : "system")) ??
    choices[2];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="secondary" className="theme-trigger" />}
        aria-label={`Change theme, current theme ${current.label}`}
        disabled={!mounted}
      >
        <Icon data-icon="inline-start" />
        {current.label}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label="Appearance"
        side="top"
        align="end"
        sideOffset={8}
        className="min-w-44"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current.value}
            onValueChange={(value) => setTheme(String(value))}
          >
            {choices.map(({ value, label, icon: ChoiceIcon }) => (
              <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                <ChoiceIcon aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
