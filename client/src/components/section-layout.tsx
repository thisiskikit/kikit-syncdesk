import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { StatusBadge } from "./status-badge";
import { WorkspaceEntryLink } from "./workspace-tabs";

export type SectionNavItem = {
  href: string;
  label: string;
  badge?: "live" | "draft" | "coming" | "shared";
  matchPrefixes?: string[];
};

export function SectionLayout(props: {
  section: string;
  title: string;
  description: string;
  navItems: SectionNavItem[];
  secondaryNavItems?: SectionNavItem[];
  secondaryNavTitle?: string;
  children: ReactNode;
}) {
  const [location] = useLocation();
  const providedSecondaryNavTitle = props.secondaryNavTitle ?? "";
  const hasHangul = /[\u3131-\uD79D]/.test(providedSecondaryNavTitle);
  const hasNonAscii = /[^\x00-\x7F]/.test(providedSecondaryNavTitle);
  const secondaryNavTitle =
    props.section === "COUPANG" && hasNonAscii && !hasHangul
      ? "\uAE30\uD0C0 \uC5C5\uBB34"
      : props.secondaryNavTitle ?? "\uBCF4\uC870 \uBA54\uB274";

  const renderNavItems = (items: SectionNavItem[]) =>
    items.map((item) => {
      const active =
        location === item.href ||
        location.startsWith(`${item.href}/`) ||
        (item.href.includes("?") && location === item.href.split("?")[0]) ||
        (item.matchPrefixes || []).some((prefix) => location.startsWith(prefix));

      return (
        <WorkspaceEntryLink
          key={item.href}
          href={item.href}
          className={`section-nav-link ${active ? "active" : ""}`}
        >
          <span>{item.label}</span>
          {item.badge ? <StatusBadge tone={item.badge} /> : null}
        </WorkspaceEntryLink>
      );
    });

  return (
    <div className="section-layout">
      <aside className="section-sidebar">
        <div className="section-sidebar-header">
          <div className="section-label">{props.section}</div>
          <strong>{props.title}</strong>
          <div className="muted">{props.description}</div>
        </div>

        <nav className="section-nav" aria-label={`${props.section} main menu`}>
          {renderNavItems(props.navItems)}
        </nav>

        {props.secondaryNavItems?.length ? (
          <div className="section-nav-secondary">
            <div className="section-nav-heading">{secondaryNavTitle}</div>
            <nav className="section-nav" aria-label={`${props.section} secondary menu`}>
              {renderNavItems(props.secondaryNavItems)}
            </nav>
          </div>
        ) : null}
      </aside>

      <div className="section-content">{props.children}</div>
    </div>
  );
}
