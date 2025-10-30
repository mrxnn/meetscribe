import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "h-12 w-full outline-none border-none ring-4 p-4 ring-neutral-300 rounded text-inherit text-base bg-neutral-200 focus:ring-blue-500 focus:bg-neutral-100",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
