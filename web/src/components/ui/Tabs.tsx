import { useState, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TabsProps {
  defaultValue: string
  children: ReactNode
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  className?: string
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function Tabs({ defaultValue, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue)

  const childrenArray = Array.isArray(children) ? children : children ? [children] : []

  return (
    <div className="w-full">
      {childrenArray.map((child: any) => {
        if (child.type === TabsList) {
          return (
            <div key="list" className="border-b border-gray-200">
              {child.props.children.map((trigger: any) => (
                <button
                  key={trigger.props.value}
                  onClick={() => setActiveTab(trigger.props.value)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                    activeTab === trigger.props.value
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  {trigger.props.children}
                </button>
              ))}
            </div>
          )
        }
        if (child.type === TabsContent) {
          return (
            <div
              key={child.props.value}
              className={cn(
                "p-4",
                activeTab !== child.props.value && "hidden"
              )}
            >
              {child.props.children}
            </div>
          )
        }
        return child
      })}
    </div>
  )
}

export function TabsList({ children, className }: TabsListProps) {
  return <div className={className}>{children}</div>
}

export function TabsTrigger({ value: _value, children, className }: TabsTriggerProps) {
  return <div className={className}>{children}</div>
}

export function TabsContent({ value: _value, children, className }: TabsContentProps) {
  return <div className={className}>{children}</div>
}








