import Link from "next/link";
import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: { label: string; href: string };
};

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <section className="ui-card ui-state" aria-label={title}>
      {icon && <span className="ui-state__icon" aria-hidden="true">{icon}</span>}
      <h1 className="ui-state__title">{title}</h1>
      <p className="ui-state__description">{description}</p>
      {action && <Link className="ui-button ui-button--primary" href={action.href}>{action.label}</Link>}
    </section>
  );
}
