"use client"

import * as React from "react"
import { Check, Palette } from "lucide-react"
import { useAccentColor } from "@/context/accent-color-provider"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function AccentColorToggle() {
  const { accentColor, setAccentColor, accentColorOptions } = useAccentColor()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Toggle accent color"
        >
          <div
            className="h-4 w-4 rounded-full border"
            style={{ backgroundColor: `hsl(${accentColor.light.primary})` }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="grid grid-cols-4 gap-2">
          {accentColorOptions.map((colorOption) => (
            <Button
              key={colorOption.name}
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                accentColor.name === colorOption.name &&
                  "border-2 border-primary"
              )}
              onClick={() => setAccentColor(colorOption)}
            >
              <div
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: `hsl(${colorOption.light.primary})` }}
              >
                {accentColor.name === colorOption.name && (
                  <Check className="h-4 w-4 text-white" />
                )}
              </div>
              <span className="sr-only">{colorOption.name}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
