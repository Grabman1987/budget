import { categoryEmoji } from './category-emoji';

/**
 * A category's emoji, drawn monochrome in the text colour (self-hosted Noto Emoji). With `name`,
 * a category without an explicit icon gets one that fits its name (display only, nothing is
 * stored); without `name`, an empty icon draws nothing (e.g. the live preview in the editor).
 */
export function CategoryIcon({ icon, name }: { icon: string | null; name?: string }) {
  const emoji = name === undefined ? icon : categoryEmoji(name, icon);
  return emoji ? (
    <span className="emoji cat-icon" aria-hidden="true">
      {emoji}
    </span>
  ) : null;
}
