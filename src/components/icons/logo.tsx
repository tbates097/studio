import Image from "next/image";
import type { ComponentProps } from "react";

interface LogoProps extends Omit<ComponentProps<typeof Image>, 'src' | 'alt'> {
  className?: string;
}

export function Logo({ className, ...props }: LogoProps) {
  return (
    <Image
      src="/AerotechLogo.svg"
      alt="Aerotech Logo"
      className={className}
      {...props}
    />
  );
}