import Link from "next/link";
import type { ReactNode } from "react";

export type ErrorStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  action: { label: string; href: string };
};

export function ErrorState({ title, description, icon = "!", action }: ErrorStateProps) {
  return (
    <section className="ui-card ui-state ui-state--error" role="alert" aria-label={title}>
      <span className="ui-state__icon" aria-hidden="true">{icon}</span>
      <h1 className="ui-state__title">{title}</h1>
      <p className="ui-state__description">{description}</p>
      <Link className="ui-button ui-button--primary" href={action.href}>{action.label}</Link>
    </section>
  );
}
