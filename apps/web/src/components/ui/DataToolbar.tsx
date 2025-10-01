"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Search, SlidersHorizontal, Download, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Separator } from "./separator"

interface DataToolbarProps {
  title?: string
  searchPlaceholder?: string
  onSearch?: (value: string) => void
  searchValue?: string
  onRefresh?: () => void
  onExport?: () => void
  onFilter?: () => void
  className?: string
  children?: React.ReactNode
  loading?: boolean
  actions?: React.ReactNode
}

const DataToolbar: React.FC<DataToolbarProps> = ({
  title,
  searchPlaceholder = "Search...",
  onSearch,
  searchValue = "",
  onRefresh,
  onExport,
  onFilter,
  className,
  children,
  loading = false,
  actions,
}) => {
  const [localSearchValue, setLocalSearchValue] = React.useState(searchValue)
  
  React.useEffect(() => {
    setLocalSearchValue(searchValue)
  }, [searchValue])
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalSearchValue(value)
    onSearch?.(value)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex flex-col gap-4 p-4 bg-card border rounded-lg",
        className
      )}
    >
      <div className="flex items-center justify-between">
        {title && (
          <h3 className="text-lg font-semibold">{title}</h3>
        )}
        
        <div className="flex items-center gap-2">
          {actions}
          
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn(
                "h-4 w-4",
                loading && "animate-spin"
              )} />
              Refresh
            </Button>
          )}
          
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {onSearch && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={localSearchValue}
              onChange={handleSearchChange}
              className={cn(
                "w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              disabled={loading}
            />
          </div>
        )}
        
        <div className="flex items-center gap-2">
          {onFilter && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onFilter}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </Button>
              <Separator orientation="vertical" className="h-6" />
            </>
          )}
          
          {children}
        </div>
      </div>
    </motion.div>
  )
}

export { DataToolbar }