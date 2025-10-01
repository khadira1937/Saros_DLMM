"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/components/ui/tooltip"

interface FormRowProps {
  label?: string
  description?: string
  tooltip?: string
  children: React.ReactNode
  className?: string
  labelClassName?: string
  required?: boolean
  error?: string | undefined
  horizontal?: boolean
}

const FormRow: React.FC<FormRowProps> = ({
  label,
  description,
  tooltip,
  children,
  className,
  labelClassName,
  required = false,
  error,
  horizontal = false,
}) => {
  const id = React.useId()
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "space-y-2",
        horizontal && "grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-start",
        className
      )}
    >
      {label && (
        <div className={cn(horizontal && "sm:pt-2")}>
          <div className="flex items-center gap-2">
            <label
              htmlFor={id}
              className={cn(
                "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                labelClassName
              )}
            >
              {label}
              {required && <span className="text-error-500 ml-1">*</span>}
            </label>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger type="button">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {description && (
            <p
              id={descriptionId}
              className="text-xs text-muted-foreground mt-1"
            >
              {description}
            </p>
          )}
        </div>
      )}
      
      <div className={cn(horizontal && "sm:col-span-2")}>
        <div className="space-y-1">
          {React.cloneElement(children as React.ReactElement, {
            id,
            "aria-describedby": cn(
              description ? descriptionId : undefined,
              error ? errorId : undefined
            ),
            "aria-invalid": error ? "true" : undefined,
          })}
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              id={errorId}
              className="text-xs text-error-600 dark:text-error-400"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export { FormRow }