Title block (Schriftfeld) page head on graph-paper raster: sheet/rev line, title, Stand line.

```jsx
const { BlueprintSchriftfeld } = window.BudgetBlueprintDesignSystem_63932b;
<BlueprintSchriftfeld text1="BLATT 02 / FINANZPLAN · REV 04" text2="Oktober 2026" text3="STAND 15.10.2026 / EUR" />
```

- Fixed Figma geometry; override size via `style`. Text via `text1…text4` (or `children` for the first text).
- Colours follow the Zielsystem tokens — wrap in `data-mode="dunkel"` for the Blueprint dark look.
