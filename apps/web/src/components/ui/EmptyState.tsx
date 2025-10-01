"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { LucideIcon, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

interface EmptyStateProps {
  title: string
  description: string
  icon?: LucideIcon
  action?: {
    label: string
    onClick: () => void
    variant?: "default" | "secondary" | "outline" | "ghost"
  }
  className?: string
  children?: React.ReactNode
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  children,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center min-h-[300px] p-8 text-center",
        className
      )}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4"
      >
        <Icon className="h-8 w-8 text-muted-foreground" />
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
        className="space-y-2 max-w-md"
      >
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </motion.div>
      
      {(action || children) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3, ease: "easeOut" }}
          className="mt-6 flex flex-col sm:flex-row items-center gap-3"
        >
          {action && (
            <Button
              variant={action.variant}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}

export { EmptyState }