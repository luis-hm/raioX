import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

export function Card({ title, icon, action, children, className = "", ...props }: CardProps) {
  return (
    <section className={`ui-card ${className}`.trim()} {...props}>
      {(title || action) && (
        <div className="ui-card__heading">
          {title && <h2 className="ui-card__title">{icon && <span className="ui-card__title-icon" aria-hidden="true">{icon}</span>}{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
