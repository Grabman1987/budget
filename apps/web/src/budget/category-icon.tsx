import { categoryEmoji } from './category-emoji';

/**
 * A category's emoji, drawn monochrome in the text colour (self-hosted Noto Emoji). A stored icon
 * is real text. With `name`, a category without one gets a fitting emoji drawn by CSS from
 * `data-emoji` (display only: not stored, not in the text content, not announced); without
 * `name`, an empty icon draws nothing (e.g. the live preview in the editor).
 */
export function CategoryIcon({ icon, name }: { icon: string | null; name?: string }) {
  const stored = icon?.trim();
  if (stored)
    return (
      <span className="emoji cat-icon" aria-hidden="true">
        {icon}
      </span>
    );
  return name === undefined ? null : (
    <span className="emoji cat-icon" aria-hidden="true" data-emoji={categoryEmoji(name)} />
  );
}
