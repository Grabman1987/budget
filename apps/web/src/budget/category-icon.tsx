/** A category's emoji, drawn monochrome in the text colour (self-hosted Noto Emoji). */
export function CategoryIcon({ icon }: { icon: string | null }) {
  return icon ? (
    <span className="emoji cat-icon" aria-hidden="true">
      {icon}
    </span>
  ) : null;
}
