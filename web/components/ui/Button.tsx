import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "highlight" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button className={`ui-button ui-button--${variant} ${className}`.trim()} type={type} {...props} />;
}
