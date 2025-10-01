"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumbs?: React.ReactNode
  className?: string
}

const PageHeader: React.FC<PageHeaderProps> = ({
  className,
  title,
  description,
  actions,
  breadcrumbs,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        {breadcrumbs && (
          <div className="text-sm text-muted-foreground mb-2">
            {breadcrumbs}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
          className="flex items-center gap-2"
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  )
}

export { PageHeader }