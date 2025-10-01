"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

interface SkeletonRowProps {
  className?: string
  columns?: number
  rows?: number
  showAvatar?: boolean
  showActions?: boolean
}

const SkeletonRow: React.FC<SkeletonRowProps> = ({
  className,
  columns = 4,
  rows = 3,
  showAvatar = false,
  showActions = false,
}) => {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center space-x-4 p-4 rounded-lg border bg-card"
        >
          {showAvatar && (
            <Skeleton className="h-10 w-10 rounded-full" />
          )}
          
          <div className="flex-1 grid gap-4" style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`
          }}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={colIndex} className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
          
          {showActions && (
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("rounded-lg border bg-card p-6", className)}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-4" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-48" />
    </div>
  </div>
)

const SkeletonTable: React.FC<{
  className?: string
  columns?: number
  rows?: number
}> = ({
  className,
  columns = 4,
  rows = 5,
}) => (
  <div className={cn("rounded-lg border bg-card", className)}>
    <div className="p-4 border-b">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  </div>
)

export { SkeletonRow, SkeletonCard, SkeletonTable }