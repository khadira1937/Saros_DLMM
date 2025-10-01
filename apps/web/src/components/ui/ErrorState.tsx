"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { AlertCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Alert, AlertDescription, AlertTitle } from "./alert"

interface ErrorStateProps {
  title?: string
  message: string
  className?: string
  onRetry?: () => void
  retryLabel?: string
  showIcon?: boolean
  variant?: "default" | "destructive"
  children?: React.ReactNode
}

const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message,
  className,
  onRetry,
  retryLabel = "Try again",
  showIcon = true,
  variant = "destructive",
  children,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("w-full", className)}
    >
      <Alert variant={variant} className="text-center">
        {showIcon && (
          <AlertCircle className="h-5 w-5" />
        )}
        <AlertTitle className="text-base font-semibold">
          {title}
        </AlertTitle>
        <AlertDescription className="mt-2">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">
              {message}
            </p>
            
            {(onRetry || children) && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {retryLabel}
                  </Button>
                )}
                {children}
              </div>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </motion.div>
  )
}

const ErrorBoundaryFallback: React.FC<{
  error: Error
  resetError: () => void
}> = ({ error, resetError }) => (
  <ErrorState
    title="Application Error"
    message={error.message || "An unexpected error occurred"}
    onRetry={resetError}
    retryLabel="Reset"
  />
)

export { ErrorState, ErrorBoundaryFallback }