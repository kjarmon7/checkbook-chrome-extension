import type React from "react"
import { Building2 } from "lucide-react"

interface CompanyNameProps {
    name: string;
    isLoading?: boolean;
    icon?: React.ReactNode;
}

export const CompanyName = ({ name, icon = <Building2 className="h-5 w-5" /> }: CompanyNameProps) => {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg bg-gradient-to-b from-white to-gray-50 px-4 py-3 shadow max-w-xs w-full mx-auto border border-gray-100 ring-1 ring-inset ring-gray-50">
        <div className="text-blue-600">{icon}</div>
        <span className="font-medium text-gray-800">{ name }</span>
      </div>
    )
}
