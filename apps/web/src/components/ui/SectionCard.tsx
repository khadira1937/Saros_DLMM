"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card"

interface SectionCardProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
  headerClassName?: string
  contentClassName?: string
}

const SectionCard: React.FC<SectionCardProps> = ({
  title,
  description,
  children,
  className,
  actions,
  headerClassName,
  contentClassName,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={className}
    >
      <Card>
        <CardHeader className={cn("space-y-1", headerClassName)}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>{title}</CardTitle>
              {description && (
                <CardDescription>{description}</CardDescription>
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
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-4", contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export { SectionCard }